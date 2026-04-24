// POST /api/strategist/run
//
// Runs the Strategist Managed Agent for the authenticated user.
// Inserts a strategist_runs row with status "running" at session-create time,
// drains the MA event stream server-side, then updates the row to "done" or
// "error".
//
// Idempotency order (per-request, top-to-bottom):
//   1. Auth guard
//   2. Parse body (accepts optional { force?: boolean })
//   3. Load profile — capture currentAnamnesisRunId
//   4. Admin check (ADMIN_GITHUB_HANDLES env var, comma-separated handles)
//   5. Done guard (skip if force && isAdmin): if latest row is done AND
//      profile_snapshot.anamnesis_run_id matches current, return cached
//   6. Running guard (skip if force && isAdmin): 5-min window → 409
//   7. Proceed with session create → insert → drain → update

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCycleLabel } from "@/lib/cycle";
import { createStrategistSession } from "@/lib/agents/strategist/run-agent";
import { isAdminProfile } from "@/lib/admin";
import type { Opportunity, Profile } from "@/lib/supabase/types";

// Route-level config: the Managed Agent stream is long-lived (up to 120s)
// and must bypass Next.js fetch caching / request memoization to keep the
// outbound SSE connection live.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

type StrategistBody = {
  cycle_label?: string;
  force?: boolean;
};

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Casts a typed value to the Record<string, unknown> shape expected by
 * Supabase JSONB columns. The structural type information is intentionally
 * erased here: JSONB storage does not preserve TypeScript types, and
 * re-reading the column returns plain JSON. One cast per JSONB write is
 * acceptable; duplicating `as unknown as ...` at each call site is not.
 */
function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

function parseBody(raw: unknown): StrategistBody {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    cycle_label: optionalString(r.cycle_label),
    force: r.force === true,
  };
}

