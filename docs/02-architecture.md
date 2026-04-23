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
│     Input: GitHub username + resume PDF + personal site  │
│     Tools: web_fetch (read personal site), bash (parse   │
│            PDF), custom "save_profile" tool                │
│     Output: structured profile JSON → profiles table      │
└──────────────────────────────────────────────────────────┘
                           ↓
                   profiles (Supabase)
                           ↓
┌──────────────────────────────────────────────────────────┐
│  2. SCOUT AGENT (shared across all users)                 │
│     Trigger: cron, weekly                                 │
│     Input: none (reads canonical source list from DB)     │
│     Tools: web_search + web_fetch + bash + custom        │
│            "save_opportunities" tool                       │
│     Output: rows in opportunities table + trends table   │
└──────────────────────────────────────────────────────────┘
                           ↓
                opportunities, trends (Supabase)
                           ↓
┌──────────────────────────────────────────────────────────┐
│  3. STRATEGIST AGENT (per-user)                          │
│     Trigger: weekly cron per user, or on-demand           │
│     Input: user profile + opportunities DB + trends DB   │
│     Tools: custom "query_db" tool — no web_search needed  │
│     Output: 5 opportunity cards + 3 skill cards +         │
│             3 program cards + 90-day plan                  │
└──────────────────────────────────────────────────────────┘
                           ↓
                     run_outputs (Supabase)
                           ↓
                   delivered to user
```

## Data model (sketch)

```
profiles          id · user_id · github · linkedin · pdf_url · site_url
                   · structured_profile JSONB · anamnesis_run_id · updated_at

opportunities     id · source_url · title · deadline · funding_brl
                   · category (grant|fellowship|accelerator|bounty|...)
                   · tags TEXT[] · raw_content TEXT · scout_run_id · created_at

trends            id · stack · trajectory_note · evidence_url · scout_run_id

run_outputs       id · user_id · strategist_run_id · cards JSONB · created_at
```

## Future layer (out of scope for MVP)

**Deep-Dive Agent** — on-demand per opportunity:

- User clicks *"help me apply"* on a card
- Agent does deep research: recent successful applicants, reviewer preferences, application red flags
- Writes a short email draft + cites which repos or projects to highlight

## Open tensions (decisions to revisit)

- **Cron runtime for Scout** — Supabase Edge Functions vs. Vercel Cron vs. external scheduler
- **Anamnesis cache** — re-run from scratch quarterly vs. incremental diff of GitHub activity
- **Personal-site fetching when a site blocks the default crawler** — evaluate fallbacks only when observed failures justify the cost
- **Scout source list format** — hand-curated YAML vs. seeded Supabase table vs. Scout discovers its own sources
