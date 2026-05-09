# Decisions Log — halflife

Append-only ADR-style log. One line per decision unless the rationale is non-obvious.

## 2026-04-27

- **D-001** Project = AI Job Obsolescence Clock from `IDEAS_BACKLOG/Idea Ledger 2026-04-19.md` Project 8. Selected because it's the only "HIGH EXCITEMENT" item that pairs Claude-as-product with a clear viral mechanic.
- **D-002** Working name `halflife`. Final name TBD; SERP/availability check is leaf L1.7. Repo + branding stay under `halflife` until the rename leaf merges.
- **D-003** Stack starting position: Next.js 15 App Router + TS + Tailwind + shadcn/ui on Vercel; Anthropic Claude Sonnet 4.6 with prompt caching; Vercel KV for the result cache. Re-evaluatable in Phase 1 if the routine surfaces a real reason to switch.
- **D-004** Daily autonomous routine, ≤10 commands/run, 03:00 Europe/Madrid, ≤$1/wk corgi spend. Routine is forbidden from running `npm install`, deploying, buying domains, or sending external messages.
- **D-005** Caching strategy: KV keyed by slugified job title, 30-day TTL. Trades freshness for cost; 30 days is long enough to amortise paid traffic, short enough that a major model release will refresh results within a month.

## 2026-05-09

- **D-006** Version pins for the L1.1 scaffold: Next.js 15.1, React 19, TypeScript 5.7, Tailwind v4 (with `@tailwindcss/postcss`), shadcn/ui (`new-york` style, `neutral` base, RSC + tsx). Tailwind v4 picked over v3 because it's stable as of mid-2025 and removes the JIT/postcss boilerplate; shadcn/ui supports it. Anthropic SDK pinned at `^0.40.0`; `@vercel/kv` and `@vercel/og` included now so L2.3/L2.6 don't reopen this manifest. No `next.config.ts` yet — that lands with L2.1 when the app skeleton goes in.
- **D-007** TypeScript strict-mode dial-up: in addition to `strict: true`, L1.2's `tsconfig.json` enables `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`. Cheap insurance against the two failure modes most likely on this codebase — silent `undefined` from cache hits keyed by slug, and a switch on `confidence` levels in the result renderer. Module resolution set to `bundler` to match Next.js 15 / TS 5.7 defaults; `@/*` path alias points at the repo root so imports stay flat (no `src/` directory planned).
- **D-008** Scoring rubric (`docs/methodology.md` v1): six dimensions on 0–10 — task automatability (0.30), tool maturity (0.20), adoption velocity (0.15), HITL necessity (0.15), differentiation moat (0.10), labor-market elasticity (0.10). Score = round(weighted sum × 10). `countdown_years` is a deterministic banded function of score (0–19 → 0.5–2y, 20–39 → 2–4y, 40–59 → 4–7y, 60–79 → 7–12y, 80–100 → 12–20y) with ±5% slug-hash jitter so two equal scores don't render identical countdowns. Banding is generous on the high end and tight on the low end on purpose — a 30-year-old role getting a 1-year countdown kills credibility, and a sub-20 score should feel urgent. `methodology_version` ships in the result JSON and the cache key so a weight change invalidates the cache without a manual purge.

