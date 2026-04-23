# Radar

> A career-plan platform for Brazilian developers. Not a job board: a radar for the grants, fellowships, bolsas, and accelerators you didn't know existed.

Built on Anthropic Managed Agents + Claude Opus 4.7. Submitted to the Cerebral Valley *"Built with 4.7"* hackathon, 2026-04.

Demo URL: `radar.pabloaa.com`

## Why

Brazil has one of the strongest engineering talent pools in the world. Uber, Google, Meta, and many other global tech centers run large, high-quality teams across São Paulo, Belo Horizonte, Recife, and other Brazilian cities. The talent is here, and it is world-class.

The problem is different. Brazilian developers often don't know about the opportunities that are actually open to them, and a lot of that talent ends up underutilized. Grants, fellowships, accelerator cohorts, exchange programs, travel scholarships: the pipeline that can meaningfully accelerate a developer's career exists, it is just invisible.

I am writing this from personal experience. I've been through programs that took me to Japan twice (via METI) and to the United States for a Harvard / MIT immersion (via ProLíder). Almost no Brazilian developer I know had heard of these programs before. Every time I post about an opportunity like this to my community of around 60k developers on Instagram ([@pablo_aa](https://instagram.com/pablo_aa)), the same message fills my DMs: *"where did you find this?"*

**Radar's mission: help Brazilian developers reach what they deserve.** Built in public, shipped open source, done together with the community.

## Fun fact (well, real fact)

Of the ~500 developers approved for the *"Built with 4.7"* hackathon, only **2 are Brazilian**. And every single time I post one of these opportunities on Instagram, my DMs fill up with *"how did you find this one??"*. That is the whole thesis in two numbers.

## What it does (MVP)

1. **Anamnesis**: connect your GitHub, upload a resume PDF, optionally drop a personal site URL. A Managed Agent reads all three and builds a structured profile.
2. **Scout**: a shared Managed Agent crawls curated sources on a schedule (FAPESP, Finep, Emergent Ventures, YC, MEXT, Fundação Estudar, Gitcoin, GitHub Sponsors, and many more) and normalizes the universe of current opportunities.
3. **Strategist**: a per-user Managed Agent ranks opportunities against your profile, writes a *why you* paragraph for each, and maps out stacks and programs worth targeting over the next 90 days.

## Architecture

See [`docs/02-architecture.md`](docs/02-architecture.md) for the full picture. Short version: three composed Managed Agents with distinct responsibilities. The Scout runs shared research on a schedule, the Strategist does per-user reasoning against a local opportunities DB, and the Anamnesis layer captures the profile those agents reason over.

## Repo layout

```
radar/
├── apps/
│   └── web/           Next.js 16, landing + auth + live agent UI
├── agents/
│   ├── anamnesis/     profile builder prompt + harness
│   ├── scout/         weekly source crawler prompt + harness
│   └── strategist/    per-user matcher prompt + harness
├── data/
│   ├── sample/        fake profiles for tests and public demos (committed)
│   └── private/       real profile data, experiments (gitignored)
├── docs/              product brief, architecture
└── supabase/          DB migrations
```

## Non-goals

- **Not a job board.** If someone wants a SWE job at a FAANG, LinkedIn and established aggregators already solve that. Radar's universe is grants, fellowships, bolsas, accelerators, OSS funding, bounties, and exchange programs: opportunities you wouldn't otherwise know existed.
- **Not auto-apply.** Radar surfaces, explains, and strategizes. Applying is always the user's decision.
- **Not resume optimization.** Dozens of tools do that already.

## Roadmap

- [x] Capacity test, Managed Agents + web_search validated end-to-end
- [ ] Anamnesis agent
- [ ] Scout agent
- [ ] Strategist agent
- [ ] Web UI (onboarding, cards)
- [ ] Demo video
- [ ] Hackathon submission

## License

AGPL-3.0-or-later. Any hosted fork must share its source under the same license.

## Contact

[pabloaa.com](https://www.pabloaa.com) · [@pablo_aa](https://instagram.com/pablo_aa) · contato@pabloaa.com
