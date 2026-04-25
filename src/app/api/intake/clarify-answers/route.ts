// POST /api/intake/clarify-answers
//
// Persists the user's answers to the eliminatory + AI clarification
// questions and dispatches the chained Anamnesis -> Strategist flow. Returns
// 202 with the new anamnesis run_id immediately; the front-end then
// navigates to /generating?step=both as before.
//
// Request body shape:
//   {
//     answers: {
//       <question_id>: {
//         values: string[],     // option values; empty for short_text
//         other_text?: string   // free text from "outro" or short_text
//       }
//     },
//     skipped?: boolean
//   }

import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chainAnamnesisToStrategist } from "@/lib/agents/anamnesis/chain";
import { ELIMINATORY_QUESTIONS } from "@/lib/agents/intake-clarify/eliminatory";
import type {
  ClarifyAnswerInput,
  ClarifyAnswerStored,
  ClarifyAnswerStoredMap,
  ClarifyQuestion,
  ClarifyQuestionSet,
} from "@/lib/agents/intake-clarify/types";
import type {
  Profile,
  OnboardState,
  ProfileUpdate,
} from "@/lib/supabase/types";
import type { AnamnesisInput } from "@/lib/agents/anamnesis/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ANSWER_TEXT_MAX = 600;

type Body = {
  answers?: Record<string, unknown>;
  skipped?: boolean;
};

