# halflife

> A viral web tool that takes a job title and returns an **AI-obsolescence countdown**, a **survival score**, the **AI tools already disrupting the role**, and a **personalised pivot roadmap** — packaged as a shareable card.

The Claude API is the product. There is no proprietary model and no rules engine: the analysis, scoring, and pivot steps are all structured Claude tool-use calls, fronted by aggressive caching. See [`PLAN.md`](PLAN.md) for the full thesis and audience notes.

## Status

**Planning + foundation.** No app code yet — the manifest (`package.json`), Tailwind v4 + shadcn config, and this scaffolding are landing one leaf at a time. Build order is in [`ROADMAP.md`](ROADMAP.md); each scheduled run picks the next unchecked leaf.

The build is driven by an autonomous Claude Code routine that runs every 4 hours from the maintainer's MacBook (launchd agent, capped at $2 USD per run). Each run lands one leaf as an auto-merged PR. The protocol is in [`ROUTINE.md`](ROUTINE.md).

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

## Document map

| File | Purpose |
|------|---------|
| [`PLAN.md`](PLAN.md) | What halflife is and why now |
| [`ROADMAP.md`](ROADMAP.md) | Phased work breakdown, leaf-by-leaf |
| [`ROUTINE.md`](ROUTINE.md) | Protocol the autonomous routine follows each run |
| [`DECISIONS.md`](DECISIONS.md) | Append-only ADR-style log |
| [`LEDGER.md`](LEDGER.md) | Per-run spend (Claude + corgi) |
| [`BLOCKED.md`](BLOCKED.md) | Present only when a run hit a blocker the human must resolve |

## Contributing

This repo is currently driven by the routine. PRs from `claude/*` branches squash-merge automatically (see `.github/workflows/auto-merge-claude.yml`). Human-authored PRs are welcome but go through normal review.

## License

Not yet chosen — to be settled before public launch (tracked as a Phase 5 decision).
