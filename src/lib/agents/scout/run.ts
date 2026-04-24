import "server-only";

import { getAnthropicClient } from "@/lib/agents/strategist/client";
import { computeCostUsd } from "@/lib/agents/strategist/pricing";
import { SCOUT_SYSTEM_PROMPT, buildScoutUserMessage } from "./prompt";
import { SCOUT_TOOLS, executeScoutTool } from "./tools";
import type { ScoutSource, ScoutOutput, ScoutUsage } from "./types";
import type {
  MessageParam,
  ContentBlock as SdkContentBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";

const MAX_ITERATIONS = 30;
const TIMEOUT_MS = 900_000; // 15 minutes
const DEFAULT_MAX_COST_USD = 5.0;

// ---------------------------------------------------------------------------
// Content block type guards
// ---------------------------------------------------------------------------

function isToolUseBlock(
  block: SdkContentBlock,
): block is Extract<SdkContentBlock, { type: "tool_use" }> {
  return block.type === "tool_use";
}

function isTextBlock(
  block: SdkContentBlock,
): block is Extract<SdkContentBlock, { type: "text" }> {
  return block.type === "text";
}

// ---------------------------------------------------------------------------
// Parse final JSON from end_turn text
// ---------------------------------------------------------------------------

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

function parseScoutSummary(raw: string): {
  run_summary: string;
  visited: number;
  upserted: number;
  discarded: number;
} {
  const cleaned = stripFences(raw);
  let parsed: unknown;
  try {
    // Try to find JSON object in the text even if surrounded by prose.
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
  } catch {
    // Fallback: return the raw text as run_summary.
    return { run_summary: raw.slice(0, 500), visited: 0, upserted: 0, discarded: 0 };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { run_summary: raw.slice(0, 500), visited: 0, upserted: 0, discarded: 0 };
  }
  const obj = parsed as Record<string, unknown>;
  return {
    run_summary: typeof obj["run_summary"] === "string" ? obj["run_summary"] : "",
    visited: typeof obj["visited"] === "number" ? obj["visited"] : 0,
    upserted: typeof obj["upserted"] === "number" ? obj["upserted"] : 0,
    discarded: typeof obj["discarded"] === "number" ? obj["discarded"] : 0,
  };
}

// ---------------------------------------------------------------------------
// Main run function
// ---------------------------------------------------------------------------

export async function runScout(
  sources: ScoutSource[],
  scoutRunId: string,
  options?: { abortSignal?: AbortSignal; maxCostUsd?: number },
): Promise<ScoutOutput> {
  const client = getAnthropicClient();
  const startedAt = new Date().toISOString();
  const maxCostUsd = options?.maxCostUsd ?? DEFAULT_MAX_COST_USD;

  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const signal = options?.abortSignal
    ? AbortSignal.any([options.abortSignal, timeoutSignal])
    : timeoutSignal;

  const usage: ScoutUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  let iterations = 0;
  let scopeRejections = 0;
  let costCapReached = false;

  const messages: MessageParam[] = [
    {
      role: "user",
      content: buildScoutUserMessage(sources),
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations = i + 1;

    const res = await client.messages.create(
      {
        model: "claude-opus-4-7",
        max_tokens: 16384,
        system: SCOUT_SYSTEM_PROMPT,
        tools: SCOUT_TOOLS as unknown as Parameters<
          typeof client.messages.create
        >[0]["tools"],
        messages,
      },
      { signal },
    );

    // Accumulate usage.
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    usage.cache_read_input_tokens += res.usage.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens +=
      res.usage.cache_creation_input_tokens ?? 0;

    const cumulativeCost = computeCostUsd(usage);
    console.log(
      `[scout] iteration=${iterations} stop_reason=${res.stop_reason} cumulative_cost=$${cumulativeCost.toFixed(4)}`,
    );

    if (res.stop_reason === "tool_use") {
      const toolUseBlocks = (res.content as SdkContentBlock[]).filter(
        isToolUseBlock,
      );

      messages.push({
        role: "assistant",
        content: res.content as MessageParam["content"],
      });

      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
      }> = [];

      for (const block of toolUseBlocks) {
        // Narrow input from unknown to Record<string, unknown>.
        const blockInput: Record<string, unknown> =
          typeof block.input === "object" &&
          block.input !== null &&
          !Array.isArray(block.input)
            ? (block.input as Record<string, unknown>)
            : {};

        // Track scope rejections from mark_discarded calls.
        if (block.name === "mark_discarded") {
          const reason = blockInput["reason"];
          if (reason === "out-of-scope") scopeRejections++;
        }

        const result = await executeScoutTool(block.name, blockInput, scoutRunId);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({
        role: "user",
        content: toolResults,
      });

      // Cost cap check after executing tools.
      if (cumulativeCost >= maxCostUsd && !costCapReached) {
        costCapReached = true;
        console.warn(
          `[scout] cost cap reached ($${cumulativeCost.toFixed(4)} >= $${maxCostUsd}), sending stop message`,
        );
        messages.push({
          role: "user",
          content:
            "Cost cap reached. Stop processing new sources immediately. Return the JSON summary now with what has been completed so far.",
        });
      }

      continue;
    }

    if (res.stop_reason === "end_turn") {
      const textBlocks = (res.content as SdkContentBlock[]).filter(isTextBlock);
      const finalText = textBlocks.map((b) => b.text).join("").trim();

      const { run_summary, visited, upserted, discarded } =
        parseScoutSummary(finalText);

      const finishedAt = new Date().toISOString();
      const costUsd = computeCostUsd(usage);

      console.log(
        `[scout] done run_id=${scoutRunId} visited=${visited} upserted=${upserted} discarded=${discarded} cost=$${costUsd.toFixed(4)}`,
      );

      return {
        run_summary,
        visited,
        upserted,
        discarded,
        _meta: {
          model: "claude-opus-4-7",
          usage,
          cost_usd: costUsd,
          started_at: startedAt,
          finished_at: finishedAt,
          iterations,
          scope_rejections: scopeRejections,
        },
      };
    }

    throw new Error(
      `Scout agent returned unexpected stop_reason: ${res.stop_reason}`,
    );
  }

  throw new Error(
    `Scout tool loop exceeded maximum iterations (${MAX_ITERATIONS}).`,
  );
}
