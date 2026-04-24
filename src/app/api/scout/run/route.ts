// POST /api/scout/run
//
// Triggers the Scout agent for the authenticated admin. Scout crawls the
// provided sources (or SCOUT_PILOT_SOURCES if none given), persists
// opportunities and discarded rows directly via tool executors, then updates
// the scout_runs row with summary stats.
//
// Auth: admin-only (Scout is maintainer-triggered, not user-triggered).
// Running guard: reject if a scout_run with status="running" exists in the
// last 10 minutes (409).
//
// Single-session only: this route intentionally uses one MA session (not the
// batched path) because the 300s Vercel function window cannot reliably fit
// multiple sequential batches. For large source lists (> 20 sources), use the
// GitHub Actions workflow instead (scripts/scout/trigger-run.ts), which has no
// time cap and uses runScoutBatched. Callers passing more than 20 sources
// receive a 400 directing them to that path.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminProfile } from "@/lib/admin";
import { createScoutSession } from "@/lib/agents/scout/run-agent";
import { SCOUT_PILOT_SOURCES } from "@/lib/agents/scout/sources-pilot";
import type { Profile, ScoutRunUpdate } from "@/lib/supabase/types";
import type { ScoutSource } from "@/lib/agents/scout/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Vercel Hobby caps serverless functions at 300 seconds. Long Scout runs
// live in GitHub Actions (see .github/workflows/scout.yml).
export const maxDuration = 300;

type ScoutBody = {
  force?: boolean;
  max_cost_usd?: number;
  sources?: ScoutSource[];
};

function parseBody(raw: unknown): ScoutBody {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    force: r["force"] === true,
    max_cost_usd:
      typeof r["max_cost_usd"] === "number" ? r["max_cost_usd"] : undefined,
    sources: Array.isArray(r["sources"])
      ? (r["sources"] as ScoutSource[])
      : undefined,
  };
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
  const body = parseBody(raw);

  const admin = createAdminClient();

  // Load profile for admin check.
  const profileRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileRead.error) {
    console.error("[api/scout/run] profile read failed", profileRead.error);
    return NextResponse.json({ error: "profile_read_failed" }, { status: 500 });
  }
  if (!profileRead.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  const profile = profileRead.data as Profile;

  if (!isAdminProfile(profile)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sources: ScoutSource[] =
    body.sources && body.sources.length > 0 ? body.sources : SCOUT_PILOT_SOURCES;

  // Size guard: this route runs a single MA session inside a 300s Vercel
  // window. More than 20 sources will almost certainly time out. Large runs
  // belong in the CLI trigger (scripts/scout/trigger-run.ts) which uses
  // runScoutBatched with no time cap.
  const ROUTE_MAX_SOURCES = 20;
  if (sources.length > ROUTE_MAX_SOURCES) {
    return NextResponse.json(
      {
        error: "too_many_sources",
        detail: `This route accepts at most ${ROUTE_MAX_SOURCES} sources in a single session. For larger runs, trigger via the CLI script (npx tsx scripts/scout/trigger-run.ts) which uses batched execution and has no time cap.`,
        sources_provided: sources.length,
      },
      { status: 400 },
    );
  }

  // Running guard: reject if a running row exists in the last 10 minutes.
  if (!body.force) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: existingRun } = await admin
      .from("scout_runs")
      .select("id")
      .eq("status", "running")
      .gt("started_at", tenMinutesAgo)
      .maybeSingle();

    if (existingRun) {
      return NextResponse.json(
        { error: "run_in_progress", run_id: existingRun.id },
        { status: 409 },
      );
    }
  }

  const nowIso = new Date().toISOString();

  // INSERT running row.
  const runInsert = await admin
    .from("scout_runs")
    .insert({
      started_at: nowIso,
      finished_at: null,
      status: "running",
      sources_count: sources.length,
      pages_fetched: 0,
      found_count: 0,
      updated_count: 0,
      discarded_count: 0,
      agent_session_id: null,
      output: null,
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    console.error("[api/scout/run] scout_runs insert failed", runInsert.error);
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }

  const scoutRunId: string = runInsert.data.id;

  try {
    const handle = await createScoutSession(sources, scoutRunId);

    // Record the session_id on the run row before draining.
    await admin
      .from("scout_runs")
      .update({ agent_session_id: handle.session_id })
      .eq("id", scoutRunId);

    const { output, meta } = await handle.drain({
      maxCostUsd: body.max_cost_usd,
    });

    const finishedAt = new Date().toISOString();

    const update: ScoutRunUpdate = {
      status: "done",
      finished_at: finishedAt,
      sources_count: sources.length,
      pages_fetched: meta.fetches,
      found_count: meta.upserts,
      updated_count: 0,
      discarded_count: meta.discards,
      output: meta as unknown as Record<string, unknown>,
    };

    await admin.from("scout_runs").update(update).eq("id", scoutRunId);

    console.log("[api/scout/run]", {
      run_id: scoutRunId,
      visited: output.visited,
      upserted: output.upserted,
      discarded: output.discarded,
      input_tokens: meta.usage.input_tokens,
      output_tokens: meta.usage.output_tokens,
      cost_usd: meta.cost_usd,
    });

    return NextResponse.json({
      run_id: scoutRunId,
      visited: output.visited,
      upserted: output.upserted,
      discarded: output.discarded,
      cost_usd: meta.cost_usd,
      run_summary: output.run_summary,
    });
  } catch (err: unknown) {
    const redacted = redactError(err);
    console.error("[api/scout/run] scout run failed", {
      run_id: scoutRunId,
      code: redacted.code,
      message: redacted.message,
    });

    await admin
      .from("scout_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        output: { _meta: { error: redacted } },
      })
      .eq("id", scoutRunId);

    return NextResponse.json(
      { error: "scout_run_failed", run_id: scoutRunId },
      { status: 500 },
    );
  }
}
