import "server-only";
import type {
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsSpanModelRequestEndEvent,
  BetaManagedAgentsAgentCustomToolUseEvent,
  BetaManagedAgentsAgentMessageEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";
import { getAnthropicClient, getStrategistIds, StrategistNotConfiguredError } from "./client";
import { createCardBuffer, transformCardsToOutput } from "./card-buffer";
import { computeCostUsd } from "./pricing";
import { buildUserMessage } from "./prompt";
import { parseRenderCardInput } from "./tool-spec";
import type {
  BulkScore,
  FitBand,
  RenderedCard,
  StrategistInput,
  StrategistOutput,
  StrategistRunMeta,
  UsageSummary,
} from "./types";

const VALID_BANDS: ReadonlySet<FitBand> = new Set([
  "high",
  "medium",
  "low",
  "exclude",
]);

/**
 * Parse the ALL_SCORES_BEGIN ... ALL_SCORES_END block out of the agent's
 * final message text. Defensive: returns an empty score list and the
 * unchanged text if the block is missing, malformed, or the JSON is invalid.
 *
 * Also strips the block out of the text so what remains is the run_summary.
 */
function parseAllScoresBlock(text: string): {
  scores: BulkScore[];
  cleanText: string;
} {
  const BEGIN = "ALL_SCORES_BEGIN";
  const END = "ALL_SCORES_END";
  const beginIdx = text.indexOf(BEGIN);
  if (beginIdx < 0) return { scores: [], cleanText: text };
  const endIdx = text.indexOf(END, beginIdx);
  if (endIdx < 0) return { scores: [], cleanText: text };

  // Extract from first `[` after BEGIN to last `]` before END.
  const jsonStart = text.indexOf("[", beginIdx + BEGIN.length);
  const jsonEnd = text.lastIndexOf("]", endIdx);
  if (jsonStart < 0 || jsonEnd < 0 || jsonEnd < jsonStart) {
    return { scores: [], cleanText: text };
  }
  const jsonText = text.slice(jsonStart, jsonEnd + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { scores: [], cleanText: text };
  }
  if (!Array.isArray(parsed)) return { scores: [], cleanText: text };

  const scores: BulkScore[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const oppId = obj.opportunity_id;
    const fitScore = obj.fit_score;
    const fitBand = obj.fit_band;
    if (typeof oppId !== "string" || oppId.length === 0) continue;
    if (typeof fitScore !== "number" || !Number.isFinite(fitScore)) continue;
    if (typeof fitBand !== "string") continue;
    if (!VALID_BANDS.has(fitBand as FitBand)) continue;
    if (seen.has(oppId)) continue;
    seen.add(oppId);
    scores.push({
      opportunity_id: oppId,
      fit_score: Math.max(0, Math.min(100, Math.round(fitScore))),
      fit_band: fitBand as FitBand,
    });
  }

  const cleanText = (
    text.slice(0, beginIdx) + text.slice(endIdx + END.length)
  )
    .replace(/```\s*$/g, "")
    .trim();
  return { scores, cleanText };
}

// ---------------------------------------------------------------------------
// Internal helpers
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
  acc: UsageSummary,
  ev: BetaManagedAgentsSpanModelRequestEndEvent,
): void {
  const mu = ev.model_usage;
  acc.input_tokens += mu.input_tokens;
  acc.output_tokens += mu.output_tokens;
  acc.cache_read_input_tokens += mu.cache_read_input_tokens;
  acc.cache_creation_input_tokens += mu.cache_creation_input_tokens;
}

// ---------------------------------------------------------------------------
// Session seam: createStrategistSession + drain
// ---------------------------------------------------------------------------

export interface DrainResult {
  output: StrategistOutput;
  meta: StrategistRunMeta;
  session_id: string;
}

export interface DrainOptions {
  onCard?: (card: RenderedCard, index: number) => void;
  abortSignal?: AbortSignal;
}

export interface SessionHandle {
  session_id: string;
  drain(options?: DrainOptions): Promise<DrainResult>;
}

/**
 * Create a Managed Agent session and return a handle with a drain() method.
 * The route calls createStrategistSession(), writes the "running" row with
 * session_id, then calls drain() so the DB row exists before the stream starts.
 */
export async function createStrategistSession(
  input: StrategistInput,
): Promise<SessionHandle> {
  let agentId: string;
  let environmentId: string;
  try {
    ({ agentId, environmentId } = getStrategistIds());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new StrategistNotConfiguredError(msg);
  }

  const client = getAnthropicClient();
  const session = await client.beta.sessions.create({
    environment_id: environmentId,
    agent: { type: "agent", id: agentId },
  });
  const sessionId = session.id;

  return {
    session_id: sessionId,
    drain: (options?: DrainOptions) =>
      drainSession(client, sessionId, input, options),
  };
}

// ---------------------------------------------------------------------------
// Drain implementation
// ---------------------------------------------------------------------------

async function drainSession(
  client: ReturnType<typeof getAnthropicClient>,
  sessionId: string,
  input: StrategistInput,
  options?: DrainOptions,
): Promise<DrainResult> {
  const startedAt = new Date().toISOString();
  const buffer = createCardBuffer();
  const usage: UsageSummary = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  let lastAgentText = "";

  const profileJson = JSON.stringify(input.profile, null, 2);
  const opportunitiesJson = JSON.stringify(input.opportunities, null, 2);
  const userText = buildUserMessage(profileJson, opportunitiesJson);

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
    }, 240_000);
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
      } else if (isAgentCustomToolUse(ev) && ev.name === "render_card") {
        const parsed = parseRenderCardInput(ev.input);
        if (parsed) {
          const card: RenderedCard = {
            section: parsed.section,
            opportunity_id: parsed.opportunity_id,
            title: parsed.title,
            why_you: parsed.why_you,
            fit_score: parsed.fit_score,
            source_url: parsed.source_url,
            extra: parsed.extra,
          };
          const index = buffer.push(card);
          options?.onCard?.(card, index);
          await client.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: ev.id,
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ ok: true, card_index: index }),
                  },
                ],
              },
            ],
          });
        } else {
          await client.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: "user.custom_tool_result",
                custom_tool_use_id: ev.id,
                is_error: true,
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ ok: false, error: "invalid render_card input" }),
                  },
                ],
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
        if (text) {
          lastAgentText = text;
        }
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
    void firstError; // referenced to satisfy linter
    await client.beta.sessions.delete(sessionId).catch(() => {
      // best-effort teardown
    });
  }

  const finishedAt = new Date().toISOString();
  // Extract the bulk-scoring block from the agent's final message.
  // Falls back to an empty array if the agent skipped it; the UI then
  // degrades to "—/100" for non-picks.
  const { scores: allScores, cleanText } = parseAllScoresBlock(lastAgentText);
  const runSummary = cleanText || "Strategist run complete.";
  const transformed = transformCardsToOutput(
    buffer.getCards(),
    runSummary,
    allScores,
  );
  const costUsd = computeCostUsd(usage);
  console.log("[strategist/run-agent] bulk scores parsed", {
    session_id: sessionId,
    score_count: allScores.length,
  });

  const meta: StrategistRunMeta = {
    usage,
    cost_usd: costUsd,
    session_id: sessionId,
    model: "claude-opus-4-7",
    started_at: startedAt,
    finished_at: finishedAt,
  };

  const output: StrategistOutput = {
    ...transformed,
    _meta: meta,
  };

  return { output, meta, session_id: sessionId };
}
