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
} from "./tool-spec";
import { executeUpsertOpportunity, executeMarkDiscarded } from "./executors";
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

// 15-minute hard timeout (matches brief spec).
const HARD_TIMEOUT_MS = 15 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Thrown by drainSession when the hard cost cap is hit mid-stream.
 * runScoutBatched catches this class specifically to stop the outer loop
 * without recording it as a batch error.
 */
export class ScoutCostCapAbortError extends Error {
  constructor(capUsd: number, currentUsd: number) {
    super(`Scout hard cost cap of $${capUsd.toFixed(2)} hit at $${currentUsd.toFixed(4)}`);
    this.name = "ScoutCostCapAbortError";
  }
}

export interface RunScoutBatchedOptions {
  /** Sources per MA session. Default 10. */
  batchSize?: number;
  /**
   * Hard global cap. When reached, the active batch aborts mid-stream and no
   * further batches are started.
   */
  maxCostUsd?: number;
  /** Called after each batch completes (success or error). */
  onBatchComplete?: (info: {
    batchIndex: number;
    totalBatches: number;
    sourcesInBatch: number;
    upsertsInBatch: number;
    discardsInBatch: number;
    costUsdInBatch: number;
    cumulativeCostUsd: number;
  }) => void;
  abortSignal?: AbortSignal;
}

/**
 * Run Scout over `sources` in batches of `batchSize`, each as a separate MA
 * session. Aggregates usage, upsert/discard counts, and cost into a single
 * ScoutDrainResult. A failed batch is logged and skipped; the run continues
 * with the remaining batches.
 *
 * session_id in the returned meta is set to the first batch's session_id.
 * All session IDs are available only in per-batch logs.
 */
