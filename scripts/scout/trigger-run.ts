#!/usr/bin/env tsx
// CLI trigger for the Scout Managed Agent run. Bypasses the HTTP route so
// the maintainer can run from terminal. This is a paid operation.
//
// Usage:
//   npx tsx scripts/scout/trigger-run.ts
//   MAX_COST_USD=10 npx tsx scripts/scout/trigger-run.ts
//   QUEUE_SIZE=50 MAX_SOURCES_PER_RUN=100 npx tsx scripts/scout/trigger-run.ts

import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();

import { createClient } from "@supabase/supabase-js";
import { runScoutPerSource } from "../../src/lib/agents/scout/run-agent";
import { SCOUT_PILOT_SOURCES } from "../../src/lib/agents/scout/sources-pilot";
import { expandSourcesViaSitemap } from "../../src/lib/agents/scout/sitemap";
import type { ScoutSource } from "../../src/lib/agents/scout/types";

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
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
      "Run: npx tsx scripts/scout/create-resources.ts --force\n" +
      "Then paste the output into .env.local and re-run.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const maxCostUsd = process.env.MAX_COST_USD ? parseFloat(process.env.MAX_COST_USD) : 10.0;
const queueSize = process.env.QUEUE_SIZE ? parseInt(process.env.QUEUE_SIZE, 10) : 50;
const maxSourcesPerRun = process.env.MAX_SOURCES_PER_RUN
  ? parseInt(process.env.MAX_SOURCES_PER_RUN, 10)
  : 50;

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedupeByUrl(sources: ScoutSource[]): ScoutSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Insert scout_runs row as placeholder (sources_count updated after seed build)
  const nowIso = new Date().toISOString();
  const runInsert = await admin
    .from("scout_runs")
    .insert({
      started_at: nowIso,
      finished_at: null,
      status: "running",
      sources_count: 0,
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

  // 2. Load pilot sources (manual seeds)
  const pilotSources: ScoutSource[] = SCOUT_PILOT_SOURCES;

  // 3. Load queued sources (pending, ordered by priority)
  const queueRead = await admin
    .from("scout_queue")
    .select("url, hint, opportunity_type, status")
    .eq("status", "pending")
    .order("priority_score", { ascending: false })
    .order("discovered_at", { ascending: true })
    .limit(queueSize);

  const queuedSources: ScoutSource[] = (queueRead.data ?? []).map((row) => ({
    url: row.url,
    hint: row.hint,
    opportunity_type: (row.opportunity_type ?? "grant") as ScoutSource["opportunity_type"],
    expected_loc: "global",
  }));

  // 4. Combine pilot + queue, dedup by URL
  const combined = dedupeByUrl([...pilotSources, ...queuedSources]);
  console.log(
    `[scout] seeds: ${pilotSources.length} manual + ${queuedSources.length} queued = ${combined.length} combined (before sitemap expansion)`,
  );

  // 5. Expand via sitemap
  console.log("[scout] pre-fetching sitemaps (this may take 30-60s for large seed sets)...");
  const expanded = await expandSourcesViaSitemap(combined);
  const derivedCount = expanded.length - combined.length;
  console.log(
    `[scout] sitemap expansion: +${derivedCount} derived = ${expanded.length} total`,
  );

  // 6. Cap at MAX_SOURCES_PER_RUN, convert to ScoutSource[]
  const finalSources: ScoutSource[] = expanded.slice(0, maxSourcesPerRun).map((d) => ({
    url: d.url,
    hint: d.hint,
    opportunity_type: d.opportunity_type as ScoutSource["opportunity_type"],
    expected_loc: "global",
  }));

  // Overflow: URLs we did not fit in this run go to scout_queue so a future
  // run picks them up. Nothing is lost from sitemap expansion. Uses upsert
  // semantics via unique index on url; duplicates silently bump priority.
  const overflow = expanded.slice(maxSourcesPerRun);
  if (overflow.length > 0) {
    const overflowRows = overflow.map((d) => ({
      url: d.url,
      hint: d.hint,
      opportunity_type: d.opportunity_type,
      discovered_from: runId,
      priority_score: 1.0,
      status: "pending" as const,
    }));
    // Chunk to avoid oversized payloads.
    const chunkSize = 100;
    for (let i = 0; i < overflowRows.length; i += chunkSize) {
      const chunk = overflowRows.slice(i, i + chunkSize);
      const { error } = await admin
        .from("scout_queue")
        .upsert(chunk, { onConflict: "url", ignoreDuplicates: true });
      if (error) {
        console.warn(`[scout] overflow upsert batch failed: ${error.message}`);
      }
    }
    console.log(`[scout] ${overflow.length} overflow URLs queued for next run`);
  }

  console.log(
    `[scout] seeds: ${pilotSources.length} manual + ${queuedSources.length} queued + ${derivedCount} from sitemaps = ${finalSources.length} (capped at ${maxSourcesPerRun}), cost cap $${maxCostUsd}`,
  );

  // 7. Update scout_runs with actual sources_count
  await admin
    .from("scout_runs")
    .update({ sources_count: finalSources.length })
    .eq("id", runId);

  // Track which source URLs were processed so we can mark them visited in the queue
  const processedUrls: string[] = [];

  try {
    const output = await runScoutPerSource(finalSources, runId, {
      maxCostUsd,
      onSourceComplete: (info) => {
        const errTag = info.error ? ` ERROR: ${info.error}` : "";
        console.log(
          `[scout] source ${info.sourceIndex + 1}/${info.totalSources} done: ${info.url} | upserts=${info.upsertsFromSource} suggestions=${info.suggestionsFromSource} cost=$${info.costUsdFromSource.toFixed(4)} (cumulative $${info.cumulativeCostUsd.toFixed(4)})${errTag}`,
        );
        processedUrls.push(info.url);
      },
    });

    const meta = output._meta;
    const finishedAt = new Date().toISOString();

    // 8. UPDATE scout_runs with final counts
    await admin
      .from("scout_runs")
      .update({
        status: "done",
        finished_at: finishedAt,
        sources_count: finalSources.length,
        pages_fetched: meta.fetches,
        found_count: meta.upserts,
        updated_count: 0,
        discarded_count: meta.discards,
        agent_session_id: meta.session_id || null,
        output: meta as unknown as Record<string, unknown>,
      })
      .eq("id", runId);

    // 9. Mark processed queue entries as visited
    if (processedUrls.length > 0) {
      const visitedAt = new Date().toISOString();
      await admin
        .from("scout_queue")
        .update({
          status: "visited",
          last_visited_at: visitedAt,
          visit_count: 1,
        })
        .in("url", processedUrls)
        .eq("status", "pending");
      console.log(`[scout] marked ${processedUrls.length} queue entries as visited`);
    }

    // 10. Print final stats
    console.log("\n--- Scout run complete ---");
    console.log(`run_id:            ${runId}`);
    console.log(`session_id:        ${meta.session_id} (first source)`);
    console.log(`sources_processed: ${meta.sources_processed ?? output.visited}`);
    console.log(`upserted:          ${output.upserted}`);
    console.log(`discarded:         ${output.discarded}`);
    console.log(`suggestions:       ${meta.suggestions ?? 0}`);
    console.log(`fetches:           ${meta.fetches}`);
    console.log(`iterations:        ${meta.iterations}`);
    console.log(`input_tokens:      ${meta.usage.input_tokens}`);
    console.log(`output_tokens:     ${meta.usage.output_tokens}`);
    console.log(`cost_usd:          $${meta.cost_usd.toFixed(4)}`);
    if (meta.source_errors && meta.source_errors.length > 0) {
      console.log(`source_errors:     ${meta.source_errors.length}`);
      for (const se of meta.source_errors) {
        console.log(`  source ${se.source_index} (${se.url}): ${se.message}`);
      }
    }
    console.log(`\nrun_summary: ${output.run_summary}`);

    // Fetch top 5 upserted titles for quick review
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
