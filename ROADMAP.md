# halflife — Roadmap

_Last updated: 2026-04-27_

Leaf-task granularity. Each leaf should fit in **one scheduled run (≤10 commands)**. The routine picks the next unchecked leaf. Phases are the user-facing milestones; leaves are the work units.

Mark `[x]` when merged, `[~]` when draft PR open awaiting review, `[!]` when blocked (and write `BLOCKED.md`).

---

## Phase 0 — Planning bundle (Sprint 0)

- [x] L0.1 Write `PLAN.md`, `ROADMAP.md`, `ROUTINE.md`
- [x] L0.2 Open initial planning PR
- [x] L0.3 Mirror planning docs to Obsidian `HALFLIFE/` vault folder
- [x] L0.4 Schedule the 03:00 CET autonomous routine

## Phase 1 — Foundation (Sprint 1, ~5 daily runs)

- [ ] L1.1 Decide and commit `package.json` with Next.js 15 + TS + Tailwind + shadcn/ui scaffolding (no install, just the manifest + config files)
- [ ] L1.2 Add `.gitignore`, `.env.example` (lists `ANTHROPIC_API_KEY`, `KV_*`), `tsconfig.json`, basic `README.md` rewrite
- [ ] L1.3 Write `docs/methodology.md` — how the obsolescence score is constructed, what dimensions the prompt evaluates, how confidence is reported, and the disclaimers
- [ ] L1.4 Draft v1 of the Claude prompt(s) in `prompts/role-analysis.md` — single structured tool-use call returning `{ score, countdown_years, ai_tools[], pivot_steps[], confidence, sources_hint[] }`
- [ ] L1.5 Run a manual prompt eval: pick 10 representative roles, capture Claude's JSON output for each in `evals/role-analysis-baseline.csv`, qualitatively rate consistency. Use `corgi-cli` only if needed for keyword research; otherwise zero external spend.
- [ ] L1.6 Write `DECISIONS.md` ADR for stack, ADR for naming-evaluation criteria
- [ ] L1.7 Naming pass: shortlist 5 candidate domains, run availability + SERP-noise check (≤ $0.30 of corgi spend), write `docs/naming-shortlist.md` with a recommended pick — **do NOT purchase**

## Phase 2 — Core MVP (Sprint 2, ~7 daily runs)

- [ ] L2.1 Scaffold the Next.js app skeleton (only commit code; no `npm install` in the routine — install is a human step)
- [ ] L2.2 Implement `app/api/analyze/route.ts` calling Claude with the v1 prompt + tool-use schema
- [ ] L2.3 Implement KV cache layer keyed by slugified job title, 30-day TTL
- [ ] L2.4 Build the input form `app/page.tsx`
- [ ] L2.5 Build the result card component (countdown, score gauge, tools list, pivot steps)
- [ ] L2.6 Add OG image route `app/api/og/[slug]/route.tsx` (Vercel OG / Satori)
- [ ] L2.7 Add per-role static pages `app/role/[slug]/page.tsx` reading from precomputed JSON
- [ ] L2.8 Wire share buttons (LinkedIn-first, then Twitter/X, then copy-link)
- [ ] L2.9 Add basic Plausible analytics snippet
- [ ] L2.10 Write `docs/launch-checklist.md` for human sign-off before deploy

## Phase 3 — Programmatic SEO seed (Sprint 3, ~4 daily runs)

- [ ] L3.1 Source the top ~200 most-searched job titles via `corgi-keywords` (budget ≤ $0.40)
- [ ] L3.2 Run the analysis prompt over all 200 titles, store results to `data/roles/*.json` (budget: estimate first; if > $5 of Claude spend total, split across two daily runs)
- [ ] L3.3 Generate sitemap.xml entries for `/role/[slug]`
- [ ] L3.4 Add JSON-LD `Article` + `FAQPage` schema per role page

## Phase 4 — Annual report (Sprint 4, ~3 daily runs)

- [ ] L4.1 Compute the "Most At-Risk Roles 2026" ranking from the seed data
- [ ] L4.2 Write the report page `app/report/2026/page.tsx` with chart, methodology pointer, and per-role deep links
- [ ] L4.3 Draft a press-outreach memo `docs/press-outreach.md` (journalists by AI/jobs beat, pitch angle) — **do NOT send**

## Phase 5 — Launch prep (Sprint 5)

- [ ] L5.1 Final naming sign-off + domain purchase (**human-gated**)
- [ ] L5.2 Deploy to Vercel (**human-gated**, requires API keys)
- [ ] L5.3 ProductHunt + LinkedIn launch posts drafted in `docs/launch-posts.md`
- [ ] L5.4 Set up email capture (Plunk or ConvertKit — TBD in ADR)

---

## Out-of-scope parking lot

- Mobile app
- Account/auth system
- Paid tier
- Localisation
- Fine-tuned models
- Industry-specific deep dives (separate product if it works)
