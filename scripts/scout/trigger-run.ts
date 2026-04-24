#!/usr/bin/env tsx
// One-shot CLI to run the Scout agent against PILOT_SOURCES. Bypasses the
// HTTP route so the maintainer can trigger from the terminal without a
// running dev server. This is a paid operation (~$1-5 per run).
//
// Usage:
//   npx tsx scripts/scout/trigger-run.ts
//
// Cost cap default: $5 USD. Override with MAX_COST_USD env var.

import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();

import { createClient } from "@supabase/supabase-js";

// Import using relative paths (scripts/ is excluded from tsconfig paths).
import { runScout } from "../../src/lib/agents/scout/run";
import { PILOT_SOURCES } from "../../src/lib/agents/scout/sources";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

const maxCostUsd = process.env.MAX_COST_USD
  ? parseFloat(process.env.MAX_COST_USD)
  : 5.0;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Scout pilot run: ${PILOT_SOURCES.length} sources, cost cap $${maxCostUsd}`);

  const nowIso = new Date().toISOString();
  const runInsert = await admin
    .from("scout_runs")
    .insert({
      started_at: nowIso,
      finished_at: null,
      status: "running",
      sources_count: PILOT_SOURCES.length,
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
    console.error("scout_runs insert failed:", runInsert.error);
    process.exit(1);
  }

  const runId: string = runInsert.data.id;
  console.log(`run_id: ${runId}`);
  console.log("Running Scout agent (this takes up to 15 minutes)...\n");

  try {
    const result = await runScout(PILOT_SOURCES, runId, { maxCostUsd });

    const finishedAt = new Date().toISOString();

    await admin
      .from("scout_runs")
      .update({
        status: "done",
        finished_at: finishedAt,
        sources_count: PILOT_SOURCES.length,
        pages_fetched: result._meta.iterations,
        found_count: result.upserted,
        updated_count: 0,
        discarded_count: result.discarded,
        output: result._meta as unknown as Record<string, unknown>,
      })
      .eq("id", runId);

    console.log("\n--- Scout run complete ---");
    console.log(`run_id:        ${runId}`);
    console.log(`visited:       ${result.visited}`);
    console.log(`upserted:      ${result.upserted}`);
    console.log(`discarded:     ${result.discarded}`);
    console.log(`iterations:    ${result._meta.iterations}`);
    console.log(`input_tokens:  ${result._meta.usage.input_tokens}`);
    console.log(`output_tokens: ${result._meta.usage.output_tokens}`);
    console.log(`cost_usd:      $${result._meta.cost_usd.toFixed(4)}`);
    console.log(`\nrun_summary: ${result.run_summary}`);

    // Fetch top 5 upserted titles for quick review.
    const oppsRead = await admin
      .from("opportunities")
      .select("title, opportunity_type, status")
      .eq("scout_run_id", runId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!oppsRead.error && oppsRead.data && oppsRead.data.length > 0) {
      console.log("\nTop upserted opportunities:");
      for (const opp of oppsRead.data) {
        console.log(`  [${opp.opportunity_type ?? "?"}] ${opp.title} (${opp.status ?? "?"})`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Scout run failed:", msg);

    await admin
      .from("scout_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        output: { _meta: { error: { message: msg } } },
      })
      .eq("id", runId);

    process.exit(1);
  }
}

main();
