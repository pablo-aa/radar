#!/usr/bin/env tsx
// One-shot CLI to run the Anamnesis agent for a given user_id. Bypasses the
// auth-gated route so the maintainer can trigger from the terminal. Paid.
//
// Usage:
//   npx tsx scripts/strategist/trigger-anamnesis.ts <user_id>

import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });
loadDotenv();

import { createClient } from "@supabase/supabase-js";
import { runAnamnesis } from "../../src/lib/agents/anamnesis/run";
import type { Profile } from "../../src/lib/supabase/types";

const USER_ID = process.argv[2];
if (!USER_ID) {
  console.error("usage: tsx scripts/strategist/trigger-anamnesis.ts <user_id>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`loading profile for ${USER_ID}...`);
  const profRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (profRead.error || !profRead.data) {
    console.error("profile not found:", profRead.error);
    process.exit(1);
  }
  const profile = profRead.data as Profile;
  console.log(`profile: ${profile.github_handle} / ${profile.display_name}`);

  console.log(`inserting anamnesis_runs row (status=running)...`);
  const nowIso = new Date().toISOString();
  const runInsert = await admin
    .from("anamnesis_runs")
    .insert({
      user_id: USER_ID,
      started_at: nowIso,
      finished_at: null,
      status: "running",
      output: null,
      agent_session_id: null,
    })
    .select("id")
    .single();
  if (runInsert.error || !runInsert.data) {
    console.error("insert failed:", runInsert.error);
    process.exit(1);
  }
  const runId = runInsert.data.id;
  console.log(`run_id: ${runId}`);

  console.log(`running anamnesis agent (this takes up to 3 minutes)...`);
  try {
    const result = await runAnamnesis({
      handle: profile.github_handle ?? "",
      display_name: profile.display_name,
      email: profile.email,
      intake: profile.structured_profile,
    });

    console.log(`\n--- result ---`);
    console.log(`tool_calls: ${result._meta.tool_calls}`);
    console.log(`input_tokens:  ${result._meta.usage.input_tokens}`);
    console.log(`output_tokens: ${result._meta.usage.output_tokens}`);
    console.log(`cost_usd:      $${result._meta.cost_usd.toFixed(4)}`);
    console.log(`\nsummary_one_line: ${result.profile.summary_one_line}`);
    console.log(`\nstrengths:`);
    for (const s of result.profile.strengths) console.log(`  - ${s}`);
    console.log(`\ntrajectory: ${result.profile.trajectory}`);

    const finishedAt = new Date().toISOString();
    const runUpdate = await admin
      .from("anamnesis_runs")
      .update({
        status: "done",
        finished_at: finishedAt,
        output: result as unknown as Record<string, unknown>,
      })
      .eq("id", runId);
    if (runUpdate.error) {
      console.error("update failed:", runUpdate.error);
      process.exit(1);
    }

    const profileUpdate = await admin
      .from("profiles")
      .update({
        structured_profile: result.profile as unknown as Record<string, unknown>,
        anamnesis_run_id: runId,
      })
      .eq("user_id", USER_ID);
    if (profileUpdate.error) {
      console.error("profile update failed:", profileUpdate.error);
      process.exit(1);
    }

    console.log(`\npersisted. run_id=${runId}`);
  } catch (err: unknown) {
    console.error("anamnesis failed:", err instanceof Error ? err.message : err);
    const errIso = new Date().toISOString();
    await admin
      .from("anamnesis_runs")
      .update({
        status: "error",
        finished_at: errIso,
        output: {
          _meta: {
            error: {
              message: err instanceof Error ? err.message : String(err),
            },
          },
        },
      })
      .eq("id", runId);
    process.exit(1);
  }
}

main();
