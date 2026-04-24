import "server-only";
import { getAnthropicClient } from "@/lib/agents/strategist/client";
import { computeCostUsd } from "@/lib/agents/strategist/pricing";
import { ANAMNESIS_SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { ANAMNESIS_TOOLS, executeAnamnosisTool } from "./tools";
import type {
  AnamnesisInput,
  AnamnesisOutput,
  AnamnesisProfile,
  AnamnesisUsage,
  AnamnesisContentBlock,
} from "./types";
import type { AnamnesisReport } from "@/lib/sample-data/anamnesis-report";

const MAX_ITERATIONS = 12;
const TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isToolUseBlock(
  block: AnamnesisContentBlock,
): block is Extract<AnamnesisContentBlock, { type: "tool_use" }> {
  return block.type === "tool_use";
}

function isTextBlock(
  block: AnamnesisContentBlock,
): block is Extract<AnamnesisContentBlock, { type: "text" }> {
  return block.type === "text";
}

/** Strip markdown code fences if the model wrapped the JSON. */
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  // ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

function parseProfileJson(raw: string): AnamnesisProfile {
  const cleaned = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Anamnesis agent returned non-JSON final response: ${String(err)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Anamnesis agent final response was not a JSON object.");
  }
  const outer = parsed as Record<string, unknown>;

  // Accept both the new wrapper { profile, report } and the legacy flat profile.
  const obj: Record<string, unknown> =
    typeof outer["profile"] === "object" &&
    outer["profile"] !== null &&
    !Array.isArray(outer["profile"])
      ? (outer["profile"] as Record<string, unknown>)
      : outer;

  // Validate required string fields.
  const requireString = (key: string): string => {
    const v = obj[key];
    if (typeof v === "string") return v;
    throw new Error(`AnamnesisProfile missing or invalid field: ${key}`);
  };
  const requireStringArray = (key: string): string[] => {
    const v = obj[key];
    if (!Array.isArray(v)) throw new Error(`AnamnesisProfile field ${key} must be an array`);
    return v.map((item, i) => {
      if (typeof item !== "string") throw new Error(`AnamnesisProfile.${key}[${i}] must be a string`);
      return item;
    });
  };
  const requireOssSignals = (): AnamnesisProfile["oss_signals"] => {
    const v = obj["oss_signals"];
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      throw new Error("AnamnesisProfile missing oss_signals object");
    }
    const oss = v as Record<string, unknown>;
    const toStringArray = (k: string): string[] => {
      const arr = oss[k];
      if (!Array.isArray(arr)) return [];
      return arr.filter((x): x is string => typeof x === "string");
    };
    return {
      maintainer_of: toStringArray("maintainer_of"),
      top_contributions: toStringArray("top_contributions"),
      primary_languages: toStringArray("primary_languages"),
    };
  };

  return {
    summary_one_line: requireString("summary_one_line"),
    trajectory: requireString("trajectory"),
    strengths: requireStringArray("strengths"),
    domains: requireStringArray("domains"),
    oss_signals: requireOssSignals(),
    interests: requireStringArray("interests"),
    goals: requireStringArray("goals"),
    narrative_voice: requireString("narrative_voice"),
    weak_spots: requireStringArray("weak_spots"),
    cited_profile_fields: requireStringArray("cited_profile_fields"),
  };
}

function parseReportJson(raw: string): AnamnesisReport {
  const cleaned = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Anamnesis agent returned non-JSON for report: ${String(err)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Anamnesis agent report was not a JSON object.");
  }
  const outer = parsed as Record<string, unknown>;

  // The report lives at outer.report when the new wrapper is used.
  const obj: Record<string, unknown> =
    typeof outer["report"] === "object" &&
    outer["report"] !== null &&
    !Array.isArray(outer["report"])
      ? (outer["report"] as Record<string, unknown>)
      : outer;

  // Require the four sentinel fields the /report page checks for.
  const required = ["meta", "headline", "timeline", "archetype"] as const;
  for (const key of required) {
    if (typeof obj[key] !== "object" || obj[key] === null) {
      throw new Error(
        `AnamnesisReport missing required section: "${key}". Agent output may be truncated or malformed.`,
      );
    }
  }

  // Cast to AnamnesisReport. Detailed field validation would be verbose and
  // the render components handle missing optional fields gracefully, so we
  // trust the shape after the sentinel check.
  return obj as unknown as AnamnesisReport;
}

