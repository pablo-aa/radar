# CLAUDE.md

Project-specific instructions for Claude Code sessions working on Radar.

## Start every session by reading

1. **`.notes/session-handoff.md`** if it exists: that file is the single source of truth for current state, architecture decisions, next task, and workflow protocols. Read it before doing anything else.
2. `README.md` and `docs/` for the public-facing context.

If `.notes/session-handoff.md` does NOT exist, you're running in a freshly-cloned public checkout. In that case, the repo docs are the only context; don't guess at private information.

## What Radar is

A career-plan platform for Brazilian developers. Multi-agent Claude system built on Anthropic Managed Agents + Claude Opus 4.7. Submitted to the Cerebral Valley "Built with 4.7" hackathon (April 2026).

Three agents: **Anamnesis** (profile builder), **Scout** (shared weekly opportunity crawler), **Strategist** (per-user matcher). See `docs/02-architecture.md` for the full picture.

## Delegation rules

Delegate specialized work to subagents rather than doing everything in the main session:

- **Multi-file changes, refactors, non-trivial implementation** → `oh-my-claudecode:executor` (sonnet for standard, opus for complex)
- **Broad codebase research** → `Explore` or `oh-my-claudecode:explore`
- **Architecture discussion** → `oh-my-claudecode:architect` (read-only)
- **Unfamiliar SDK or library** → `oh-my-claudecode:document-specialist` or the `context7` MCP
- **Debugging with unclear root cause** → `oh-my-claudecode:debugger`
- **Planning non-trivial work** → `oh-my-claudecode:planner` or the `/plan` skill
- **Verification before declaring done** → `oh-my-claudecode:verifier`

Work directly only for: trivial ops, single-file reads, git plumbing, small clarifications.

## Pre-commit protocol

Before every `git commit`:

### 1. Superpowers code review

Invoke `superpowers:requesting-code-review` to dispatch the `superpowers:code-reviewer` subagent. The reviewer gets precisely-crafted context about the change, not session history, so it stays focused on the diff.

- Fix Critical issues immediately
- Fix Important issues before committing
- Note Minor issues for later

### 2. Privacy-leak check

Scan staged changes for:

- **Secrets**: `sk-ant-`, `sk-proj-`, `ghp_`, `xoxp-`, `sb_secret_`, JWT tokens, OAuth tokens, any string matching `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `BEARER`.
- **Personal data**: real user profiles, private emails (keep `contato@pabloaa.com` only), DM content, transcripts.
- **Strategic content**: competitor names, pricing deliberations, financial projections, monetization tier analysis, internal narrative. Those live in `.notes/` and must not leak into public files.
- **Absolute paths** from the developer's machine (e.g., `/Users/*`).

Quick spot-check:
```bash
git diff --cached | grep -iE "sk-ant-|sk-proj-|ghp_|xoxp-|sb_secret|eyJ[A-Za-z0-9_=]{20}" || echo "no obvious secrets"
git diff --cached --stat
```

If anything questionable is flagged: **stop**, fix it, and reconsider the commit scope.

## Git workflow

- Push to `main` directly while the repo is private. Branches only when a feature explicitly warrants it.
- When iterating on a single commit on a private repo, `git commit --amend` + `git push --force-with-lease` is acceptable. Otherwise default to new commits.
- [Conventional Commits](https://www.conventionalcommits.org/): `<type>: <summary>`. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `style`, `build`, `ci`.
- Commit bodies explain *why*, not *what*. The diff shows what.
- Never commit secrets. Never commit contents of `.notes/` or `data/private/`.
- Always include the co-author trailer on commits authored with Claude:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```

## Directory structure

- `apps/web/`: Next.js 16 app (landing, auth, live agent UI). Not created yet.
- `agents/`: the three Managed Agents' prompts, harnesses, and any custom tools. Not created yet.
- `data/sample/`: fake seed data, safe for the public repo.
- `data/private/`: real user data for local iteration. **Gitignored.** Never commit.
- `docs/`: public product brief + architecture docs for contributors.
- `supabase/`: DB migrations. Not created yet.
- `.notes/`: **Gitignored.** Private strategy, research, transcripts, session handoffs. Never commit.
- `.env.local`: **Gitignored.** Secrets only. Mirror the schema in `.env.example`.

## Cost discipline

Running Managed Agent sessions costs real money. Before any run that incurs cost, confirm with the user. Log token usage + cost to the console after every run so we can track unit economics.

## Tone

Direct, unpretentious, slightly irreverent when it helps. Mix Portuguese and English naturally when communicating with the maintainer. Avoid em-dashes (`—`) and double-dashes (`--`) in user-facing text; prefer commas, colons, or periods.

## Scope guardrails

Radar is focused on **grants, fellowships, bolsas, accelerators, and career arenas**, not jobs. Do not silently expand the scope to resume optimization, job matching, auto-apply, or interview coaching. Those are saturated categories and explicitly out of scope for this product cycle.
