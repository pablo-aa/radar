// GET /api/strategist/status?run_id=<uuid>
// or no query param: returns the latest run for the authenticated user.
//
// Response shapes:
//   200 { run_id, status: "running"|"done"|"error", started_at, finished_at, elapsed_seconds, agent_session_id? }
//   400 { error: "invalid_run_id" }   — run_id param is present but not a valid UUID
//   404 { error: "not_found" }        — no row matches (or row belongs to another user)
//   401 { error: "unauthorized" }

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StrategistRun } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusResponse = {
  run_id: string;
  status: StrategistRun["status"];
  started_at: string;
  finished_at: string | null;
  elapsed_seconds: number;
  agent_session_id: string | null;
};

function computeElapsed(startedAt: string, finishedAt: string | null): number {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  return Math.round((end - start) / 1000);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Auth guard.
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = auth.data.user.id;

  const admin = createAdminClient();

  // 2. Parse optional run_id from query string.
  const { searchParams } = new URL(request.url);
  const runIdParam = searchParams.get("run_id");

  // Reject anything that does not look like a UUID before hitting the DB.
  // Supabase already parameterizes, but explicit shape validation makes the
  // contract clear and rejects garbage early on a public-facing endpoint.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (runIdParam && !UUID_RE.test(runIdParam)) {
    return NextResponse.json({ error: "invalid_run_id" }, { status: 400 });
  }

  let row: StrategistRun | null = null;

  if (runIdParam) {
    // 3a. Fetch specific run by id.
    const { data, error } = await admin
      .from("strategist_runs")
      .select("id, user_id, status, started_at, finished_at, agent_session_id")
      .eq("id", runIdParam)
      .maybeSingle();

    if (error) {
      console.error("[api/strategist/status] db error", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Double-check ownership to avoid leaking existence of other users' runs.
    if ((data as StrategistRun).user_id !== userId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    row = data as StrategistRun;
  } else {
    // 3b. Fetch latest run for the authenticated user.
    const { data, error } = await admin
      .from("strategist_runs")
      .select("id, user_id, status, started_at, finished_at, agent_session_id")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[api/strategist/status] db error", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    row = data as StrategistRun;
  }

  const response: StatusResponse = {
    run_id: row.id,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    elapsed_seconds: computeElapsed(row.started_at, row.finished_at),
    agent_session_id: row.agent_session_id,
  };

  return NextResponse.json(response);
}
