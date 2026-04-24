import "server-only";

import type {
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsSpanModelRequestEndEvent,
  BetaManagedAgentsAgentCustomToolUseEvent,
  BetaManagedAgentsAgentMessageEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";

import { getAnthropicClient, getScoutAgentIds, ScoutNotConfiguredError } from "./client";
import { buildScoutMaUserMessage } from "./prompt";
import { computeCostUsd } from "@/lib/agents/strategist/pricing";
import {
  parseUpsertOpportunityInput,
  parseMarkDiscardedInput,
  parseSuggestSourceInput,
} from "./tool-spec";
import {
  executeUpsertOpportunity,
  executeMarkDiscarded,
  executeSuggestSource,
} from "./executors";
import type {
  ScoutSource,
  ScoutRunMeta,
  ScoutUsage,
  ScoutOutput,
  ScoutSessionHandle,
  ScoutDrainOptions,
  ScoutDrainResult,
} from "./types";

// ---------------------------------------------------------------------------
// Internal event type guards (mirror the Strategist pattern)
// ---------------------------------------------------------------------------

function isSpanModelRequestEnd(
  ev: BetaManagedAgentsStreamSessionEvents,
): ev is BetaManagedAgentsSpanModelRequestEndEvent {
  return ev.type === "span.model_request_end";
}

function isAgentCustomToolUse(
  ev: BetaManagedAgentsStreamSessionEvents,
): ev is BetaManagedAgentsAgentCustomToolUseEvent {
  return ev.type === "agent.custom_tool_use";
}

function isAgentMessage(
  ev: BetaManagedAgentsStreamSessionEvents,
): ev is BetaManagedAgentsAgentMessageEvent {
  return ev.type === "agent.message";
}

function isTerminal(ev: BetaManagedAgentsStreamSessionEvents): boolean {
  return (
    ev.type === "session.status_idle" ||
    ev.type === "session.status_terminated"
  );
}

function accumulateUsage(
  acc: ScoutUsage,
  ev: BetaManagedAgentsSpanModelRequestEndEvent,
): void {
  const mu = ev.model_usage;
  acc.input_tokens += mu.input_tokens;
  acc.output_tokens += mu.output_tokens;
  acc.cache_read_input_tokens += mu.cache_read_input_tokens;
  acc.cache_creation_input_tokens += mu.cache_creation_input_tokens;
}

// 15-minute hard timeout per session.
const HARD_TIMEOUT_MS = 15 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Thrown by drainSession when the hard cost cap is hit mid-stream.
 * runScoutPerSource catches this class specifically to stop the outer loop
 * without recording it as a source error.
 */
export class ScoutCostCapAbortError extends Error {
  constructor(capUsd: number, currentUsd: number) {
    super(`Scout hard cost cap of $${capUsd.toFixed(2)} hit at $${currentUsd.toFixed(4)}`);
    this.name = "ScoutCostCapAbortError";
  }
}

export interface RunScoutPerSourceOptions {
  /**
   * Hard global cap in USD. When reached, the active source aborts mid-stream
   * and no further sources are started.
   */
  maxCostUsd?: number;
  /** Called after each source completes (success or error). */
  onSourceComplete?: (info: {
    sourceIndex: number;
    totalSources: number;
    url: string;
    upsertsFromSource: number;
    suggestionsFromSource: number;
    costUsdFromSource: number;
    cumulativeCostUsd: number;
    error?: string;
  }) => void;
  abortSignal?: AbortSignal;
}

/**
 * Run Scout over `sources` with 1 source per MA session. Aggregates usage,
 * upsert/discard/suggestion counts, and cost into a single ScoutOutput.
 * A failed source is logged and skipped; the run continues with remaining sources.
 *
 * session_id in the returned output._meta is set to the first source's session_id.
 */
export async function runScoutPerSource(
  sources: ScoutSource[],
  scoutRunId: string,
  options?: RunScoutPerSourceOptions,
): Promise<ScoutOutput> {
  const maxCostUsd = options?.maxCostUsd ?? Infinity;
  const abortSignal = options?.abortSignal;
  const totalSources = sources.length;

  const totalUsage: ScoutUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  let totalUpserts = 0;
  let totalDiscards = 0;
  let totalSuggestions = 0;
  let totalFetches = 0;
  let totalIterations = 0;
  let sourcesProcessed = 0;
  let cumulativeCostUsd = 0;
  let firstSessionId: string | null = null;
  const startedAt = new Date().toISOString();
  const sourceErrors: Array<{ source_index: number; url: string; message: string }> = [];
  const runSummaryParts: string[] = [];

  for (let i = 0; i < totalSources; i++) {
    // Check abort signal before starting next source.
    if (abortSignal?.aborted) {
      console.log(`[scout] aborted before source ${i + 1}/${totalSources}`);
      break;
    }

    // Check cost budget before starting next source.
    const remaining = maxCostUsd - cumulativeCostUsd;
    if (remaining <= 0) {
      console.log(
        `[scout] cost cap reached ($${cumulativeCostUsd.toFixed(4)}), stopping before source ${i + 1}/${totalSources}`,
      );
      break;
    }

    const source = sources[i]!;

    try {
      const handle = await createScoutSession([source], scoutRunId);
      if (firstSessionId === null) firstSessionId = handle.session_id;

      const { output, meta } = await handle.drain({
        maxCostUsd: remaining,
        abortSignal,
      });

      // Accumulate.
      totalUsage.input_tokens += meta.usage.input_tokens;
      totalUsage.output_tokens += meta.usage.output_tokens;
      totalUsage.cache_read_input_tokens += meta.usage.cache_read_input_tokens;
      totalUsage.cache_creation_input_tokens += meta.usage.cache_creation_input_tokens;
      totalUpserts += meta.upserts;
      totalDiscards += meta.discards;
      totalSuggestions += meta.suggestions ?? 0;
      totalFetches += meta.fetches;
      totalIterations += meta.iterations;
      cumulativeCostUsd += meta.cost_usd;
      sourcesProcessed++;
      runSummaryParts.push(output.run_summary);

      options?.onSourceComplete?.({
        sourceIndex: i,
        totalSources,
        url: source.url,
        upsertsFromSource: meta.upserts,
        suggestionsFromSource: meta.suggestions ?? 0,
        costUsdFromSource: meta.cost_usd,
        cumulativeCostUsd,
      });
    } catch (err: unknown) {
      if (err instanceof ScoutCostCapAbortError) {
        // Hard cost cap hit mid-stream; stop the outer loop gracefully.
        console.log(`[scout] ${err.message} — stopping source loop`);
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[scout] source ${i + 1}/${totalSources} (${source.url}) failed: ${message}`,
      );
      sourceErrors.push({ source_index: i, url: source.url, message });

      options?.onSourceComplete?.({
        sourceIndex: i,
        totalSources,
        url: source.url,
        upsertsFromSource: 0,
        suggestionsFromSource: 0,
        costUsdFromSource: 0,
        cumulativeCostUsd,
        error: message,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const runSummary =
    runSummaryParts.join(" | ") ||
    `Scout run complete. Processed ${sourcesProcessed} sources, upserted ${totalUpserts}, discarded ${totalDiscards}, suggested ${totalSuggestions}.`;

  const meta: ScoutRunMeta = {
    model: "claude-opus-4-7",
    usage: totalUsage,
    cost_usd: cumulativeCostUsd,
    session_id: firstSessionId ?? "",
    started_at: startedAt,
    finished_at: finishedAt,
    fetches: totalFetches,
    upserts: totalUpserts,
    discards: totalDiscards,
    iterations: totalIterations,
    sources_processed: sourcesProcessed,
    suggestions: totalSuggestions,
    source_errors: sourceErrors,
  };

  return {
    run_summary: runSummary,
    visited: sourcesProcessed,
    upserted: totalUpserts,
    discarded: totalDiscards,
    _meta: meta,
  };
}

/**
 * Create a Scout session and return a handle with a drain() method.
 * Mirrors createStrategistSession from the Strategist module.
 */
export async function createScoutSession(
  sources: ScoutSource[],
  scoutRunId: string,
): Promise<ScoutSessionHandle> {
  let agentId: string;
  let environmentId: string;
  try {
    ({ agentId, environmentId } = getScoutAgentIds());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScoutNotConfiguredError(msg);
  }

  const client = getAnthropicClient();
  const session = await client.beta.sessions.create({
    environment_id: environmentId,
    agent: { type: "agent", id: agentId },
  });
  const sessionId = session.id;

  return {
    session_id: sessionId,
    drain: (options?: ScoutDrainOptions) =>
      drainSession(client, sessionId, sources, scoutRunId, options),
  };
}

// ---------------------------------------------------------------------------
// Drain implementation
// ---------------------------------------------------------------------------

async function drainSession(
  client: ReturnType<typeof getAnthropicClient>,
  sessionId: string,
  sources: ScoutSource[],
  scoutRunId: string,
  options?: ScoutDrainOptions,
): Promise<ScoutDrainResult> {
  const startedAt = new Date().toISOString();
  const maxCostUsd = options?.maxCostUsd ?? 5.0;

  const usage: ScoutUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  let fetches = 0;
  let upserts = 0;
  let discards = 0;
  let suggestions = 0;
  let iterations = 0;
  let lastAgentText = "";
  let costCapHit = false;

  const userText = buildScoutMaUserMessage(sources);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timeoutFired = false;
  let exitReason: "terminal" | "abort" | "stream_closed" | "error" = "stream_closed";
  let firstError: unknown = null;

  try {
    await client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: userText }],
        },
      ],
    });

    const stream = await client.beta.sessions.events.stream(sessionId);
    timeoutId = setTimeout(() => {
      timeoutFired = true;
      stream.controller.abort();
    }, HARD_TIMEOUT_MS);

    options?.abortSignal?.addEventListener(
      "abort",
      () => {
        stream.controller.abort();
      },
      { once: true },
    );

    for await (const ev of stream) {
      if (isSpanModelRequestEnd(ev)) {
        accumulateUsage(usage, ev);
        iterations++;
        const currentCost = computeCostUsd(usage);
        console.log(
          `[scout] iter=${iterations} upserts=${upserts} discards=${discards} suggestions=${suggestions} cost=$${currentCost.toFixed(4)}`,
        );

        // Cost cap: if cumulative cost exceeds maxCostUsd, hard-abort the stream.
        if (currentCost >= maxCostUsd && !costCapHit) {
          costCapHit = true;
          console.log(`[scout] cost cap $${maxCostUsd.toFixed(2)} hit at $${currentCost.toFixed(4)}, hard-aborting session`);
          stream.controller.abort();
          throw new ScoutCostCapAbortError(maxCostUsd, currentCost);
        }
      } else if (isAgentCustomToolUse(ev)) {
        if (ev.name === "upsert_opportunity") {
          const parsed = parseUpsertOpportunityInput(ev.input);
          let result: unknown;
          if (parsed) {
            const enriched: Record<string, unknown> = { ...parsed, scout_run_id: scoutRunId };
            result = await executeUpsertOpportunity(enriched, scoutRunId);
            const r = result as { ok: boolean; id?: string; action?: "inserted" | "updated" };
            if (r.ok) {
              upserts++;
              const title =
                typeof parsed === "object" &&
                parsed &&
                "title" in parsed &&
                typeof (parsed as { title: unknown }).title === "string"
                  ? (parsed as { title: string }).title.slice(0, 60)
                  : "(untitled)";
              console.log(`[scout] upsert #${upserts} [${r.action}] ${title}`);
              if (r.id && r.action) {
                options?.onUpsert?.(r.id, r.action);
              }
            } else {
              console.warn(`[scout] upsert failed:`, result);
            }
          } else {
            console.warn(
              `[scout] upsert_opportunity received invalid input:`,
              JSON.stringify(ev.input).slice(0, 200),
            );
            result = { ok: false, error: "invalid_input", detail: "invalid upsert_opportunity input" };
          }

          await client.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: ev.id,
                content: [{ type: "text", text: JSON.stringify(result) }],
              },
            ],
          });
        } else if (ev.name === "mark_discarded") {
          const parsed = parseMarkDiscardedInput(ev.input);
          let result: unknown;
          if (parsed) {
            const enriched: Record<string, unknown> = { ...parsed, scout_run_id: scoutRunId };
            result = await executeMarkDiscarded(enriched);
            const r = result as { ok: boolean };
            if (r.ok) {
              discards++;
              const host =
                typeof parsed === "object" &&
                parsed &&
                "host" in parsed &&
                typeof (parsed as { host: unknown }).host === "string"
                  ? (parsed as { host: string }).host
                  : "?";
              const reason =
                typeof parsed === "object" &&
                parsed &&
                "reason" in parsed &&
                typeof (parsed as { reason: unknown }).reason === "string"
                  ? (parsed as { reason: string }).reason
                  : "?";
              console.log(`[scout] discard #${discards} ${host} reason=${reason}`);
            } else {
              console.warn(`[scout] discard failed:`, result);
            }
          } else {
            console.warn(
              `[scout] mark_discarded received invalid input:`,
              JSON.stringify(ev.input).slice(0, 200),
            );
            result = { ok: false, error: "db_error", detail: "invalid mark_discarded input" };
          }

          await client.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: ev.id,
                content: [{ type: "text", text: JSON.stringify(result) }],
              },
            ],
          });
        } else if (ev.name === "suggest_source") {
          const parsed = parseSuggestSourceInput(ev.input);
          let result: unknown;
          if (parsed) {
            result = await executeSuggestSource(parsed, scoutRunId);
            const r = result as { ok: boolean; action?: string; url?: string };
            if (r.ok) {
              suggestions++;
              console.log(`[scout] suggest #${suggestions} [${r.action}] ${r.url ?? "?"}`);
            } else {
              console.warn(`[scout] suggest_source failed:`, result);
            }
          } else {
            console.warn(
              `[scout] suggest_source received invalid input:`,
              JSON.stringify(ev.input).slice(0, 200),
            );
            result = { ok: false, error: "invalid_input" };
          }

          await client.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: ev.id,
                content: [{ type: "text", text: JSON.stringify(result) }],
              },
            ],
          });
        } else {
          // Unknown custom tool -- return an error result so the session continues.
          await client.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: ev.id,
                is_error: true,
                content: [
                  { type: "text", text: JSON.stringify({ error: "unknown_tool", tool: ev.name }) },
                ],
              },
            ],
          });
        }
      } else if (isAgentMessage(ev)) {
        const preview = JSON.stringify(ev.content).slice(0, 200);
        console.log(`[scout] agent.message preview: ${preview}`);
        const text = ev.content
          .filter(
            (b): b is { type: "text"; text: string } =>
              typeof b === "object" &&
              b !== null &&
              "type" in b &&
              (b as { type: unknown }).type === "text" &&
              "text" in b &&
              typeof (b as { text: unknown }).text === "string",
          )
          .map((b) => b.text)
          .join("");
        if (text) lastAgentText = text;
      }

      if (isTerminal(ev)) {
        exitReason = "terminal";
        break;
      }
    }

    if (exitReason === "stream_closed" && timeoutFired) exitReason = "abort";
  } catch (err: unknown) {
    firstError = err;
    exitReason = timeoutFired ? "abort" : "error";
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    void firstError; // satisfy linter: referenced but not inspected
    await client.beta.sessions.delete(sessionId).catch(() => {
      // best-effort teardown
    });
  }

  const finishedAt = new Date().toISOString();
  const costUsd = computeCostUsd(usage);
  const runSummary =
    lastAgentText ||
    `Scout run complete. Visited ${sources.length} sources, upserted ${upserts}, discarded ${discards}, suggested ${suggestions}.`;

  const meta: ScoutRunMeta = {
    model: "claude-opus-4-7",
    usage,
    cost_usd: costUsd,
    session_id: sessionId,
    started_at: startedAt,
    finished_at: finishedAt,
    fetches,
    upserts,
    discards,
    suggestions,
    iterations,
  };

  const output: ScoutOutput = {
    run_summary: runSummary,
    visited: sources.length,
    upserted: upserts,
    discarded: discards,
    _meta: meta,
  };

  return { output, meta, session_id: sessionId };
}
