#!/usr/bin/env tsx
// One-shot setup script: creates the Strategist Environment and Agent in the
// Managed Agents platform. Run once per environment, then paste the printed
// ids into .env.local.
//
// Refuses to run if STRATEGIST_AGENT_ID or STRATEGIST_ENVIRONMENT_ID is
// already set (to avoid accidental paid duplicate creation). Pass --force
// to override.
//
// Usage:
//   npm run strategist:setup
//   npm run strategist:setup -- --force

import { config as loadDotenv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

loadDotenv({ path: ".env.local" });
loadDotenv();
import { STRATEGIST_SYSTEM_PROMPT } from "../../src/lib/agents/strategist/prompt";
import { renderCardToolSpec } from "../../src/lib/agents/strategist/tool-spec";

const force = process.argv.includes("--force");

const agentId = process.env.STRATEGIST_AGENT_ID;
const environmentId = process.env.STRATEGIST_ENVIRONMENT_ID;

if ((agentId || environmentId) && !force) {
  const set = [agentId && "STRATEGIST_AGENT_ID", environmentId && "STRATEGIST_ENVIRONMENT_ID"]
    .filter(Boolean)
    .join(", ");
  console.error(
    `\nError: ${set} is already set in your environment.\n` +
      `Re-running would create duplicate paid resources.\n\n` +
      `To recover existing ids, run:\n` +
      `  npm run strategist:list\n\n` +
      `To force recreation anyway (paid), pass --force:\n` +
      `  npm run strategist:setup -- --force\n`,
  );
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY is not set in your environment.");
  process.exit(1);
}

const client = new Anthropic({ apiKey });

async function main() {
  console.log("Creating environment...");
  const env = await client.beta.environments.create({
    name: "radar-strategist-env",
  });
  console.log(`environment_id: ${env.id}`);

  console.log("Creating agent...");
  const agent = await client.beta.agents.create({
    name: "radar-strategist",
    model: "claude-opus-4-7",
    system: STRATEGIST_SYSTEM_PROMPT,
    tools: [renderCardToolSpec],
  });
  console.log(`agent_id: ${agent.id}`);

  console.log("\nPaste into .env.local:");
  console.log(`STRATEGIST_AGENT_ID=${agent.id}`);
  console.log(`STRATEGIST_ENVIRONMENT_ID=${env.id}`);
}

main().catch((err: unknown) => {
  console.error("create-resources failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
