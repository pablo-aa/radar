import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives at agents/_shared/src/repo-root.ts.
// Repo root is three directories up. Anchoring to the source file (not
// process.cwd()) keeps paths correct under `npm -w <workspace> run ...`,
// which changes CWD to the workspace directory.
const __filename = fileURLToPath(import.meta.url);
export const repoRoot = path.resolve(path.dirname(__filename), '..', '..', '..');
