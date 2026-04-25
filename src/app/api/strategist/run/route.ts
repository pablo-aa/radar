// POST /api/strategist/run
//
// Fire-and-forget design (as of UX Overhaul Etapa 2):
//   All upfront validation (auth, parse, profile, guards, INSERT running row)
//   runs synchronously and returns 202 { run_id, status: "running" } immediately.
//   The actual agent session create + drain is dispatched via `after()` from
//   next/server, which keeps the Node.js function alive after the HTTP response
//   is sent (Vercel: the function stays warm until after() callbacks complete
//   or maxDuration is hit, whichever comes first). If the drain exceeds
//   maxDuration (300 s), the platform kills the function and the row stays
//   "running" indefinitely — a future cleanup job or admin force-run can recover
//   it.
//
// Idempotency order (per-request, top-to-bottom):
//   1. Auth guard
//   2. Parse body (accepts optional { force?: boolean, cycle_label?: string })
//   3. Load profile — capture currentAnamnesisRunId
//   4. Admin check (ADMIN_GITHUB_HANDLES env var, comma-separated handles)
//   5. Done guard (skip if force && isAdmin): if latest row is done AND
//      profile_snapshot.anamnesis_run_id matches current, return cached
//   6. Running guard (skip if force && isAdmin): 5-min window -> 409
//   7. Read opportunities
//   8. INSERT running row with status "running" + profile_snapshot + opportunity_ids + cycle_label
//   9. Return 202 { run_id, status: "running" }
//  10. after(): createStrategistSession()
//  11.   Update row with agent_session_id (for polling)
//  12.   drain()
//  13.   On success: UPDATE row to done
//  14.   On error: UPDATE row to error (redacted)

import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCycleLabel } from "@/lib/cycle";
import { createStrategistSession } from "@/lib/agents/strategist/run-agent";
import { isAdminProfile } from "@/lib/admin";
import { sendStrategistDone, sendRunError } from "@/lib/email/notify";
import type { Opportunity, Profile } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
function redactStrategistError(
  err: unknown,
  runId: string,
): { code: string; message: string; run_id: string; request_id?: string } {
  if (err instanceof Error) {
    const e = err as Error & {
      status?: number;
      error?: { type?: string };
      request_id?: string;
    };
    return {
      code: e.error?.type ?? e.name ?? "unknown_error",
      message: e.message,
      run_id: runId,
      request_id: e.request_id,
    };
  }
  return {
    code: "unknown_error",
    message: "An unexpected error occurred.",
    run_id: runId,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth guard.
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // user_id is ALWAYS from the auth session, never from the request body.
  const userId = auth.data.user.id;

  // 2. Parse body.
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

  // 3. Load profile.
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

  // 4. Admin check.
  const adminUser = isAdminProfile(profile);
  const bypassGuards = forceRequested && adminUser;

  if (bypassGuards) {
    console.log("[api/strategist/run] force override by admin", {
      user_id: userId,
      github_handle: profile.github_handle,
    });
  }

  const currentAnamnesisRunId = profile.anamnesis_run_id ?? null;

  // 5. Done guard: if latest row is done AND anamnesis_run_id matches, return cached.
  if (!bypassGuards) {
    const { data: latestRun } = await admin
      .from("strategist_runs")
      .select("id, status, profile_snapshot")
      .eq("user_id", userId)
      .eq("status", "done")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRun) {
      const snapshot = latestRun.profile_snapshot as Record<string, unknown> | null;
      const snapshotAnamnesisRunId =
        snapshot && typeof snapshot.anamnesis_run_id === "string"
          ? snapshot.anamnesis_run_id
          : null;
      // Treat snapshot=null as a cache miss. A done row that predates the
      // Anamnesis integration (or one created before any Anamnesis run) must
      // not lock the user into a stale Strategist forever. Only consider
      // cached when both ids are present and match.
      if (
        snapshotAnamnesisRunId !== null &&
        snapshotAnamnesisRunId === currentAnamnesisRunId
      ) {
        return NextResponse.json({
          run_id: latestRun.id,
          status: "done",
          cached: true,
        });
      }
    }
  }

  // 6. Running guard: reject if a running row exists within the last 5 minutes.
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

  // 7. Read top 12 opportunities by fit.
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

  const nowIso = new Date().toISOString();

  // 8. INSERT running row BEFORE dispatching the drain.
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
      agent_session_id: null,
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    console.error("[api/strategist/run] insert failed", runInsert.error);
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }

  const runId: string = runInsert.data.id;

  // Capture email info for the after() closure before the response is sent.
  const toEmail = profile.email;
  const toName = profile.display_name ?? null;

  // Capture for the after() closure.
  const strategistInput = {
    profile: profileSnapshot,
    opportunities: opportunities.map(toJsonb),
  };

  // 10-14. Dispatch session create + drain asynchronously via after().
  //        The HTTP response is sent immediately with 202; after() keeps
  //        the function warm while the session create and drain run.
  after(async () => {
    try {
      const handle = await createStrategistSession(strategistInput);

      // 11. Persist session_id so the status endpoint can surface it
      //     before drain completes (useful for admin diagnostics).
      await admin
        .from("strategist_runs")
        .update({ agent_session_id: handle.session_id })
        .eq("id", runId);

      // 12. Drain the MA event stream.
      const { output, meta } = await handle.drain();

      // 13. UPDATE row to done. notified_at is stamped in a separate update
      // after the email actually sends, so the column reflects reality.
      await admin
        .from("strategist_runs")
        .update({
          status: "done",
          finished_at: new Date().toISOString(),
          output: toJsonb(output),
        })
        .eq("id", runId);

      console.log("[api/strategist/run] done", {
        user_id: userId,
        run_id: runId,
        session_id: handle.session_id,
        input_tokens: meta.usage.input_tokens,
        output_tokens: meta.usage.output_tokens,
        cost_usd: meta.cost_usd,
      });

      // Send completion email (fire-and-forget; failures are logged, not thrown).
      // Stamp notified_at AFTER send so the column reflects reality.
      if (toEmail) {
        await sendStrategistDone({ toEmail, toName });
        await admin
          .from("strategist_runs")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", runId);
      } else {
        console.warn("[api/strategist/run] no email on profile, skipping notification", { user_id: userId });
      }
    } catch (err: unknown) {
      // 14. UPDATE row to error (redacted).
      const errorBody = redactStrategistError(err, runId);
      console.error("[api/strategist/run] agent failed", errorBody);

      await admin
        .from("strategist_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          output: toJsonb({ _meta: { error: errorBody } }),
        })
        .eq("id", runId);

      if (toEmail) {
        await sendRunError({ toEmail, toName, step: "strategist" });
        await admin
          .from("strategist_runs")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", runId);
      }
    }
  });

  // 9. Return 202 immediately — client polls /api/strategist/status for updates.
  return NextResponse.json({ run_id: runId, status: "running" }, { status: 202 });
}
