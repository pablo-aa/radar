// POST /api/anamnesis/run
//
// Fire-and-forget design (as of UX Overhaul Etapa 1):
//   All upfront validation (auth, parse, profile, guards, INSERT running row)
//   runs synchronously and returns 202 { run_id, status: "running" } immediately.
//   The actual agent drain is dispatched via `after()` from next/server, which
//   keeps the Node.js function alive after the HTTP response is sent (Vercel:
//   the function stays warm until after() callbacks complete or maxDuration is
//   hit, whichever comes first). If the drain exceeds maxDuration (300 s), the
//   platform kills the function and the row stays "running" indefinitely — a
//   future cleanup job or admin force-run can recover it.
//
// Idempotency order (per-request, top-to-bottom):
//   1. Auth guard
//   2. Parse body (accepts optional { force?: boolean })
//   3. Load profile via admin client
//   4. Admin check (ADMIN_GITHUB_HANDLES env var)
//   5. Done guard (skip if force && isAdmin): if latest row is done, return cached
//   6. Running guard (skip if force && isAdmin): 5-min window -> 409
//   7. INSERT running row
//   8. after(): call runAnamnesis()
//   9.   On success: UPDATE row to done, UPDATE profiles.structured_profile
//  10.   On error: UPDATE row to error (redacted)
//  11. Return 202 { run_id, status: "running" }

import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminProfile } from "@/lib/admin";
import { runAnamnesis } from "@/lib/agents/anamnesis/run";
import type { AnamnesisInput } from "@/lib/agents/anamnesis/types";
import type { Profile } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AnamnesisBody = {
  force?: boolean;
  moment_text?: string;
  cv_url?: string;
};

function parseBody(raw: unknown): AnamnesisBody {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    force: r.force === true,
    moment_text: typeof r.moment_text === "string" ? r.moment_text : undefined,
    cv_url: typeof r.cv_url === "string" && r.cv_url.length > 0 ? r.cv_url : undefined,
  };
}

/**
 * Casts a typed value to the Record<string, unknown> shape expected by
 * Supabase JSONB columns.
 */
function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

/** Narrow an unknown error to a safe redacted shape for DB storage. */
function redactAnamnesisError(
  err: unknown,
  runId: string,
): { code: string; message: string; run_id: string } {
  const base =
    err instanceof Error
      ? {
          code: (err as Error & { error?: { type?: string } }).error?.type ?? err.name ?? "unknown_error",
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
  const forceRequested = body.force === true;

  const admin = createAdminClient();

  // 3. Load profile.
  const profileRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileRead.error) {
    console.error("[api/anamnesis/run] profile read failed", profileRead.error);
    return NextResponse.json({ error: "profile_read_failed" }, { status: 500 });
  }
  if (!profileRead.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  const profile = profileRead.data as Profile;

  // 4. Admin check.
  const adminUser = isAdminProfile(profile);
  const bypassGuards = forceRequested && adminUser;

  if (bypassGuards) {
    console.log("[api/anamnesis/run] force override by admin", {
      user_id: userId,
      github_handle: profile.github_handle,
    });
  }

  // 5. Done guard: if latest row is done, return cached.
  if (!bypassGuards) {
    const { data: latestRun } = await admin
      .from("anamnesis_runs")
      .select("id, status")
      .eq("user_id", userId)
      .eq("status", "done")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRun) {
      return NextResponse.json({ run_id: latestRun.id, status: "done", cached: true });
    }
  }

  // 6. Running guard: reject if a running row exists within the last 5 minutes.
  if (!bypassGuards) {
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
        { error: "run_in_progress", run_id: existingRun.id },
        { status: 409 },
      );
    }
  }

  // 6.5. Persist cv_url from the body into the profile so the Anamnesis
  // input block below (and any re-run) reads it consistently. The upload
  // step on the client saves the blob to Storage but does not write the
  // path into profiles; the route does it here in one place.
  // Ownership enforcement: reject any path that is not inside the caller's
  // own storage folder, otherwise a POST with someone else's cv path would
  // overwrite this user's row and could leak another user's CV downstream.
  if (body.cv_url && body.cv_url !== profile.cv_url) {
    if (!body.cv_url.startsWith(`${userId}/`)) {
      return NextResponse.json({ error: "invalid_cv_url" }, { status: 400 });
    }
    const cvWrite = await admin
      .from("profiles")
      .update({ cv_url: body.cv_url })
      .eq("user_id", userId);
    if (cvWrite.error) {
      console.warn(
        "[api/anamnesis/run] failed to persist cv_url (non-fatal)",
        cvWrite.error,
      );
    } else {
      profile.cv_url = body.cv_url;
    }
  }

  const nowIso = new Date().toISOString();

  // 7. INSERT running row BEFORE calling the agent.
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
    console.error("[api/anamnesis/run] run insert failed", runInsert.error);
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }

  const runId: string = runInsert.data.id;

  // Build the Anamnesis input from profile fields.
  // moment_text from the request body is merged into the intake object so
  // buildUserMessage surfaces it as an intake_form_field for the agent.
  const baseIntake: Record<string, unknown> =
    profile.structured_profile &&
    typeof profile.structured_profile === "object" &&
    !Array.isArray(profile.structured_profile)
      ? { ...(profile.structured_profile as Record<string, unknown>) }
      : {};

  if (body.moment_text) {
    baseIntake.moment_text = body.moment_text;
  }

  const anamnesisInput: AnamnesisInput = {
    handle: profile.github_handle ?? profile.email ?? userId,
    display_name: profile.display_name,
    email: profile.email,
    intake: Object.keys(baseIntake).length > 0 ? baseIntake : null,
    cv_url: typeof profile.cv_url === "string" && profile.cv_url.length > 0
      ? profile.cv_url
      : null,
  };

  // 8. Dispatch drain asynchronously via after(). The HTTP response is sent
  //    immediately with 202; after() keeps the function warm while the drain runs.
  after(async () => {
    try {
      const output = await runAnamnesis(anamnesisInput);

      // 9. UPDATE row to done.
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

      // Log usage + cost.
      console.log("[api/anamnesis/run] done", {
        user_id: userId,
        run_id: runId,
        input_tokens: output._meta.usage.input_tokens,
        output_tokens: output._meta.usage.output_tokens,
        cost_usd: output._meta.cost_usd,
        tool_calls: output._meta.tool_calls,
      });
    } catch (err: unknown) {
      // 10. UPDATE row to error (redacted).
      const errorBody = redactAnamnesisError(err, runId);
      console.error("[api/anamnesis/run] agent failed", errorBody);

      await admin
        .from("anamnesis_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          output: toJsonb({ _meta: { error: errorBody } }),
        })
        .eq("id", runId);
    }
  });

  // 11. Return 202 immediately — client polls /api/anamnesis/status for updates.
  return NextResponse.json({ run_id: runId, status: "running" }, { status: 202 });
}
