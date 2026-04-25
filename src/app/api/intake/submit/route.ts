// POST /api/intake/submit
//
// Single source of truth for intake submission. Synchronously persists all
// intake fields into the profile + flips onboard_state.intake_done = true,
// then dispatches the Anamnesis agent in the background via after().
// Returns 202 { run_id, status: "running" } immediately.
//
// Why this exists separately from /api/anamnesis/run:
// The anamnesis route is for re-running an already-onboarded user. This
// route is for first-time intake — it does the profile writes the form
// expects and provides one POST for the form to call.

import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAnamnesis } from "@/lib/agents/anamnesis/run";
import { sendAnamnesisDone, sendRunError } from "@/lib/email/notify";
import type { AnamnesisInput } from "@/lib/agents/anamnesis/types";
import type { Profile, OnboardState, ProfileUpdate } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type IntakeSubmitBody = {
  cv_url?: string;
  moment_text?: string;
  declared_interests?: string[];
  site_url?: string;
};

function parseBody(raw: unknown): IntakeSubmitBody {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const cv_url =
    typeof r.cv_url === "string" && r.cv_url.length > 0 ? r.cv_url : undefined;

  const moment_text =
    typeof r.moment_text === "string" && r.moment_text.length > 0
      ? r.moment_text
      : undefined;

  const declared_interests =
    Array.isArray(r.declared_interests) &&
    r.declared_interests.every((x) => typeof x === "string")
      ? (r.declared_interests as string[])
      : undefined;

  const site_url =
    typeof r.site_url === "string" && r.site_url.length > 0
      ? r.site_url
      : undefined;

  return { cv_url, moment_text, declared_interests, site_url };
}

/**
 * Casts a typed value to the Record<string, unknown> shape expected by
 * Supabase JSONB columns.
 */
function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

