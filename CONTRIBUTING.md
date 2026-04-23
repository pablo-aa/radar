# Contributing to Radar

Thanks for your interest. This is an early-stage OSS project — the conventions below are how the maintainer works. PRs that follow them get reviewed faster.

## Local setup

```bash
git clone https://github.com/pablo-aa/radar.git
cd radar
# environment + install steps land here as the codebase takes shape
```

## Branches

Branch from `main` using one of these prefixes:

- `feat/<slice>` — user-visible features
- `fix/<issue>` — bug fixes
- `chore/<task>` — tooling, deps, scaffolding, non-user-facing
- `docs/<topic>` — documentation-only changes
- `refactor/<scope>` — code changes with no behavior change

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `<type>: <short summary>`. Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `style`, `build`, `ci`.

Example:

```
feat: add Anamnesis agent with PDF parsing

Reads resume PDF + GitHub activity + personal site and emits a
structured profile JSON to the profiles table.
```

Body explains *why*, not *what* — the diff already shows what.

## Pull requests

- Keep PRs small and focused. One slice per PR.
- Explain *why* in the body; leave *what* to the diff and commit messages.
- Self-review the Files Changed tab before requesting review.
- No `--no-verify`, no force-pushing to `main`.

## Code rules

- TypeScript only. No `any`.
- Secrets never land in the repo — only in `.env.local` (gitignored). Any new env var is added to `.env.example` in the same PR.
- Real user data never lands in the repo — only in `data/private/` (gitignored). Anything committed under `data/sample/` must be fake or fully anonymized.

## License

By contributing you agree your contributions will be licensed under AGPL-3.0-or-later (see [`LICENSE`](LICENSE)).
