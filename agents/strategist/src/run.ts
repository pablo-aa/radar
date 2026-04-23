import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  client,
  CostMeter,
  logEvent,
  makeRenderCardHandler,
  repoRoot,
} from '@radar/shared';
import type { AgentIds } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDS_PATH = path.resolve(__dirname, '..', '.agent-ids.json');
const PROFILE_PATH = path.join(repoRoot, '.notes/test-b-staged/profile.json');

async function main() {
  if (!fs.existsSync(IDS_PATH)) {
    console.error(
      `.agent-ids.json not found at ${IDS_PATH}. Run \`npm run strategist:setup\` first.`,
    );
    process.exit(1);
  }
  const ids: AgentIds = JSON.parse(fs.readFileSync(IDS_PATH, 'utf8'));
  console.log(`agent_id:       ${ids.agent_id}`);
  console.log(`environment_id: ${ids.environment_id}`);

  const profileRaw = await fsp.readFile(PROFILE_PATH, 'utf8');
  // Validate JSON, reserialize for consistent formatting in the prompt.
  const profile = JSON.stringify(JSON.parse(profileRaw), null, 2);

  console.log('creating session...');
  const session = await client.beta.sessions.create({
    environment_id: ids.environment_id,
    agent: { type: 'agent', id: ids.agent_id },
  });
  console.log(`session_id: ${session.id}`);

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const renderCard = makeRenderCardHandler(runId);
  const cost = new CostMeter();

  const userText = `Produce the 4-section plan for this user. Return the final JSON at the end of your response.\n\n<user_profile>\n${profile}\n</user_profile>`;

  console.log('sending user.message...');
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: userText }],
      },
    ],
  });

  console.log('streaming events...');
  const stream = await client.beta.sessions.events.stream(session.id);

  for await (const ev of stream as AsyncIterable<any>) {
    logEvent(ev);
    cost.observe(ev);

    if (ev?.type === 'agent.custom_tool_use') {
      if (ev.name === 'render_card') {
        const result = renderCard.handle(ev.input);
        await client.beta.sessions.events.send(session.id, {
          events: [
            {
              type: 'user.custom_tool_result',
              custom_tool_use_id: ev.id,
              content: [{ type: 'text', text: JSON.stringify(result) }],
            },
          ],
        });
      } else {
        console.log(`[warn] unknown custom tool call: ${ev.name}`);
      }
    }

    if (
      ev?.type === 'session.status_idle' ||
      ev?.type === 'session.status_terminated'
    ) {
      break;
    }
  }

  cost.report();
  console.log(`\ncards written to: ${renderCard.outFile}`);
}

main().catch((err) => {
  console.error('run failed:', err);
  process.exit(1);
});
