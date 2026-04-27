# Decisions Log — halflife

Append-only ADR-style log. One line per decision unless the rationale is non-obvious.

## 2026-04-27

- **D-001** Project = AI Job Obsolescence Clock from `IDEAS_BACKLOG/Idea Ledger 2026-04-19.md` Project 8. Selected because it's the only "HIGH EXCITEMENT" item that pairs Claude-as-product with a clear viral mechanic.
- **D-002** Working name `halflife`. Final name TBD; SERP/availability check is leaf L1.7. Repo + branding stay under `halflife` until the rename leaf merges.
- **D-003** Stack starting position: Next.js 15 App Router + TS + Tailwind + shadcn/ui on Vercel; Anthropic Claude Sonnet 4.6 with prompt caching; Vercel KV for the result cache. Re-evaluatable in Phase 1 if the routine surfaces a real reason to switch.
- **D-004** Daily autonomous routine, ≤10 commands/run, 03:00 Europe/Madrid, ≤$1/wk corgi spend. Routine is forbidden from running `npm install`, deploying, buying domains, or sending external messages.
- **D-005** Caching strategy: KV keyed by slugified job title, 30-day TTL. Trades freshness for cost; 30 days is long enough to amortise paid traffic, short enough that a major model release will refresh results within a month.
