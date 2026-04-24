# Architecture — Radar

Three composed Managed Agents with distinct responsibilities. Built on Anthropic Managed Agents (beta) + Claude Opus 4.7.

## Why multi-agent (and not "one agent that does everything")

- **Shared research amortizes.** Most of the *"what opportunities exist this week?"* question has the same answer across thousands of users. Running that research once on a schedule and storing the results in a shared database scales cleanly.
- **Matching is cheap when the knowledge base is local.** Once opportunities sit in Supabase, the per-user matching agent no longer needs web search — it reads from the database and reasons over the user's profile. Clean separation of responsibilities.
- **Each layer is independently observable and replaceable.** A future change to any single agent (new prompt, new model, new tools) doesn't cascade through the whole system.

## The three agents

```
┌──────────────────────────────────────────────────────────┐
│  1. ANAMNESIS AGENT                                      │
│     Trigger: on sign-up + quarterly re-run                │
│     Input: GitHub handle (primary) + optional CV-style    │
│            document + optional personal site URL          │
│     Tools: web_fetch (read personal site and GitHub),     │
│            file processing for the document, custom       │
│            save_profile tool                               │
│     Output: structured profile JSON → profiles table      │
└──────────────────────────────────────────────────────────┘
                           ↓
                   profiles (Supabase)
                           ↓
┌──────────────────────────────────────────────────────────┐
│  2. SCOUT AGENT (shared across all users)                 │
│     Trigger: cron, weekly                                 │
│     Input: none (reads canonical source list from DB)     │
│     Tools: web_search + web_fetch + bash + custom         │
│            save_opportunities_batch tool                   │
│     Output: rows in opportunities + scout_runs +          │
│             scout_discarded                                │
└──────────────────────────────────────────────────────────┘
                           ↓
                  opportunities (Supabase)
                           ↓
┌──────────────────────────────────────────────────────────┐
│  3. STRATEGIST AGENT (per-user)                          │
│     Trigger: weekly cron per user, or on-demand           │
│     Input: user profile + opportunities DB                │
│     Tools: custom query_opps tool, custom render_card     │
│            tool, no web_search needed                      │
│     Output: 4-section plan (dated one-shot, recurrent     │
│             annual, rolling, arenas) + 3 to 5 item        │
│             90-day plan                                    │
└──────────────────────────────────────────────────────────┘
                           ↓
                  strategist_runs (Supabase)
                           ↓
                   delivered to user
```

## Data model (sketch)

```
profiles          user_id · github_handle · cv_url · site_url
                   · structured_profile JSONB · onboard_state JSONB
                   · anamnesis_run_id · updated_at

opportunities     id · source_url · title · deadline · funding_brl
                   · category (dated_one_shot | recurrent_annual
                               | rolling | arena)
                   · deep_data JSONB · scout_run_id
                   · created_at · updated_at

scout_runs        id · started_at · finished_at · sources_count
                   · found · updated · discarded · agent_session_id
                   · status

scout_discarded   id · scout_run_id · host · path
                   · reason (out-of-scope | duplicate | unchanged
                             | throttled | error | low-fit
                             | unverifiable)
                   · detail · decided_at

anamnesis_runs    id · user_id · started_at · finished_at
                   · agent_session_id · status · output JSONB

strategist_runs   id · user_id · started_at · finished_at
                   · profile_snapshot JSONB · opportunity_ids[]
                   · output JSONB · agent_session_id · status
```

## Future layer (out of scope for MVP)

**Deep-Dive Agent** — on-demand per opportunity:

- User clicks *"help me apply"* on a card
- Agent does deep research: recent successful applicants, reviewer preferences, application red flags
- Writes a short email draft + cites which repos or projects to highlight

## Open tensions (decisions to revisit)

- **Cron runtime for Scout**: Supabase Edge Functions vs. Vercel Cron vs. external scheduler.
- **Anamnesis cache**: re-run from scratch quarterly vs. incremental diff of GitHub activity.
- **Personal-site fetching when a site blocks the default crawler**: evaluate fallbacks only when observed failures justify the cost.
- **Scout source list format**: hand-curated YAML vs. seeded Supabase table vs. Scout discovers its own sources.
