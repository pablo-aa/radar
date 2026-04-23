import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { client, renderCardToolSpec } from '@radar/shared';
import { buildSystemPrompt } from './prompt-template.js';
import type { AgentIds } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDS_PATH = path.resolve(__dirname, '..', '.agent-ids.json');

async function main() {
  if (fs.existsSync(IDS_PATH)) {
    console.error(
      `.agent-ids.json already exists at ${IDS_PATH}. Delete it first if you intend to recreate the Agent and Environment (paid operation).`,
    );
    process.exit(1);
  }

  console.log('building system prompt from staged files...');
  const systemPrompt = await buildSystemPrompt();
  console.log(`system prompt length: ${systemPrompt.length} chars`);

  console.log('creating environment...');
  const env = await client.beta.environments.create({
    name: 'radar-strategist-env',
  });
  console.log(`environment_id: ${env.id}`);

  console.log('creating agent...');
  const agent = await client.beta.agents.create({
    name: 'radar-strategist',
    model: 'claude-opus-4-7',
    system: systemPrompt,
    tools: [renderCardToolSpec],
  });
  console.log(`agent_id: ${agent.id}`);

  const payload: AgentIds = {
    agent_id: agent.id,
    environment_id: env.id,
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(IDS_PATH, JSON.stringify(payload, null, 2));
  console.log(`\nwrote ${IDS_PATH}`);
  console.log(`agent_id:       ${payload.agent_id}`);
  console.log(`environment_id: ${payload.environment_id}`);
}

main().catch((err) => {
  console.error('create-resources failed:', err);
  process.exit(1);
});
