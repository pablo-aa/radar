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
  let costCapMessageSent = false;

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

        // Cost cap: if cumulative cost exceeds maxCostUsd, ask agent to stop.
        const currentCost = computeCostUsd(usage);
        if (currentCost >= maxCostUsd && !costCapMessageSent) {
          costCapMessageSent = true;
          await client.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: "user.message",
                content: [
                  {
                    type: "text",
                    text: `Cost cap of $${maxCostUsd.toFixed(2)} reached (current: $${currentCost.toFixed(4)}). Please stop processing new sources and return your summary now.`,
                  },
                ],
              },
            ],
          });
        }
      } else if (isAgentCustomToolUse(ev)) {
        if (ev.name === "upsert_opportunity") {
          const parsed = parseUpsertOpportunityInput(ev.input);
          let result: unknown;
          if (parsed) {
            // Inject scoutRunId if agent didn't provide it.
            const enriched: Record<string, unknown> = { ...parsed, scout_run_id: parsed["scout_run_id"] ?? scoutRunId };
            result = await executeUpsertOpportunity(enriched, scoutRunId);
            const r = result as { ok: boolean; id?: string; action?: "inserted" | "updated" };
            if (r.ok) {
              upserts++;
              if (r.id && r.action) {
                options?.onUpsert?.(r.id, r.action);
              }
            }
          } else {
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
            const enriched: Record<string, unknown> = { ...parsed, scout_run_id: parsed["scout_run_id"] ?? scoutRunId };
            result = await executeMarkDiscarded(enriched);
            const r = result as { ok: boolean };
            if (r.ok) discards++;
          } else {
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
