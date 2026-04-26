# Managed Agents — design decisions

Why Radar is built on three composed Anthropic Managed Agents and not on the Messages API alone. Companion to [`02-architecture.md`](02-architecture.md).

## The composition

Anamnesis, Scout, Strategist. Three Managed Agent resources, each created once and reused by ID across every session. None of them are recreated per request, which is the failure mode the early Managed Agents documentation warns about and the one our first capacity test hit.

| Agent | Pattern | Lifecycle | Tools |
|---|---|---|---|
| Anamnesis | per-user session, fire-and-forget | minutes per run, quarterly re-runs | `fetch_github_profile`, `fetch_github_repos`, optional CV PDF block |
| Scout | single shared long-running session | weeks of idle between weekly bursts | `web_search`, `web_fetch`, `upsert_opportunity`, `mark_discarded`, `suggest_source` |
| Strategist | per-user session with memory | seconds per run, on intake submit and on demand | `query_opps`, `render_card` |

## Why this is a Managed Agents problem and not a Messages API problem

A flat call to `messages.create` would fail in three places.

### 1. Scout's runtime

Scout produces value over hours, not seconds. It crawls a source, calls `web_fetch`, follows the discovery mandate to suggest 2-5 adjacent URLs, persists structured rows, and ends turn with a one-line plain-text summary. The value isn't a single response, it's the side effects across many tool calls.

Idle Managed Agents sessions are free and survive across runs, which is exactly what a weekly cron needs. We resume the same session every Monday and the agent picks up the queued sources without re-bootstrapping context.

### 2. Strategist's UI streaming

Cards need to appear on screen as the agent reasons, not after a JSON blob is parsed at end-of-message. We register `render_card` as a custom tool and stream `custom_tool_use` events to the frontend, which renders incrementally. The user sees the agent thinking, then a card landing, then another. No spinner, no large-blob parse, no "loading 4 of 8".

Each `render_card` call carries the full card payload (opportunity_id, fit_score, why_you, prep_required, ...), so the UI can render without waiting for the agent's final summary message.

### 3. Anamnesis's output length

The editorial report (archetype, peers, territory, vectors, year-shape, readings) regularly approaches the 16k cliff for a rich profile. We stream with `max_tokens: 32768` and a defensive parser that slices between the first `{` and last `}` (with `jsonrepair` as a fallback) before validation.

Streaming is also a hard requirement on Anthropic's side: any request that may exceed 10 minutes must use the streaming API. Our long-context Anamnesis runs on a CV-rich profile do.

## Eliminatory clarify questions as typed agent input

Before Strategist runs, an intake-clarify step generates 3-5 chip-first questions tuned to the user's profile gaps (categories: `constraint`, `time_budget`, `ambition`, `intensity`, `role_precision`, ...). These produce typed `selected_values`, not free text, which Strategist treats as hard filters before ranking.

A user who answers `relocate_window: no` will not see any opportunity tagged `presencial obrigatorio`. A user who answers `time_budget: lt_5` will not see a full-time accelerator. This pushes filtering out of the LLM and into the data layer, leaving the agent to do what it's good at: narrative why-you reasoning grounded in profile evidence.

The full filter ruleset lives in Strategist's system prompt (`src/lib/agents/strategist/prompt.ts`). It's deterministic, auditable, and survives prompt changes that don't touch the rules.

## What we deliberately don't do

- **Multi-agent direct messaging.** We coordinate between agents via Supabase events, not Claude-to-Claude messages. Multi-agent is research preview, our deadline isn't.
- **Sub-agents per micro-task.** We use skills patterns inside each agent's system prompt instead of spawning sub-agents. Cheaper, simpler, easier to reason about.
- **Hand-rolled retrieval.** Strategist reads from Supabase via `query_opps`, a custom tool that returns structured rows. No vector store, no embedding pipeline. The catalog is small enough that the agent reasons over it directly.
- **Closed-source models or wrappers.** Every agent runs on Claude Opus 4.7 directly via the Managed Agents API. No proxy, no LangChain, no custom orchestrator.

## What we'd add when the platform allows

- **Outcomes (self-verification)** for Scout: each run validates its own upserts against the source URL before persisting.
- **Native Managed Agents triggers** for the weekly Scout cron, replacing the GitHub Actions workflow.
- **Cross-session memory store** in Strategist for rec history that persists beyond a single user session.

## Failure modes we hit and what fixed them

- **Anamnesis truncation at 16k tokens.** Fixed by raising `max_tokens` to 32k and switching to streaming.
- **Model preamble breaking JSON parse** ("Here is the JSON:"). Fixed by slicing between first `{` and last `}`, then running through `jsonrepair`.
- **Sequential agent recreation per session** (early prototype). Fixed by creating Agent + Environment resources once and persisting their IDs in environment variables.
- **Strategist returning low-fit cards alongside high-fit ones**, diluting the recommendation. Fixed by adding eliminatory hard filters and deterministic rule-based scoring as a fallback signal that the LLM can override but not contradict.

## Cost discipline

Real numbers from this build:

- Anamnesis run (rich editorial report + CV ingestion): $0.35 to $0.50
- Strategist run (1,240 opportunities catalog, ranked and filtered): $0.30 to $0.50
- Scout run (50 sources, frontier crawl with discovery): ~$10
- Resend email notifications: free tier

Per-user cost on first onboarding (Anamnesis + Strategist) sits under $1. The expensive hop is Scout, and it amortizes across every user.
