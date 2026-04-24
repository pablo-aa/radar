#!/usr/bin/env tsx
// Read-only ops helper: lists Managed Agent resources named "radar-strategist".
// Use this to recover ids after losing .env.local, before running
// `npm run strategist:setup` (which would create costly duplicates).
//
// Usage:
//   npm run strategist:list

import { config as loadDotenv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

loadDotenv({ path: ".env.local" });
loadDotenv();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY is not set in your environment.");
  process.exit(1);
}

const client = new Anthropic({ apiKey });

async function main() {
  console.log('Listing agents named "radar-strategist"...');
  const agentsPage = await client.beta.agents.list();
  const mine = agentsPage.data.filter(
    (a: { name: string }) => a.name === "radar-strategist",
  );

  if (mine.length === 0) {
    console.log("No agents found with name radar-strategist.");
    console.log("Run `npm run strategist:setup` to create one.");
  } else {
    console.log(JSON.stringify(mine, null, 2));
    console.log("\nPaste the id of the agent you want into .env.local:");
    for (const a of mine) {
      const ag = a as { id: string; name: string; created_at?: string };
      console.log(`STRATEGIST_AGENT_ID=${ag.id}  # created: ${ag.created_at ?? "unknown"}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error("list-resources failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