export async function runScoutBatched(
  sources: ScoutSource[],
  scoutRunId: string,
  options?: RunScoutBatchedOptions,
): Promise<ScoutDrainResult> {
  const batchSize = options?.batchSize ?? 10;
  const maxCostUsd = options?.maxCostUsd ?? Infinity;
  const abortSignal = options?.abortSignal;

  // Split sources into chunks.
  const chunks: ScoutSource[][] = [];
  for (let i = 0; i < sources.length; i += batchSize) {
    chunks.push(sources.slice(i, i + batchSize));
  }
  const totalBatches = chunks.length;

  const totalUsage: ScoutUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  let totalUpserts = 0;
  let totalDiscards = 0;
  let totalFetches = 0;
  let totalIterations = 0;
  let totalVisited = 0;
  let cumulativeCostUsd = 0;
  let firstSessionId: string | null = null;
  const startedAt = new Date().toISOString();
  const batchErrors: Array<{ batch_index: number; message: string }> = [];
  const runSummaryParts: string[] = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    // Check abort signal before starting next batch.
    if (abortSignal?.aborted) {
      console.log(`[scout] aborted before batch ${batchIndex + 1}/${totalBatches}`);
      break;
    }

    // Check cost budget before starting next batch.
    const remaining = maxCostUsd - cumulativeCostUsd;
    if (remaining <= 0) {
      console.log(
        `[scout] cost cap reached ($${cumulativeCostUsd.toFixed(4)}), stopping before batch ${batchIndex + 1}/${totalBatches}`,
      );
      break;
    }

    const chunk = chunks[batchIndex]!;

    try {
      const handle = await createScoutSession(chunk, scoutRunId);
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
      totalFetches += meta.fetches;
      totalIterations += meta.iterations;
      totalVisited += output.visited;
      cumulativeCostUsd += meta.cost_usd;
      runSummaryParts.push(output.run_summary);

      options?.onBatchComplete?.({
        batchIndex,
        totalBatches,
        sourcesInBatch: chunk.length,
        upsertsInBatch: meta.upserts,
        discardsInBatch: meta.discards,
        costUsdInBatch: meta.cost_usd,
        cumulativeCostUsd,
      });
    } catch (err: unknown) {
      if (err instanceof ScoutCostCapAbortError) {
        // Hard cost cap hit mid-stream; stop the outer loop gracefully.
        console.log(`[scout] ${err.message} — stopping batch loop`);
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[scout] batch ${batchIndex + 1}/${totalBatches} failed: ${message}`,
      );
      batchErrors.push({ batch_index: batchIndex, message });

      options?.onBatchComplete?.({
        batchIndex,
        totalBatches,
        sourcesInBatch: chunk.length,
        upsertsInBatch: 0,
        discardsInBatch: 0,
        costUsdInBatch: 0,
        cumulativeCostUsd,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const runSummary =
    runSummaryParts.join(" | ") ||
    `Scout batched run complete. Visited ${totalVisited} sources, upserted ${totalUpserts}, discarded ${totalDiscards}.`;

  const meta: ScoutRunMeta = {
    model: "claude-opus-4-7",
    usage: totalUsage,
    cost_usd: cumulativeCostUsd,
    // Use the first batch's session_id. All session IDs are logged per-batch.
    session_id: firstSessionId ?? "",
    started_at: startedAt,
    finished_at: finishedAt,
    fetches: totalFetches,
    upserts: totalUpserts,
    discards: totalDiscards,
    iterations: totalIterations,
    batches: totalBatches,
    batch_errors: batchErrors,
  };

  const output: ScoutOutput = {
    run_summary: runSummary,
    visited: totalVisited,
    upserted: totalUpserts,
    discarded: totalDiscards,
    _meta: meta,
  };

  return { output, meta, session_id: firstSessionId ?? "" };
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
  let iterations = 0;
  let lastAgentText = "";
  let costCapHit = false;
  let nudgeCount = 0;

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
          `[scout] iter=${iterations} progress=${upserts + discards}/${sources.length} upserts=${upserts} discards=${discards} cost=$${currentCost.toFixed(4)}`,
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
            // scout_run_id is authoritative from the caller; the agent's value is ignored.
            const enriched: Record<string, unknown> = { ...parsed, scout_run_id: scoutRunId };
            result = await executeUpsertOpportunity(enriched, scoutRunId);
            const r = result as { ok: boolean; id?: string; action?: "inserted" | "updated" };
            if (r.ok) {
              upserts++;
              const title = typeof parsed === "object" && parsed && "title" in parsed && typeof (parsed as { title: unknown }).title === "string" ? (parsed as { title: string }).title.slice(0, 60) : "(untitled)";
              console.log(`[scout] upsert #${upserts} [${r.action}] ${title}`);
              if (r.id && r.action) {
                options?.onUpsert?.(r.id, r.action);
              }
            } else {
              console.warn(`[scout] upsert failed:`, result);
            }
          } else {
            console.warn(`[scout] upsert_opportunity received invalid input:`, JSON.stringify(ev.input).slice(0, 200));
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
            // scout_run_id is authoritative from the caller; the agent's value is ignored.
            const enriched: Record<string, unknown> = { ...parsed, scout_run_id: scoutRunId };
            result = await executeMarkDiscarded(enriched);
            const r = result as { ok: boolean };
            if (r.ok) {
              discards++;
              const host = typeof parsed === "object" && parsed && "host" in parsed && typeof (parsed as { host: unknown }).host === "string" ? (parsed as { host: string }).host : "?";
              const reason = typeof parsed === "object" && parsed && "reason" in parsed && typeof (parsed as { reason: unknown }).reason === "string" ? (parsed as { reason: string }).reason : "?";
              console.log(`[scout] discard #${discards} ${host} reason=${reason}`);
            } else {
              console.warn(`[scout] discard failed:`, result);
            }
          } else {
            console.warn(`[scout] mark_discarded received invalid input:`, JSON.stringify(ev.input).slice(0, 200));
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
        } else {
          // Unknown custom tool -- return an error result so the session continues.
          await client.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: ev.id,
                is_error: true,
                content: [{ type: "text", text: JSON.stringify({ error: "unknown_tool", tool: ev.name }) }],
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
        const committed = upserts + discards;
        const target = sources.length;
        // If the agent went idle before committing every source, wake it up
        // with a continuation message. Skip when the cost cap already fired
        // (the stream is about to abort anyway). Cap at 3 nudges to avoid
        // infinite loops when the agent refuses to continue.
        if (
          ev.type === "session.status_idle" &&
          committed < target &&
          nudgeCount < 3 &&
          !costCapHit
        ) {
          nudgeCount++;
          console.log(
            `[scout] idle at ${committed}/${target}, nudging (attempt ${nudgeCount}/3)`,
          );
          try {
            await client.beta.sessions.events.send(sessionId, {
              events: [
                {
                  type: "user.message",
                  content: [
                    {
                      type: "text",
                      text:
                        `You stopped at ${committed}/${target} sources committed. ` +
                        `You still need to emit upsert_opportunity or mark_discarded for ${target - committed} more sources. ` +
                        `Resume processing the remaining sources from the list now. ` +
                        `Do not write a summary until all ${target} sources are committed.`,
                    },
                  ],
                },
              ],
            });
            continue;
          } catch (nudgeErr: unknown) {
            console.warn(
              `[scout] nudge send failed, treating as terminal:`,
              nudgeErr instanceof Error ? nudgeErr.message : nudgeErr,
            );
            exitReason = "terminal";
            break;
          }
        }
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
    `Scout run complete. Visited ${sources.length} sources, upserted ${upserts}, discarded ${discards}.`;

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
