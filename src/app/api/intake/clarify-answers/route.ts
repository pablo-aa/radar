// POST /api/intake/clarify-answers
//
// Persists the user's answers to the AI-generated clarification questions
// and dispatches the chained Anamnesis -> Strategist flow. Returns 202 with
// the new anamnesis run_id immediately. Front-end then navigates to
// /generating?step=both as before.
//
// Request body: { answers: Record<questionId, answerString>, skipped?: boolean }

import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chainAnamnesisToStrategist } from "@/lib/agents/anamnesis/chain";
import type {
  Profile,
  OnboardState,
  ProfileUpdate,
} from "@/lib/supabase/types";
import type { AnamnesisInput } from "@/lib/agents/anamnesis/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  answers?: Record<string, unknown>;
  skipped?: boolean;
};

function parseBody(raw: unknown): { answers: Record<string, string>; skipped: boolean } {
  const out = { answers: {} as Record<string, string>, skipped: false };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Body;
  if (r.skipped === true) out.skipped = true;
  if (r.answers && typeof r.answers === "object" && !Array.isArray(r.answers)) {
    for (const [k, v] of Object.entries(r.answers)) {
      if (typeof k !== "string") continue;
      if (typeof v === "string") {
        const trimmed = v.trim().slice(0, 2000);
        if (trimmed.length > 0) out.answers[k] = trimmed;
      }
    }
  }
  return out;
}

function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
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
  const { answers, skipped } = parseBody(raw);

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

  // Merge answers into structured_profile.clarify_answers.
  const sp = { ...asRecord(profile.structured_profile) };
  sp.clarify_answers = answers;
  sp.clarify_skipped = skipped;
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

  // Idempotency: if there is already a running anamnesis row in the last
  // 5 minutes, return it instead of starting another.
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

  // Build the intake payload for Anamnesis. Strip the cached questions blob
  // (Anamnesis does not need it) but keep clarify_answers so the agent can
  // ground the profile in the user's confirmed roles / durations / context.
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

  return NextResponse.json({ run_id: runId, status: "running" }, { status: 202 });
}
