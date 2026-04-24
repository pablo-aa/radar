// POST /api/scout/run
//
// MVP stub: returns mock output until the Scout Managed Agent is wired up.
// Records a new scout_runs row and 5 scout_discarded entries tied to it.
// No opportunities are inserted; the seeded table from supabase/seed.sql
// stays the source of truth for MVP.
//
// Auth: gated behind a logged-in user for now even though Scout output is
// shared across the whole user base. Will become an internal cron trigger
// once the Managed Agent is wired.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCycleLabel } from "@/lib/cycle";
import type { ScoutDiscardedInsert } from "@/lib/supabase/types";

type ScoutBody = {
  cycle_label?: string;
};

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseBody(raw: unknown): ScoutBody {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return { cycle_label: optionalString(r.cycle_label) };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const body = parseBody(raw);
  const cycleLabel = body.cycle_label ?? computeCycleLabel();

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Insert the scout_runs row. found_count stays 0 because this stub does not
  // materialize new opportunities, and updated_count is a plausible fixed
  // number. Counters get patched after discarded rows are inserted.
  const runInsert = await admin
    .from("scout_runs")
    .insert({
      cycle_label: cycleLabel,
      started_at: nowIso,
      finished_at: nowIso,
      status: "done",
      sources_count: 18,
      pages_fetched: 214,
      found_count: 0,
      updated_count: 4,
      discarded_count: 0,
      agent_session_id: null,
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    console.error("[api/scout/run] scout_runs insert failed", runInsert.error);
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }

  const runId = runInsert.data.id;

  // 5 distinct discarded rows. Reasons are chosen to be different from the
  // seed entries where possible: the seed uses out-of-scope (3x), throttled,
  // error, unchanged (2x), low-fit, unverifiable.
  const discarded: ScoutDiscardedInsert[] = [
    {
      scout_run_id: runId,
      host: "linkedin.com",
      path: "/jobs/search",
      reason: "out-of-scope",
      detail: "job-board pattern",
    },
    {
      scout_run_id: runId,
      host: "capes.gov.br",
      path: "/bolsas-no-exterior",
      reason: "throttled",
      detail: "429 retry queued after 3 attempts",
    },
    {
      scout_run_id: runId,
      host: "finep.gov.br",
      path: "/chamadas-abertas",
      reason: "error",
      detail: "upstream 502 on detail page fetch",
    },
    {
      scout_run_id: runId,
      host: "fapesp.br",
      path: "/pipe",
      reason: "unchanged",
      detail: "content-hash stable since last week",
    },
    {
      scout_run_id: runId,
      host: "grants.nih.gov",
      path: "/grants/guide",
      reason: "low-fit",
      detail: "biomedical track, fit estimate 0.12",
    },
  ];

  const discardInsert = await admin.from("scout_discarded").insert(discarded);
  if (discardInsert.error) {
    console.error(
      "[api/scout/run] scout_discarded insert failed",
      discardInsert.error,
    );
    return NextResponse.json({ error: "discard_insert_failed" }, { status: 500 });
  }

  const discardedCount = discarded.length;
  const foundCount = 0;
  const updatedCount = 4;

  const patch = await admin
    .from("scout_runs")
    .update({
      discarded_count: discardedCount,
      found_count: foundCount,
    })
    .eq("id", runId);

  if (patch.error) {
    console.error("[api/scout/run] scout_runs count patch failed", patch.error);
    return NextResponse.json({ error: "run_patch_failed" }, { status: 500 });
  }

  return NextResponse.json({
    run_id: runId,
    cycle_label: cycleLabel,
    found: foundCount,
    updated: updatedCount,
    discarded: discardedCount,
  });
}