/** Narrow an unknown error to a safe redacted shape for DB storage. */
function redactError(
  err: unknown,
  sessionId?: string,
): { code: string; message: string; request_id?: string; session_id?: string } {
  if (err instanceof Error) {
    const e = err as Error & {
      status?: number;
      error?: { type?: string };
      request_id?: string;
    };
    return {
      code: e.error?.type ?? e.name ?? "unknown_error",
      message: e.message,
      request_id: e.request_id,
      session_id: sessionId,
    };
  }
  return {
    code: "unknown_error",
    message: "An unexpected error occurred.",
    session_id: sessionId,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // user_id is ALWAYS from the auth session, never from the request body.
  const userId = auth.data.user.id;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const body = parseBody(raw);
  const cycleLabel = body.cycle_label ?? computeCycleLabel();
  const forceRequested = body.force === true;

  const admin = createAdminClient();

  // Read profile.
  const profileRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileRead.error) {
    console.error(
      "[api/strategist/run] profile read failed",
      profileRead.error,
    );
    return NextResponse.json(
      { error: "profile_read_failed" },
      { status: 500 },
    );
  }
  if (!profileRead.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  const profile = profileRead.data as Profile;

  const adminUser = isAdminProfile(profile);
  const bypassGuards = forceRequested && adminUser;

  if (bypassGuards) {
    console.log("[api/strategist/run] force override by admin", {
      user_id: userId,
      github_handle: profile.github_handle,
    });
  }

  const currentAnamnesisRunId = profile.anamnesis_run_id ?? null;

  // Done guard: if latest row is done and anamnesis_run_id matches, return cached.
  if (!bypassGuards) {
    const { data: latestRun } = await admin
      .from("strategist_runs")
      .select("id, status, cycle_label, output, profile_snapshot")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRun && latestRun.status === "done") {
      const snapshot = latestRun.profile_snapshot as Record<string, unknown> | null;
      const snapshotAnamnesisRunId =
        snapshot && typeof snapshot.anamnesis_run_id === "string"
          ? snapshot.anamnesis_run_id
          : null;
      if (snapshotAnamnesisRunId === currentAnamnesisRunId) {
        const output = latestRun.output as Record<string, unknown> | null;
        const cardsCount = output
          ? (countCards(output))
          : 0;
        return NextResponse.json({
          run_id: latestRun.id,
          cycle_label: latestRun.cycle_label ?? cycleLabel,
          cards_count: cardsCount,
          cached: true,
        });
      }
    }
  }

  // Running guard: reject if a running row exists within the last 5 minutes.
  if (!bypassGuards) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: existingRun } = await admin
      .from("strategist_runs")
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

  // Read top 12 opportunities by fit.
  const oppsRead = await admin
    .from("opportunities")
    .select("*")
    .order("fit", { ascending: false, nullsFirst: false })
    .limit(12);

  if (oppsRead.error) {
    console.error(
      "[api/strategist/run] opportunities read failed",
      oppsRead.error,
    );
    return NextResponse.json(
      { error: "opportunities_read_failed" },
      { status: 500 },
    );
  }
  const opportunities = (oppsRead.data ?? []) as Opportunity[];
  const opportunityIds = opportunities.map((o) => o.id);

  const profileSnapshot: Record<string, unknown> = {
    user_id: profile.user_id,
    github_handle: profile.github_handle,
    display_name: profile.display_name,
    email: profile.email,
    cv_url: profile.cv_url,
    site_url: profile.site_url,
    structured_profile: profile.structured_profile,
    anamnesis_run_id: profile.anamnesis_run_id,
    snapshot_at: new Date().toISOString(),
  };

  // Create MA session: returns session_id before draining so the DB row can be written first.
  const strategistInput = {
    profile: profileSnapshot,
    opportunities: opportunities.map(toJsonb),
  };

  let sessionHandle: Awaited<ReturnType<typeof createStrategistSession>>;
  try {
    sessionHandle = await createStrategistSession(strategistInput);
  } catch (err: unknown) {
    console.error("[api/strategist/run] session create failed", err);
    const redacted = redactError(err);
    return NextResponse.json(
      { error: "strategist_session_failed", detail: redacted.code },
      { status: 500 },
    );
  }

  const sessionId = sessionHandle.session_id;
  const nowIso = new Date().toISOString();

  // INSERT running row BEFORE draining the stream (audit trail + double-submit guard).
  const runInsert = await admin
    .from("strategist_runs")
    .insert({
      user_id: userId,
      cycle_label: cycleLabel,
      started_at: nowIso,
      finished_at: null,
      status: "running",
      profile_snapshot: profileSnapshot,
      opportunity_ids: opportunityIds,
      output: null,
      agent_session_id: sessionId,
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    console.error("[api/strategist/run] insert failed", runInsert.error);
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }

  const runId: string = runInsert.data.id;

  // Drain the MA stream.
  try {
    const { output, meta } = await sessionHandle.drain();

    // Update row to done.
    await admin
      .from("strategist_runs")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
        output: toJsonb(output),
      })
      .eq("id", runId);

    console.log("[api/strategist/run]", {
      user_id: userId,
      run_id: runId,
      session_id: sessionId,
      input_tokens: meta.usage.input_tokens,
      output_tokens: meta.usage.output_tokens,
      cost_usd: meta.cost_usd,
    });

    const cardsCount =
      output.dated_one_shot.length +
      output.recurrent_annual.length +
      output.rolling.length +
      output.arenas.length +
      (output.ninety_day_plan?.length ?? 0);

    return NextResponse.json({
      run_id: runId,
      cycle_label: cycleLabel,
      cards_count: cardsCount,
    });
  } catch (err: unknown) {
    const redacted = redactError(err, sessionId);
    console.error("[api/strategist/run] drain failed", {
      run_id: runId,
      session_id: sessionId,
      code: redacted.code,
      message: redacted.message,
    });

    // Update row to error with redacted metadata.
    await admin
      .from("strategist_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        output: {
          _meta: {
            error: redacted,
            session_id: sessionId,
          },
        },
      })
      .eq("id", runId);

    return NextResponse.json(
      { error: "strategist_run_failed", run_id: runId },
      { status: 500 },
    );
  }
}

/** Count total cards across all output buckets (used for cached response). */
function countCards(output: Record<string, unknown>): number {
  const arr = (key: string) => {
    const v = output[key];
    return Array.isArray(v) ? v.length : 0;
  };
  return (
    arr("dated_one_shot") +
    arr("recurrent_annual") +
    arr("rolling") +
    arr("arenas") +
    arr("ninety_day_plan")
  );
}
