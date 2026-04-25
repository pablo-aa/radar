import "server-only";

import { getAnthropicClient } from "@/lib/agents/strategist/client";
import {
  INTAKE_CLARIFY_SYSTEM_PROMPT,
  buildClarifyUserMessage,
} from "./prompt";
import type { ClarifyQuestion, ClarifyQuestionSet } from "./types";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 2048;

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first >= 0 && last > first) return candidate.slice(first, last + 1);
  return candidate;
}

function isClarifyQuestion(v: unknown): v is ClarifyQuestion {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.question === "string" &&
    typeof o.context === "string" &&
    typeof o.placeholder === "string" &&
    (o.kind === "short" || o.kind === "long")
  );
}

export async function generateClarifyQuestions(input: {
  handle: string;
  display_name: string | null;
  city: string | null;
  github: {
    bio: string | null;
    company: string | null;
    location: string | null;
    public_repos: number;
    followers: number;
    created_at: string;
  } | null;
  intake: {
    moment_text?: string;
    declared_interests?: string[];
    site_url?: string;
    cv_attached: boolean;
  };
}): Promise<ClarifyQuestionSet> {
  const client = getAnthropicClient();

  const userMessage = buildClarifyUserMessage(input);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: INTAKE_CLARIFY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textParts = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text);
  const finalText = textParts.join("").trim();
  if (!finalText) {
    throw new Error("clarify agent returned no text block");
  }

  const cleaned = stripFences(finalText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("clarify agent returned non-JSON output");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("clarify agent output was not an object");
  }
  const obj = parsed as Record<string, unknown>;
  const rawQuestions = obj.questions;
  if (!Array.isArray(rawQuestions)) {
    throw new Error("clarify agent output missing questions[] array");
  }

  const questions: ClarifyQuestion[] = [];
  const seenIds = new Set<string>();
  for (const q of rawQuestions) {
    if (!isClarifyQuestion(q)) continue;
    if (seenIds.has(q.id)) continue;
    seenIds.add(q.id);
    questions.push(q);
    if (questions.length >= 5) break;
  }

  if (questions.length === 0) {
    throw new Error("clarify agent returned zero valid questions");
  }

  return {
    questions,
    generated_at: new Date().toISOString(),
    model: MODEL,
  };
}
