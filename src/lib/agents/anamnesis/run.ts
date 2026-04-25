import "server-only";

/* global Buffer */

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
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ITERATIONS = 12;
// 270s leaves a 30s budget for the chained Strategist dispatch inside the
// /api/intake/clarify-answers route (maxDuration=300). 180s was too tight:
// runs with rich CVs and many GitHub repos were finishing at 175-180s, and
// the clarify v2 prompt added ~500 tokens to system + 1-2k to user.
const TIMEOUT_MS = 270_000;

/** Maximum PDF byte size we will send to the model (2 MB). */
const CV_MAX_BYTES = 2 * 1024 * 1024;
/** Approximate page-count guard: 5 pages ~ 5*50KB = 250 KB but we use byte proxy below. */
const CV_MAX_PAGES_APPROX_BYTES = 5 * 100 * 1024; // ~500 KB as a proxy for 5 pages

// ---------------------------------------------------------------------------
// CV fetch helper
// ---------------------------------------------------------------------------

/**
 * Attempt to fetch the CV PDF from Supabase Storage and base64-encode it.
 * Returns null on any failure so the caller can proceed without the document.
 */
async function fetchCvBase64(cvPath: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from("cvs")
      .createSignedUrl(cvPath, 300); // 5-minute TTL

    if (error || !data?.signedUrl) {
      console.warn("[anamnesis/run] CV signed URL failed:", error?.message);
      return null;
    }

    const response = await globalThis.fetch(data.signedUrl);
    if (!response.ok) {
      console.warn("[anamnesis/run] CV fetch failed:", response.status, response.statusText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const byteLength = arrayBuffer.byteLength;

    if (byteLength > CV_MAX_BYTES) {
      console.warn(
        `[anamnesis/run] CV too large (${byteLength} bytes > ${CV_MAX_BYTES}), skipping document block`,
      );
      return null;
    }

    if (byteLength > CV_MAX_PAGES_APPROX_BYTES) {
      console.warn(
        `[anamnesis/run] CV may exceed 5-page cap (${byteLength} bytes), skipping document block`,
      );
      return null;
    }

    return Buffer.from(arrayBuffer).toString("base64");
  } catch (err) {
    console.warn("[anamnesis/run] CV fetch threw:", err instanceof Error ? err.message : err);
    return null;
  }
}

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

/**
 * Extract a JSON object from the model's free-form text. Handles three
 * common shapes:
 *   1. Pure JSON: "{...}"
 *   2. Markdown-fenced JSON: "```json\n{...}\n```"
 *   3. JSON with preamble or postamble: "Sure, here is the JSON: {...}"
 *
 * The slice between the first `{` and last `}` covers (1) and (3). Fence
 * stripping must run first because fences themselves contain `{` and `}`
 * but the slice approach also tolerates them — the inner JSON survives.
 */
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  // First pass: drop markdown fences if present.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  // Second pass: slice between the outermost braces. If the model added
  // any preamble or trailing prose, this trims it off.
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
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

  type DocumentBlock = {
    type: "document";
    source: { type: "base64"; media_type: "application/pdf"; data: string };
  };

  type MessageParam = {
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
          | { type: "tool_result"; tool_use_id: string; content: string }
          | DocumentBlock
        >;
  };

  // Attempt to fetch CV PDF bytes if a path was provided.
  const cvBase64 = input.cv_url ? await fetchCvBase64(input.cv_url) : null;
  const cvAttached = cvBase64 !== null;

  const firstUserContent: Array<
    { type: "text"; text: string } | DocumentBlock
  > = [
    {
      type: "text",
      text: buildUserMessage({
        handle: input.handle,
        profile: {
          display_name: input.display_name,
          email: input.email,
        },
        intake: input.intake,
        cvAttached,
      }),
    },
  ];

  if (cvAttached) {
    firstUserContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: cvBase64 },
    });
  }

  const messages: MessageParam[] = [
    {
      role: "user",
      content: firstUserContent,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Anthropic requires streaming for any single request that may exceed
    // 10 minutes. With max_tokens=32768 and the editorial report shape, we
    // are over that bar. Use the SDK helper which streams under the hood
    // and returns the fully-aggregated Message at the end — same downstream
    // shape, no parsing changes needed.
    const stream = client.messages.stream(
      {
        model: "claude-opus-4-7",
        max_tokens: 32768,
        system: ANAMNESIS_SYSTEM_PROMPT,
        tools: ANAMNESIS_TOOLS as unknown as Parameters<typeof client.messages.create>[0]["tools"],
        messages,
      },
      { signal },
    );
    const res = await stream.finalMessage();

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

    if (res.stop_reason === "max_tokens") {
      throw new Error(
        `Anamnesis agent hit max_tokens cap (${32_768}) before completing the JSON output. ` +
          `The output was truncated. Either reduce the report scope in the prompt, raise max_tokens further, ` +
          `or split into two separate calls (profile then report).`,
      );
    }

    throw new Error(
      `Anamnesis agent returned unexpected stop_reason: ${res.stop_reason}`,
    );
  }

  throw new Error(
    `Anamnesis tool loop exceeded maximum iterations (${MAX_ITERATIONS}).`,
  );
}
