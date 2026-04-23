# Strategist Agent

Per-user. Trigger: weekly cron per user, or on-demand. Input: user profile + opportunities DB + trends DB. Tools: custom "query_db" tool, no web_search needed. Output: 5 opportunity cards + 3 skill cards + 3 program cards + 90-day plan.

## Running Test B

Prereq: `.env.local` at the repo root with `ANTHROPIC_API_KEY` filled in (copy from `.env.example`).

1. Install workspace deps once from the repo root: `npm install`.
2. Create the Agent and Environment once: `npm run strategist:setup`. This writes `agents/strategist/.agent-ids.json`, which acts as the reuse lock. Makes a small paid API call.
3. Run a per-session plan: `npm run strategist:run`. Confirm with Pablo before running, this is the paid per-session call.

Output is written to `.notes/test-b-runs/<timestamp>.json` as the stream emits card tool calls.

Notes:
- `.agent-ids.json` is gitignored. Delete it if you intentionally want to recreate the Agent and Environment.
- Staged inputs live in `.notes/test-b-staged/` (prompt, opportunities, profile) and are read at runtime by the harness.