/** Parse the full wrapper { profile, report } from the agent's final text. */
function parseOutputJson(raw: string): {
  profile: AnamnesisProfile;
  report: AnamnesisReport;
} {
  const profile = parseProfileJson(raw);
  const report = parseReportJson(raw);
  return { profile, report };
}

// ---------------------------------------------------------------------------
// Main run function
// ---------------------------------------------------------------------------

export async function runAnamnesis(
  input: AnamnesisInput,
  options?: { abortSignal?: AbortSignal },
): Promise<AnamnesisOutput> {
  const client = getAnthropicClient();
  const startedAt = new Date().toISOString();

  // Merge caller's AbortSignal with our hard timeout.
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const signal = options?.abortSignal
    ? AbortSignal.any([options.abortSignal, timeoutSignal])
    : timeoutSignal;

  const usage: AnamnesisUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  let toolCalls = 0;

  type MessageParam = {
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
          | { type: "tool_result"; tool_use_id: string; content: string }
        >;
  };

  const messages: MessageParam[] = [
    {
      role: "user",
      content: buildUserMessage({
        handle: input.handle,
        profile: {
          display_name: input.display_name,
          email: input.email,
        },
        intake: input.intake,
      }),
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await client.messages.create(
      {
        model: "claude-opus-4-7",
        max_tokens: 16384,
        system: ANAMNESIS_SYSTEM_PROMPT,
        tools: ANAMNESIS_TOOLS as unknown as Parameters<typeof client.messages.create>[0]["tools"],
        messages,
      },
      { signal },
    );

    // Accumulate usage from every turn.
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    usage.cache_read_input_tokens += res.usage.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens += res.usage.cache_creation_input_tokens ?? 0;

    if (res.stop_reason === "tool_use") {
      // Collect all tool_use blocks from this response.
      const toolUseBlocks = (res.content as AnamnesisContentBlock[]).filter(
        isToolUseBlock,
      );

      // Push the assistant turn with its full content.
      messages.push({
        role: "assistant",
        content: res.content as MessageParam["content"],
      });

      // Execute tools and collect results.
      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
      }> = [];

      for (const block of toolUseBlocks) {
        toolCalls++;
        const result = await executeAnamnosisTool(block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      // Push the user turn with all tool results.
      messages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    if (res.stop_reason === "end_turn") {
      // Find the final text block.
      const textBlocks = (res.content as AnamnesisContentBlock[]).filter(
        isTextBlock,
      );
      const finalText = textBlocks.map((b) => b.text).join("").trim();

      if (!finalText) {
        throw new Error(
          "Anamnesis agent reached end_turn with no text content.",
        );
      }

      const { profile, report } = parseOutputJson(finalText);
      const finishedAt = new Date().toISOString();
      const costUsd = computeCostUsd(usage);

      const output: AnamnesisOutput = {
        profile,
        report,
        _meta: {
          model: "claude-opus-4-7",
          usage,
          cost_usd: costUsd,
          started_at: startedAt,
          finished_at: finishedAt,
          tool_calls: toolCalls,
        },
      };

      return output;
    }

    throw new Error(
      `Anamnesis agent returned unexpected stop_reason: ${res.stop_reason}`,
    );
  }

  throw new Error(
    `Anamnesis tool loop exceeded maximum iterations (${MAX_ITERATIONS}).`,
  );
}
