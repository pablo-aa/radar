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

After onboarding (LinkedIn + GitHub + resume PDF + optional personal site), the user receives three outputs on a weekly cadence:

1. **5 opportunities firing now** — real cards with source URL, deadline, funding value in BRL, and a *why you* paragraph referencing specific repos, projects, or profile fields.
2. **3 skills or stacks worth exploring** — grounded in the user's current profile + broader market trends.
3. **3 long-horizon programs** — masters, fellowships, or residencies realistic to target over the next 12–24 months.

Plus a **90-day plan** synthesizing which actions move them closer to the long-horizon programs.

## Differentiation

Two things make Radar structurally different from generic AI career tools:

- **BR institutional context.** The reasoning layer understands Simples Nacional, MEI/PJ, FAPESP, Finep, Emergent Ventures, Fundação Estudar, StartOut Brasil. A grant that requires MEI is flagged. A USD prize is converted to BRL at the current rate. A program restricted to specific Brazilian states is filtered out for users who live elsewhere.
- **The opportunity universe is grants, fellowships, and bolsas — not jobs.** Radar indexes what almost nobody aggregates for individual developers: Brazilian research grants, international fellowships open to Brazilians, OSS funding programs, accelerator cohorts with upcoming deadlines, exchange programs and travel scholarships. If someone wants a SWE job, Radar will point them elsewhere.

## Non-goals

- Job matching, auto-apply, or resume optimization
- Interview mock coaching
- High-volume LinkedIn scraping
- Mobile-native app (web-first for now)
