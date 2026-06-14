# halflife

[![CI](https://github.com/internetyev/halflife/actions/workflows/ci.yml/badge.svg)](https://github.com/internetyev/halflife/actions/workflows/ci.yml)

> A viral web tool that takes a job title and returns an **AI-obsolescence countdown**, a **survival score**, the **AI tools already disrupting the role**, and a **personalised pivot roadmap** — packaged as a shareable card.

The Claude API is the product. There is no proprietary model and no rules engine: the analysis, scoring, and pivot steps are all structured Claude tool-use calls, fronted by aggressive caching. See [`PLAN.md`](PLAN.md) for the full thesis and audience notes.

## Status

**Pre-launch.** The application is built: the analyze API + Claude tool-use call, KV cache, input form + result card, OG image route, per-role pages, share buttons, the 2026 at-risk report page, and the full SEO/metadata/error-boundary surface have all landed (Phases 0–4 in [`ROADMAP.md`](ROADMAP.md)). What remains is Phase 5 launch prep — and the leaves still open there are **human-gated**: final naming + domain purchase, the live seed pass (needs a real `ANTHROPIC_API_KEY`), the Vercel deploy, and activating email capture. The routine cannot run those, so it fills burn windows with self-maintaining launch-readiness leaves (CI, validators, tests, metadata routes) instead.

The build is driven by an autonomous Claude Code routine that runs at night from the maintainer's MacBook (launchd agent). It runs hot on weekend nights (the "burn" window, capped at $3 of token use per run) and at ~⅓ intensity on weeknights ($1 per run); both caps are Max-subscription-quota proxies, not real cash. Each run lands one leaf as an auto-merged PR. The protocol is in [`ROUTINE.md`](ROUTINE.md).

## Stack (working assumption)

- **Frontend:** Next.js 15 App Router, TypeScript (strict), Tailwind v4, shadcn/ui
- **AI:** Anthropic SDK, Claude Sonnet 4.6, prompt caching, structured tool-use for JSON
- **Cache:** Vercel KV, keyed by slugified job title, 30-day TTL
- **Hosting:** Vercel (built-in OG image route, edge caching)
- **Analytics:** Plausible

These are starting positions; revisits are allowed and tracked in [`DECISIONS.md`](DECISIONS.md).

## Local setup

> ⚠️ The autonomous routine does **not** run package installs. The first human to clone the repo runs them by hand.

```bash
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY + KV_* from Vercel
npm install                  # or pnpm / yarn — lockfile choice TBD
npm run dev
```

Required env vars are documented inline in [`.env.example`](.env.example). `ANTHROPIC_API_KEY` is required for any analyze call; the four `KV_*` vars come from a linked Vercel KV store. Local-only runs without KV will fall through to uncached calls — fine for dev, never for prod.

## Development

After the one-time `npm install`, the same checks CI runs are available locally. The repo-root [`Makefile`](Makefile) wraps them in CI order so `make ci` runs exactly what `.github/workflows/ci.yml` runs:

```bash
make help        # list every target (default)
make ci          # typecheck → lint → build → validate → test → test-py
make test        # node:test suites under scripts/__tests__/ (npm test)
make test-py     # python unittest discovery for scripts/rank-job-titles.py
```

Or call the underlying tools directly:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build       # next build
npm run validate    # schema-check committed data/ JSON (roles, report, job-titles)
npm test            # node --test scripts/__tests__/*.test.mjs
python3 -m unittest discover -s scripts/__tests__ -p 'test_*.py'
```

The `validate` and `test` targets are zero-dependency (Node + Python stdlib only) and pass against an empty `data/` tree, so they stay green through the pre-seed period and start catching malformed JSON the moment the seed pass commits files.

## Document map

| File | Purpose |
|------|---------|
| [`PLAN.md`](PLAN.md) | What halflife is and why now |
| [`ROADMAP.md`](ROADMAP.md) | Phased work breakdown, leaf-by-leaf |
| [`ROUTINE.md`](ROUTINE.md) | Protocol the autonomous routine follows each run |
| [`DECISIONS.md`](DECISIONS.md) | Append-only ADR-style log |
| [`docs/architecture.md`](docs/architecture.md) | How the codebase fits together — request flow, data pipeline, recurring patterns |
| [`docs/data-schema.md`](docs/data-schema.md) | Field-by-field contract for the on-disk JSON artifacts under `data/` |
| [`docs/operations.md`](docs/operations.md) | Post-deploy runbook — verify, re-run the pipeline, bust/roll back the cache, rotate keys |
| [`docs/methodology.md`](docs/methodology.md) | How the obsolescence score is constructed |
| [`LEDGER.md`](LEDGER.md) | Per-run spend (Claude + corgi) |
| [`BLOCKED.md`](BLOCKED.md) | Present only when a run hit a blocker the human must resolve |

## Contributing

This repo is currently driven by the routine. PRs from `claude/*` branches squash-merge automatically (see `.github/workflows/auto-merge-claude.yml`). Human-authored PRs are welcome but go through normal review — see [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) for the contributor guide and [`SECURITY.md`](SECURITY.md) for the disclosure policy.

## License

Not yet chosen — to be settled before public launch (tracked as a Phase 5 decision).
