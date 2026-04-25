import "server-only";

import { getAnthropicClient } from "@/lib/agents/strategist/client";
import {
  INTAKE_CLARIFY_SYSTEM_PROMPT,
  buildClarifyUserMessage,
} from "./prompt";
import type {
  ClarifyQuestion,
  ClarifyQuestionCategory,
  ClarifyQuestionKind,
  ClarifyQuestionOption,
  ClarifyQuestionSet,
} from "./types";

const PRIMARY_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_MODEL = "claude-sonnet-4-6-20251001";
const MAX_TOKENS = 2048;

const ALLOWED_CATEGORIES: ReadonlySet<ClarifyQuestionCategory> = new Set([
  "intensity",
  "role_precision",
  "disambiguation",
  "status",
]);

const ALLOWED_KINDS: ReadonlySet<ClarifyQuestionKind> = new Set([
  "single_choice",
  "multi_choice",
  "scale",
  "short_text",
]);

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first >= 0 && last > first) return candidate.slice(first, last + 1);
  return candidate;
}

function isOption(v: unknown): v is ClarifyQuestionOption {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.value === "string" && typeof o.label === "string";
}

function validateQuestion(v: unknown): ClarifyQuestion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  if (typeof o.question !== "string" || !o.question.trim()) return null;
  if (typeof o.context !== "string") return null;

  const category = o.category;
  if (typeof category !== "string" || !ALLOWED_CATEGORIES.has(category as ClarifyQuestionCategory)) {
    return null;
  }
  const kind = o.kind;
  if (typeof kind !== "string" || !ALLOWED_KINDS.has(kind as ClarifyQuestionKind)) {
    return null;
  }
  let options: ClarifyQuestionOption[] | undefined;
  if (Array.isArray(o.options)) {
    const filtered = o.options.filter(isOption);
    options = filtered.length > 0 ? filtered : undefined;
  }
  if (kind !== "short_text" && (!options || options.length < 2)) {
    return null;
  }
  if (kind === "short_text" && options) {
    options = undefined;
  }
  // Dedupe option values per question.
  if (options) {
    const seen = new Set<string>();
    options = options.filter((opt) => {
      if (seen.has(opt.value)) return false;
      seen.add(opt.value);
      return true;
    });
  }

  const allow_other = typeof o.allow_other === "boolean" ? o.allow_other : false;
  const placeholder =
    typeof o.placeholder === "string" && o.placeholder.length > 0
      ? o.placeholder
      : undefined;

  // Default max_select for multi_choice when the agent omits it. Without
  // this, ChipGroup would render an unbounded multi-select with no UI hint
  // and clicks past the intended cap go silently into the answer.
  let max_select: number | undefined;
  if (typeof o.max_select === "number" && Number.isFinite(o.max_select)) {
    max_select = Math.max(1, Math.floor(o.max_select));
  } else if (kind === "multi_choice" && options) {
    max_select = options.length;
  }

  const question: ClarifyQuestion = {
    id: o.id.trim(),
    question: o.question.trim(),
    context: o.context.trim(),
    category: category as ClarifyQuestionCategory,
    kind: kind as ClarifyQuestionKind,
    source: "ai_generated",
    options,
    allow_other,
    max_select,
    placeholder,
  };
  return question;
}

function parseQuestions(raw: string): ClarifyQuestion[] {
  const cleaned = stripFences(raw);
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
  const out: ClarifyQuestion[] = [];
  const seenIds = new Set<string>();
  for (const candidate of rawQuestions) {
    const q = validateQuestion(candidate);
    if (!q) continue;
    if (seenIds.has(q.id)) continue;
    seenIds.add(q.id);
    out.push(q);
    if (out.length >= 4) break;
  }
  return out;
}

async function callModel(args: {
  model: string;
  userMessage: string;
}): Promise<string> {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: args.model,
    max_tokens: MAX_TOKENS,
    system: INTAKE_CLARIFY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: args.userMessage }],
  });
  const textParts = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text);
  const finalText = textParts.join("").trim();
  if (!finalText) {
    throw new Error(`clarify agent (${args.model}) returned no text block`);
  }
  return finalText;
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
  const userMessage = buildClarifyUserMessage(input);

  let questions: ClarifyQuestion[] = [];
  let modelUsed = PRIMARY_MODEL;
  let primaryError: unknown = null;

  try {
    const raw = await callModel({ model: PRIMARY_MODEL, userMessage });
    questions = parseQuestions(raw);
  } catch (err) {
    primaryError = err;
  }

  // Retry with the bigger model if Haiku produced too few valid questions or
  // failed to parse. Personalized clarifications are a one-shot decision per
  // user, so a single fallback call is worth the cost for output quality.
  if (questions.length < 3) {
    if (primaryError) {
      console.warn(
        "[intake-clarify] primary model failed, retrying with fallback:",
        primaryError instanceof Error ? primaryError.message : String(primaryError),
      );
    } else {
      console.warn(
        "[intake-clarify] primary model returned fewer than 3 valid questions, retrying with fallback",
      );
    }
    const raw = await callModel({ model: FALLBACK_MODEL, userMessage });
    questions = parseQuestions(raw);
    modelUsed = FALLBACK_MODEL;
  }

  if (questions.length === 0) {
    throw new Error("clarify agent returned zero valid questions on both models");
  }

  return {
    questions,
    generated_at: new Date().toISOString(),
    model: modelUsed,
  };
}
