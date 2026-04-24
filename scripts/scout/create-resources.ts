#!/usr/bin/env tsx
// One-shot setup script: creates the Scout Environment and Agent in the
// Managed Agents platform. Run once, then paste the printed ids into .env.local.
//
// Refuses to run if SCOUT_AGENT_ID or SCOUT_ENVIRONMENT_ID is already set
// (to avoid accidental paid duplicate creation). Pass --force to override.
//
// Usage:
//   npm run scout:setup
//   npm run scout:setup -- --force

import { config as loadDotenv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

loadDotenv({ path: ".env.local" });
loadDotenv();

import { SCOUT_MA_SYSTEM_PROMPT } from "../../src/lib/agents/scout/prompt";
import {
  upsertOpportunityToolSpec,
  markDiscardedToolSpec,
} from "../../src/lib/agents/scout/tool-spec";

const force = process.argv.includes("--force");

const existingAgentId = process.env.SCOUT_AGENT_ID;
const existingEnvironmentId = process.env.SCOUT_ENVIRONMENT_ID;

if ((existingAgentId || existingEnvironmentId) && !force) {
  const set = [
    existingAgentId && "SCOUT_AGENT_ID",
    existingEnvironmentId && "SCOUT_ENVIRONMENT_ID",
  ]
    .filter(Boolean)
    .join(", ");
  console.error(
    `\nError: ${set} is already set in your environment.\n` +
      `Re-running would create duplicate paid resources.\n\n` +
      `To force recreation anyway (paid), pass --force:\n` +
      `  npm run scout:setup -- --force\n`,
  );
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY is not set in your environment.");
  process.exit(1);
}

const client = new Anthropic({ apiKey });

// MA agent toolset wrapper. Only web_search and web_fetch are enabled.
// The default_config disables everything else (bash, edit, read, write,
// glob, grep) so the agent cannot touch the filesystem or shell.
const agentToolset = {
  type: "agent_toolset_20260401" as const,
  default_config: {
    enabled: false,
    permission_policy: { type: "always_allow" as const },
  },
  configs: [
    {
      name: "web_search" as const,
      enabled: true,
      permission_policy: { type: "always_allow" as const },
    },
    {
      name: "web_fetch" as const,
      enabled: true,
      permission_policy: { type: "always_allow" as const },
    },
  ],
};

async function main(): Promise<void> {
  console.log("Creating Scout environment...");
  const env = await client.beta.environments.create({
    name: "radar-scout-env",
  });
  console.log(`environment_id: ${env.id}`);

  console.log("Creating Scout agent...");
  const agent = await client.beta.agents.create({
    name: "radar-scout",
    model: "claude-opus-4-7",
    system: SCOUT_MA_SYSTEM_PROMPT,
    tools: [
      agentToolset,
      upsertOpportunityToolSpec,
      markDiscardedToolSpec,
    ],
  });
  console.log(`agent_id: ${agent.id}`);

  console.log("\nPaste into .env.local:");
  console.log(`SCOUT_AGENT_ID=${agent.id}`);
  console.log(`SCOUT_ENVIRONMENT_ID=${env.id}`);
}

main().catch((err: unknown) => {
  console.error(
    "scout:setup failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
