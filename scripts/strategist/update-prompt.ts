#!/usr/bin/env tsx
// Push the current STRATEGIST_SYSTEM_PROMPT (from src/lib/agents/strategist/prompt.ts)
// to the live Managed Agent identified by STRATEGIST_AGENT_ID. The agent's
// system prompt is locked at creation time, so editing prompt.ts only affects
// future create-resources runs unless this script is also run to push the
// change to the existing agent.
//
// Tools (render_card etc.) are NOT updated by this script; if the tool
// schema changes, run scripts/strategist/create-resources.ts -- --force
// to recreate the agent (paid, gives a new id).
//
// Usage:
//   npm run strategist:update-prompt

import { config as loadDotenv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

loadDotenv({ path: ".env.local" });
loadDotenv();

import { STRATEGIST_SYSTEM_PROMPT } from "../../src/lib/agents/strategist/prompt";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY is not set in your environment.");
  process.exit(1);
}

const agentId = process.env.STRATEGIST_AGENT_ID;
if (!agentId) {
  console.error(
    "Error: STRATEGIST_AGENT_ID is not set. Run npm run strategist:setup first.",
  );
  process.exit(1);
}

const client = new Anthropic({ apiKey });

async function main() {
  // Fetch current version (required for optimistic concurrency on update).
  console.log(`Fetching current agent version for ${agentId}...`);
  const current = await client.beta.agents.retrieve(agentId!);
  // The MA API uses an integer version field for concurrency control.
  // Cast through unknown because the SDK retrieve type does not formally
  // expose the field (yet still returns it in the response body).
  const version = (current as unknown as { version: number }).version;
  if (typeof version !== "number") {
    console.error(
      "Error: could not read version from retrieve response.",
      current,
    );
    process.exit(1);
  }
  console.log(`Current version: ${version}.`);
  console.log(`Updating system prompt...`);
  const updated = await client.beta.agents.update(agentId!, {
    version,
    system: STRATEGIST_SYSTEM_PROMPT,
  });
  console.log(`Updated. agent_id=${updated.id}`);
  console.log(`Prompt length: ${STRATEGIST_SYSTEM_PROMPT.length} chars.`);
  console.log("Future sessions will use the new prompt immediately.");
}

main().catch((err: unknown) => {
  console.error(
    "update-prompt failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