/** Narrow an unknown error to a safe redacted shape for DB storage. */
function redactError(
  err: unknown,
  runId: string,
): { code: string; message: string; run_id: string } {
  const base =
    err instanceof Error
      ? {
          code:
            (err as Error & { error?: { type?: string } }).error?.type ??
            err.name ??
            "unknown_error",
          message: err.message,
        }
      : { code: "unknown_error", message: "An unexpected error occurred." };
  return { ...base, run_id: runId };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth guard.
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = auth.data.user.id;

  // 2. Parse body.
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const body = parseBody(raw);

  // 3. Validate cv_url ownership.
  if (body.cv_url && !body.cv_url.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "invalid_cv_url" }, { status: 400 });
  }

  // 4. Validate moment_text length.
  if (body.moment_text && body.moment_text.length > 2000) {
    return NextResponse.json({ error: "moment_text_too_long" }, { status: 400 });
  }

  // 5. Validate declared_interests.
  if (body.declared_interests && body.declared_interests.length > 20) {
    return NextResponse.json(
      { error: "declared_interests_too_many" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 6a. Read existing profile (must exist).
  const profileRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileRead.error) {
    console.error("[api/intake/submit] profile read failed", profileRead.error);
    return NextResponse.json({ error: "profile_read_failed" }, { status: 500 });
  }
  if (!profileRead.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  const profile = profileRead.data as Profile;

  // 6b. Build new structured_profile merging existing with intake fields.
  const existingStructured: Record<string, unknown> =
    profile.structured_profile &&
    typeof profile.structured_profile === "object" &&
    !Array.isArray(profile.structured_profile)
      ? { ...(profile.structured_profile as Record<string, unknown>) }
      : {};

  const newStructured: Record<string, unknown> = { ...existingStructured };
  if (body.moment_text !== undefined) {
    newStructured.moment_text = body.moment_text;
  }
  if (body.declared_interests !== undefined) {
    newStructured.declared_interests = body.declared_interests;
  }
  if (body.site_url !== undefined) {
    newStructured.site_url = body.site_url;
  }

  // 6c. Build new onboard_state merging existing with intake_done = true.
  const existingOnboard: OnboardState = profile.onboard_state;
  const newOnboardState: OnboardState = {
    ...existingOnboard,
    intake_done: true,
  };

  // 6d. UPDATE profiles with all intake fields atomically.
  const profileUpdatePayload: ProfileUpdate = {
    structured_profile: toJsonb(newStructured),
    onboard_state: toJsonb(newOnboardState) as OnboardState,
    updated_at: new Date().toISOString(),
  };
  if (body.cv_url !== undefined) {
    profileUpdatePayload.cv_url = body.cv_url;
  }
  if (body.site_url !== undefined) {
    profileUpdatePayload.site_url = body.site_url;
  }

  const profileWrite = await admin
    .from("profiles")
    .update(profileUpdatePayload)
    .eq("user_id", userId);

  if (profileWrite.error) {
    console.error("[api/intake/submit] profile update failed", profileWrite.error);
    return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  }

  // Update the local profile reference so the anamnesis input below is consistent.
  if (body.cv_url !== undefined) profile.cv_url = body.cv_url;
  if (body.site_url !== undefined) profile.site_url = body.site_url;
  profile.structured_profile = newStructured;
  profile.onboard_state = newOnboardState;

  // 7. Idempotency: if a running row exists within 5-min window, return it.
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

  // 8. INSERT new anamnesis_runs row.
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
    console.error("[api/intake/submit] run insert failed", runInsert.error);
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }

  const runId: string = runInsert.data.id;

  // Build AnamnesisInput from the just-updated profile.
  const anamnesisInput: AnamnesisInput = {
    handle: profile.github_handle ?? profile.email ?? userId,
    display_name: profile.display_name,
    email: profile.email,
    intake: Object.keys(newStructured).length > 0 ? newStructured : null,
    cv_url:
      typeof profile.cv_url === "string" && profile.cv_url.length > 0
        ? profile.cv_url
        : null,
  };

  // Capture email info for the after() closure before the response is sent.
  const toEmail = profile.email;
  const toName = profile.display_name ?? null;

  // 9. Dispatch agent drain in background via after().
  after(async () => {
    try {
      const output = await runAnamnesis(anamnesisInput);

      // UPDATE row to done. notified_at is set in a SEPARATE update after the
      // email send actually succeeds, so the column reflects what really
      // happened (not what we hoped would happen).
      await admin
        .from("anamnesis_runs")
        .update({
          status: "done",
          finished_at: new Date().toISOString(),
          output: toJsonb(output),
        })
        .eq("id", runId);

      // UPDATE profiles.structured_profile + anamnesis_run_id.
      if (output.profile) {
        await admin
          .from("profiles")
          .update({
            structured_profile: toJsonb(output.profile),
            anamnesis_run_id: runId,
          })
          .eq("user_id", userId);
      }

      console.log("[api/intake/submit] done", {
        user_id: userId,
        run_id: runId,
        input_tokens: output._meta.usage.input_tokens,
        output_tokens: output._meta.usage.output_tokens,
        cost_usd: output._meta.cost_usd,
        tool_calls: output._meta.tool_calls,
      });

      // Send completion email (fire-and-forget; failures are logged, not thrown).
      // Stamp notified_at AFTER send so the column reflects reality.
      if (toEmail) {
        await sendAnamnesisDone({ toEmail, toName });
        await admin
          .from("anamnesis_runs")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", runId);
      } else {
        console.warn("[api/intake/submit] no email on profile, skipping notification", { user_id: userId });
      }
    } catch (err: unknown) {
      const errorBody = redactError(err, runId);
      console.error("[api/intake/submit] agent failed", errorBody);

      await admin
        .from("anamnesis_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          output: toJsonb({ _meta: { error: errorBody } }),
        })
        .eq("id", runId);

      if (toEmail) {
        await sendRunError({ toEmail, toName, step: "anamnesis" });
        await admin
          .from("anamnesis_runs")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", runId);
      }
    }
  });

  // 10. Return 202 immediately.
  return NextResponse.json({ run_id: runId, status: "running" }, { status: 202 });
}