function parseAnswers(raw: unknown): {
  answers: Record<string, ClarifyAnswerInput>;
  skipped: boolean;
} {
  const out: { answers: Record<string, ClarifyAnswerInput>; skipped: boolean } = {
    answers: {},
    skipped: false,
  };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Body;
  if (r.skipped === true) out.skipped = true;
  if (r.answers && typeof r.answers === "object" && !Array.isArray(r.answers)) {
    for (const [questionId, payload] of Object.entries(r.answers)) {
      if (typeof questionId !== "string" || !questionId.trim()) continue;
      if (!payload || typeof payload !== "object") continue;
      const p = payload as Record<string, unknown>;
      const rawValues = p.values;
      const rawOther = p.other_text;
      const values: string[] = Array.isArray(rawValues)
        ? rawValues.filter((v): v is string => typeof v === "string" && v.length > 0)
        : [];
      const other_text =
        typeof rawOther === "string" && rawOther.trim().length > 0
          ? rawOther.trim().slice(0, ANSWER_TEXT_MAX)
          : undefined;
      if (values.length === 0 && !other_text) continue;
      out.answers[questionId.trim()] = { values, other_text };
    }
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

function readCachedAi(profile: Profile): ClarifyQuestion[] {
  const sp = asRecord(profile.structured_profile);
  const cached = sp.clarify_questions;
  if (
    cached &&
    typeof cached === "object" &&
    !Array.isArray(cached) &&
    Array.isArray((cached as Record<string, unknown>).questions)
  ) {
    const set = cached as unknown as ClarifyQuestionSet;
    return Array.isArray(set.questions) ? set.questions : [];
  }
  return [];
}

function buildStoredAnswers(args: {
  questions: ClarifyQuestion[];
  raw: Record<string, ClarifyAnswerInput>;
}): ClarifyAnswerStoredMap {
  const byId = new Map(args.questions.map((q) => [q.id, q]));
  const out: ClarifyAnswerStoredMap = {};
  for (const [qid, ans] of Object.entries(args.raw)) {
    const q = byId.get(qid);
    if (!q) continue; // ignore answers that do not belong to a known question

    // Hard-validate selected values against the question's option set, so a
    // malicious or buggy client cannot inject arbitrary strings into the
    // payload that downstream agents will read as ground truth.
    let validValues: string[] = [];
    let labels: string[] = [];
    if (q.options && q.options.length > 0) {
      const optByValue = new Map(q.options.map((o) => [o.value, o.label]));
      const seen = new Set<string>();
      for (const v of ans.values) {
        const label = optByValue.get(v);
        if (typeof label !== "string") continue;
        if (seen.has(v)) continue;
        seen.add(v);
        validValues.push(v);
        labels.push(label);
      }
      if (q.kind === "single_choice" || q.kind === "scale") {
        validValues = validValues.slice(0, 1);
        labels = labels.slice(0, 1);
      }
      if (q.kind === "multi_choice" && typeof q.max_select === "number") {
        validValues = validValues.slice(0, q.max_select);
        labels = labels.slice(0, q.max_select);
      }
    }

    const stored: ClarifyAnswerStored = {
      question_id: q.id,
      question: q.question,
      category: q.category,
      kind: q.kind,
      source: q.source,
      selected_values: validValues,
      selected_labels: labels,
      other_text: ans.other_text ?? null,
    };
    out[qid] = stored;
  }
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = auth.data.user.id;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const { answers: rawAnswers, skipped } = parseAnswers(raw);

  const admin = createAdminClient();
  const profileRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileRead.error || !profileRead.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  const profile = profileRead.data as Profile;

  if (!profile.onboard_state.intake_done) {
    return NextResponse.json(
      { error: "intake_not_submitted" },
      { status: 400 },
    );
  }

  // Build the universe of valid question IDs from eliminatory + cached AI
  // set. Any answer not matching a known question is dropped.
  const allQuestions: ClarifyQuestion[] = [
    ...ELIMINATORY_QUESTIONS,
    ...readCachedAi(profile),
  ];

  const storedAnswers = buildStoredAnswers({
    questions: allQuestions,
    raw: rawAnswers,
  });

  const sp = { ...asRecord(profile.structured_profile) };
  sp.clarify_answers = storedAnswers;
  // Anamnesis prompt rule 9 expects clarify_skipped to mean "user opted out
  // entirely". Honor it only when the request was explicitly marked skipped
  // AND no answer survived validation. A user who clicks "Pular e gerar
  // mesmo assim" with partial answers is still cooperating; do not penalize.
  sp.clarify_skipped = skipped && Object.keys(storedAnswers).length === 0;
  sp.clarify_completed_at = new Date().toISOString();

  const newOnboardState: OnboardState = {
    ...profile.onboard_state,
    intake_clarified: true,
  };

  const profileUpdatePayload: ProfileUpdate = {
    structured_profile: toJsonb(sp),
    onboard_state: toJsonb(newOnboardState) as OnboardState,
    updated_at: new Date().toISOString(),
  };
  const profileWrite = await admin
    .from("profiles")
    .update(profileUpdatePayload)
    .eq("user_id", userId);
  if (profileWrite.error) {
    console.error(
      "[api/intake/clarify-answers] profile update failed",
      profileWrite.error,
    );
    return NextResponse.json(
      { error: "profile_update_failed" },
      { status: 500 },
    );
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: existingRun } = await admin
    .from("anamnesis_runs")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "running")
    .gt("started_at", fiveMinutesAgo)
    .maybeSingle();

  if (existingRun) {
    return NextResponse.json(
      { run_id: existingRun.id, status: "running" },
      { status: 202 },
    );
  }

  const nowIso = new Date().toISOString();
  const runInsert = await admin
    .from("anamnesis_runs")
    .insert({
      user_id: userId,
      status: "running",
      started_at: nowIso,
      finished_at: null,
      agent_session_id: null,
      output: null,
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    console.error(
      "[api/intake/clarify-answers] run insert failed",
      runInsert.error,
    );
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }
  const runId: string = runInsert.data.id;

  // Build the intake payload Anamnesis sees. We strip the AI question cache
  // (it is presentation, not signal) and pass the answers, skipped flag, and
  // moment_text / declared_interests / site_url through.
  const intakeForAnamnesis: Record<string, unknown> = { ...sp };
  delete intakeForAnamnesis.clarify_questions;

  const anamnesisInput: AnamnesisInput = {
    handle: profile.github_handle ?? profile.email ?? userId,
    display_name: profile.display_name,
    email: profile.email,
    intake:
      Object.keys(intakeForAnamnesis).length > 0 ? intakeForAnamnesis : null,
    cv_url:
      typeof profile.cv_url === "string" && profile.cv_url.length > 0
        ? profile.cv_url
        : null,
  };

  const toEmail = profile.email;
  const toName = profile.display_name ?? null;

  after(async () => {
    await chainAnamnesisToStrategist({
      userId,
      runId,
      anamnesisInput,
      toEmail,
      toName,
    });
  });

  return NextResponse.json(
    { run_id: runId, status: "running" },
    { status: 202 },
  );
}
