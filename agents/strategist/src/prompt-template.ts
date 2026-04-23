import fs from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from '@radar/shared';

const PROMPT_PATH = path.join(repoRoot, '.notes/test-b-staged/prompt.md');
const OPPORTUNITIES_PATH = path.join(
  repoRoot,
  '.notes/test-b-staged/opportunities.json',
);

export async function buildSystemPrompt(): Promise<string> {
  const [template, opportunitiesRaw] = await Promise.all([
    fs.readFile(PROMPT_PATH, 'utf8'),
    fs.readFile(OPPORTUNITIES_PATH, 'utf8'),
  ]);
  // Reserialize to normalize whitespace and validate JSON at build time.
  const opportunities = JSON.stringify(JSON.parse(opportunitiesRaw), null, 2);
  return template.replace('{{OPPORTUNITIES}}', opportunities);
}
