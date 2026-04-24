#!/usr/bin/env tsx
// Standalone smoke test for the Strategist Managed Agent. Mirrors the proven
// pattern from the internal validation harness but runs outside Next.js so
// we can rule out dev-server SSE interference. Prints every event.

import { config as loadDotenv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

loadDotenv({ path: ".env.local" });
loadDotenv();

const apiKey = process.env.ANTHROPIC_API_KEY;
const agentId = process.env.STRATEGIST_AGENT_ID;
const environmentId = process.env.STRATEGIST_ENVIRONMENT_ID;
if (!apiKey || !agentId || !environmentId) {
  console.error("Missing ANTHROPIC_API_KEY or STRATEGIST_AGENT_ID or STRATEGIST_ENVIRONMENT_ID");
  process.exit(1);
}

const client = new Anthropic({ apiKey });

async function main() {
  console.log("creating session...");
  const session = await client.beta.sessions.create({
    environment_id: environmentId!,
    agent: { type: "agent", id: agentId! },
  });
  console.log("session_id:", session.id);

  const profile = {
    user_id: "smoke-test",
    github_handle: "smoke",
    display_name: "Smoke Test",
    structured_profile: { skills: ["ts"], interests: ["ai"] },
  };
  const opps = [
    { id: "op_0001", title: "Test fellowship", category: "dated_one_shot", source_url: "https://example.com", funding_brl: "R$ 50k", deadline: "2026-06-01" },
    { id: "op_0002", title: "Test arena", category: "arena", source_url: "https://example.com/a" },
  ];
  const userText =
    "Produce the 4-section plan for this user. Return the final JSON at the end of your response.\n\n" +
    "<user_profile>\n" + JSON.stringify(profile, null, 2) + "\n</user_profile>\n\n" +
    "<opportunities>\n" + JSON.stringify(opps, null, 2) + "\n</opportunities>";

  console.log("sending user.message...");
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: [{ type: "text", text: userText }] }],
  });

  console.log("streaming events...");
  const stream = await client.beta.sessions.events.stream(session.id);

  let count = 0;
  for await (const ev of stream as AsyncIterable<{ type: string; id?: string; name?: string }>) {
    count++;
    console.log(`[#${count}] ${ev.type}${ev.name ? ` name=${ev.name}` : ""}${ev.id ? ` id=${ev.id}` : ""}`);
    if (ev.type === "session.status_idle" || ev.type === "session.status_terminated") break;
    if (count > 100) {
      console.log("stopping after 100 events");
      break;
    }
  }
  console.log(`\ntotal events: ${count}`);
  await client.beta.sessions.delete(session.id).catch(() => undefined);
}

main().catch((err) => {
  console.error("smoke-test failed:", err);
  process.exit(1);
});
