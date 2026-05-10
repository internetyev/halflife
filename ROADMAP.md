# halflife — Roadmap

_Last updated: 2026-05-10 (L2.3 KV cache layer committed; install + live API key + linked KV store remain human steps)_

Leaf-task granularity. Each leaf should fit in **one scheduled run (≤10 commands)**. The routine picks the next unchecked leaf. Phases are the user-facing milestones; leaves are the work units.

Mark `[x]` when merged, `[~]` when draft PR open awaiting review, `[!]` when blocked (and write `BLOCKED.md`).

---

## Phase 0 — Planning bundle (Sprint 0)

- [x] L0.1 Write `PLAN.md`, `ROADMAP.md`, `ROUTINE.md`
- [x] L0.2 Open initial planning PR
- [x] L0.3 Mirror planning docs to Obsidian `HALFLIFE/` vault folder
- [x] L0.4 Schedule the 03:00 CET autonomous routine

## Phase 1 — Foundation (Sprint 1, ~5 daily runs)

- [x] L1.1 Decide and commit `package.json` with Next.js 15 + TS + Tailwind + shadcn/ui scaffolding (no install, just the manifest + config files)
- [x] L1.2 Add `.gitignore`, `.env.example` (lists `ANTHROPIC_API_KEY`, `KV_*`), `tsconfig.json`, basic `README.md` rewrite
- [x] L1.3 Write `docs/methodology.md` — how the obsolescence score is constructed, what dimensions the prompt evaluates, how confidence is reported, and the disclaimers
- [x] L1.4 Draft v1 of the Claude prompt(s) in `prompts/role-analysis.md` — single structured tool-use call returning `{ score, countdown_years, ai_tools[], pivot_steps[], confidence, sources_hint[] }`
- [x] L1.5a Pick 10 representative roles + scaffold `evals/role-analysis-baseline.csv` + write `evals/README.md` with the manual-eval procedure and the qualitative-rating rubric. (Routine cannot run the API call itself, so the eval-execution piece is the human-gated L1.5b below.)
- [ ] L1.5b **(human-gated — needs ANTHROPIC_API_KEY)** Run the v1 prompt against the 10 baseline roles, paste outputs into `evals/role-analysis-baseline.csv`, append a `## Findings` section to `evals/README.md` rating consistency. Decide: ship v1 / patch prompt + bump `prompt_version` / revise methodology.
- [x] L1.6 Write `DECISIONS.md` ADR for stack, ADR for naming-evaluation criteria
- [x] L1.7a Naming pass — internal-criteria scoring: write `docs/naming-shortlist.md` with the 8 seed candidates from PLAN.md / D-013 scored on the routine-doable D-013 dimensions (semantic fit, pronounceability, memorability, TLD signal); flag hard gates as TBD pending L1.7b. (Split off because the laptop running this routine has `corgi-serp` installed but no `DATAFORSEO_LOGIN` configured, so D-013 gate (4) cannot run from the routine.)
- [ ] L1.7b **(human-gated — needs `DATAFORSEO_LOGIN` for corgi-serp + a registrar/TM check pass)** Run `corgi-serp` SERP probes on the surviving candidates (≤ $0.30 corgi spend per D-013), verify the four hard gates (TM clear / no `.com` collision / ≤ $200/yr registrar list-price / ≤ 3 top-10 unrelated brands), update `docs/naming-shortlist.md` with measured values + a single bolded final recommendation, log the corgi spend to LEDGER.md. **Do NOT purchase** — purchase stays under L5.1.

## Phase 2 — Core MVP (Sprint 2, ~7 daily runs)

- [x] L2.1 Scaffold the Next.js app skeleton (only commit code; no `npm install` in the routine — install is a human step)
- [x] L2.2 Implement `app/api/analyze/route.ts` calling Claude with the v1 prompt + tool-use schema
- [x] L2.3 Implement KV cache layer keyed by slugified job title, 30-day TTL
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
