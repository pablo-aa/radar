import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { repoRoot } from './repo-root.js';

// Load .env.local from the repo root, anchored to the source file so CWD
// changes (e.g. npm -w <workspace>) do not break resolution.
loadEnv({ path: path.join(repoRoot, '.env.local') });

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  throw new Error(
    'ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local at the repo root and fill it in.',
  );
}

export const client = new Anthropic({ apiKey });
