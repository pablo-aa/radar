#!/usr/bin/env tsx
// CLI trigger for the Scout Managed Agent run. Bypasses the HTTP route so
// the maintainer can run from terminal. This is a paid operation (~$0.80-$1.50
// for 5 sources).
//
// Usage:
//   npx tsx scripts/scout/trigger-run.ts
//   MAX_COST_USD=2 npx tsx scripts/scout/trigger-run.ts

import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();

import { createClient } from "@supabase/supabase-js";
import { createScoutSession } from "../../src/lib/agents/scout/run-agent";
import { SCOUT_PILOT_SOURCES } from "../../src/lib/agents/scout/sources-pilot";

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

if (!process.env.SCOUT_AGENT_ID || !process.env.SCOUT_ENVIRONMENT_ID) {
  console.error(
    "Missing SCOUT_AGENT_ID or SCOUT_ENVIRONMENT_ID.\n" +
      "Run: npm run scout:setup\n" +
      "Then paste the output into .env.local and re-run.",
  );
  process.exit(1);
}

const maxCostUsd = process.env.MAX_COST_USD
  ? parseFloat(process.env.MAX_COST_USD)
  : 2.0;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main(): Promise<void> {
  console.log(
    `Scout pilot run: ${SCOUT_PILOT_SOURCES.length} sources, cost cap $${maxCostUsd}`,
  );

  const nowIso = new Date().toISOString();
  const runInsert = await admin
    .from("scout_runs")
    .insert({
      started_at: nowIso,
      finished_at: null,
      status: "running",
      sources_count: SCOUT_PILOT_SOURCES.length,
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

  // Expose the run id so the drain executor can inject it into tool calls.
  process.env.SCOUT_RUN_ID = runId;

  console.log("Creating Scout session...");
  const handle = await createScoutSession(SCOUT_PILOT_SOURCES);
  console.log(`session_id: ${handle.session_id}`);

  // Update the scout_runs row with the session_id before draining.
  await admin
    .from("scout_runs")
    .update({ agent_session_id: handle.session_id })
    .eq("id", runId);

  console.log("Draining Scout session (up to 15 minutes)...\n");

  try {
    const { output, meta } = await handle.drain({
      maxCostUsd,
      onUpsert: (opportunityId, action) => {
        console.log(`  upsert [${action}]: ${opportunityId}`);
      },
    });

    const finishedAt = new Date().toISOString();

    await admin
      .from("scout_runs")
      .update({
        status: "done",
        finished_at: finishedAt,
        sources_count: SCOUT_PILOT_SOURCES.length,
        pages_fetched: meta.fetches,
        found_count: meta.upserts,
        updated_count: 0,
        discarded_count: meta.discards,
        output: meta as unknown as Record<string, unknown>,
      })
      .eq("id", runId);

    console.log("\n--- Scout run complete ---");
    console.log(`run_id:        ${runId}`);
    console.log(`session_id:    ${meta.session_id}`);
    console.log(`visited:       ${output.visited}`);
    console.log(`upserted:      ${output.upserted}`);
    console.log(`discarded:     ${output.discarded}`);
    console.log(`fetches:       ${meta.fetches}`);
    console.log(`iterations:    ${meta.iterations}`);
    console.log(`input_tokens:  ${meta.usage.input_tokens}`);
    console.log(`output_tokens: ${meta.usage.output_tokens}`);
    console.log(`cost_usd:      $${meta.cost_usd.toFixed(4)}`);
    console.log(`\nrun_summary: ${output.run_summary}`);

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
        console.log(
          `  [${opp.opportunity_type ?? "?"}] ${opp.title} (${opp.status ?? "?"})`,
        );
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
