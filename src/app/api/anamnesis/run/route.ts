// POST /api/anamnesis/run
//
// Runs the Anamnesis agent (raw messages.create loop) for the authenticated user.
// Inserts an anamnesis_runs row with status="running", calls runAnamnesis(),
// then updates the row to "done" or "error".
//
// Idempotency order (per-request, top-to-bottom):
//   1. Auth guard
//   2. Parse body (accepts optional { force?: boolean })
//   3. Load profile via admin client
//   4. Admin check (ADMIN_GITHUB_HANDLES env var)
//   5. Done guard (skip if force && isAdmin): if latest row is done, return cached
//   6. Running guard (skip if force && isAdmin): 5-min window -> 409
//   7. INSERT running row
//   8. Call runAnamnesis()
//   9. On success: UPDATE row to done, UPDATE profiles.structured_profile
//  10. On error: UPDATE row to error (redacted)
//  11. Return { run_id, cached?: true }

import { NextResponse, type NextRequest } from "next/server";
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
};

function parseBody(raw: unknown): AnamnesisBody {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return { force: r.force === true };
}

/**
 * Casts a typed value to the Record<string, unknown> shape expected by
 * Supabase JSONB columns.
 */
function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

/** Narrow an unknown error to a safe redacted shape for DB storage. */
function redactError(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    const e = err as Error & { error?: { type?: string } };
    return {
      code: e.error?.type ?? e.name ?? "unknown_error",
      message: e.message,
    };
  }
  return { code: "unknown_error", message: "An unexpected error occurred." };
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
      return NextResponse.json({ run_id: latestRun.id, cached: true });
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
  const anamnesisInput: AnamnesisInput = {
    handle: profile.github_handle ?? profile.email ?? userId,
    display_name: profile.display_name,
    email: profile.email,
    intake:
      profile.structured_profile &&
      typeof profile.structured_profile === "object" &&
      !Array.isArray(profile.structured_profile)
        ? (profile.structured_profile as Record<string, unknown>)
        : null,
  };

  // 8. Call runAnamnesis().
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
    await admin
      .from("profiles")
      .update({
        structured_profile: toJsonb(output.profile),
        anamnesis_run_id: runId,
      })
      .eq("user_id", userId);

    // 10. Log usage + cost.
    console.log("[api/anamnesis/run]", {
      user_id: userId,
      run_id: runId,
      input_tokens: output._meta.usage.input_tokens,
      output_tokens: output._meta.usage.output_tokens,
      cost_usd: output._meta.cost_usd,
      tool_calls: output._meta.tool_calls,
    });

    return NextResponse.json({ run_id: runId });
  } catch (err: unknown) {
    // 11. UPDATE row to error (redacted).
    const redacted = redactError(err);
    console.error("[api/anamnesis/run] agent failed", {
      run_id: runId,
      code: redacted.code,
      message: redacted.message,
    });

    await admin
      .from("anamnesis_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        output: {
          _meta: { error: redacted },
        },
      })
      .eq("id", runId);

    return NextResponse.json(
      { error: "anamnesis_run_failed", run_id: runId },
      { status: 500 },
    );
  }
}
