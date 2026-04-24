# Product brief — Radar

## One-liner

Radar is a career-plan platform for Brazilian developers that uses multi-agent Claude research to surface grants, fellowships, bolsas, and accelerator opportunities they'd otherwise never see — and maps out the skills and programs worth targeting over the next 90 days.

## The pain

Brazil has world-class engineering talent. Major global tech centers (Uber, Google, Meta, and others) employ large Brazilian teams, and the country consistently produces developers who perform at the frontier of the industry. And yet only 2 out of ~500 developers at the Cerebral Valley *"Built with 4.7"* hackathon are Brazilian.

The problem is not talent. It's **discovery**: the pipeline of opportunities that would materially accelerate a developer's career — research grants, international fellowships, accelerator cohorts, exchange programs, travel scholarships, OSS funding — is effectively invisible to Brazilian developers. Nobody indexes this universe for them in a BR-aware, dev-friendly way.

The author has firsthand experience with underpublicized programs (METI Japan, Harvard/MIT via ProLíder) and runs a ~60k-developer community on Instagram where the consistent response to these opportunities is *"I had no idea this existed."* Radar turns that repeated moment into a product.

## Who it's for

**Primary audience:** Brazilian developers, any stack, any seniority, indie or employed. English reading-level B1 or higher (most opportunities publish in English).

**Secondary audience (future):** tech recruiters who would benefit from structured access to qualified, career-ambitious Brazilian developer profiles.

## What they get (MVP output)

After onboarding (GitHub plus an optional CV-style document and personal site URL), the user receives a weekly **radar** organized into four opportunity sections plus a 90-day plan:

1. **Dated, one-shot** (up to 3) — programs with a specific deadline this year (e.g. YC batch, Chevening).
2. **Recurrent, annual** (up to 3) — programs that return every year, worth preparing for now (e.g. METI Japan, MEXT, GSoC, Maratona SBC).
3. **Rolling** (up to 2) — always-open programs with a 2-to-6-week decision window (e.g. Emergent Ventures, GDE, Gitcoin).
4. **Arenas** (up to 3) — ongoing practice or visibility tracks with no deadline, suggested cadence (e.g. competitive programming, OSS contribution, building in public).

Each card carries a fit score, the source URL, a deadline or cadence, a funding figure, and a *why you* paragraph that cites specific profile fields. The radar closes with a **90-day plan** of 3 to 5 sequenced actions, each tied to one of the cards above.

## Differentiation

Two things make Radar structurally different from generic AI career tools:

- **BR institutional context.** The reasoning layer understands Simples Nacional, MEI/PJ, FAPESP, Finep, Emergent Ventures, Fundação Estudar, StartOut Brasil. A grant that requires MEI is flagged. A USD prize is converted to BRL at the current rate. A program restricted to specific Brazilian states is filtered out for users who live elsewhere.
- **The opportunity universe is grants, fellowships, and bolsas — not jobs.** Radar indexes what almost nobody aggregates for individual developers: Brazilian research grants, international fellowships open to Brazilians, OSS funding programs, accelerator cohorts with upcoming deadlines, exchange programs and travel scholarships. If someone wants a SWE job, Radar will point them elsewhere.

## Non-goals

- Job matching, auto-apply, or resume optimization
- Interview mock coaching
- High-volume LinkedIn scraping
- Mobile-native app (web-first for now)
