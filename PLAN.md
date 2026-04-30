# halflife — Project Plan

_Last updated: 2026-04-27_

## What it is

A viral web tool that takes a **job title** and returns:

1. A dramatic **obsolescence countdown** ("your role has ~7.3 years before AI replaces ≥50% of its tasks")
2. A **survival score** (0–100) with a one-line verdict
3. A list of **AI tools already disrupting the role** (named, with what they automate)
4. A **personalized pivot roadmap** (3–5 concrete next steps for the human)
5. A **shareable card** (OG image) with the role + countdown, optimised for LinkedIn

The Claude API is the product. There is no proprietary model, no rules engine — the analysis, scoring, and pivot roadmap are all structured Claude calls. Caching does the heavy lifting on cost.

## Why now

- AI job-displacement anxiety is a top-of-mind topic in 2026 — every quarter brings a fresh wave of "AI replaced X" headlines.
- LinkedIn is starving for shareable, identity-forward AI content. A countdown card per role is a built-for-LinkedIn primitive.
- Journalists covering the AI-jobs beat need a citable, neutral-feeling source. An annual "Most At-Risk Roles 20XX" report from a single-purpose tool is exactly that source.
- No incumbent owns the **personal, role-specific** angle. Mass reports (WEF, McKinsey) are aggregate; existing tools (Will-Robots-Take-My-Job) are a decade old, dataset-frozen, and not generative.

## Audience

- **Primary:** knowledge workers in roles with public anxiety (marketers, paralegals, customer-support reps, copywriters, junior devs, designers, accountants, translators).
- **Secondary:** journalists, HR/L&D leaders, career coaches.
- **Anti-audience:** people looking for academic rigour. The product leans *dramatic, opinionated, useful*, not peer-reviewed. We will be transparent about that.

## Success metrics

- **Phase 1 (MVP launch):** 1k unique visitors, ≥30% share-card generation rate, p50 cost-per-result < $0.01.
- **Phase 2 (3 months post-launch):** 50k uniques/month, ≥1 journalist citation, top-3 ranking for "ai job obsolescence" / "will ai replace my job".
- **Phase 3 (12 months):** annual report indexed by mainstream media, 10k+ email subscribers, paid tier (team / enterprise pivot reports).

## Scope — IN

- Single-page web app with the input → result card flow
- Pre-computed pages for the top ~200 most-searched job titles (programmatic SEO)
- Annual "Most At-Risk Roles" report page
- Email capture for "alert me when my role's countdown changes"
- OG image generation per role (Vercel OG / Satori)

## Scope — OUT (for now)

- Account system, login, dashboards
- Paid tier, billing
- Fine-tuned models (Claude prompts only)
- Mobile app
- Localisation beyond English (until traffic justifies it)

## Stack (working assumption)

- **Frontend:** Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui
- **Hosting:** Vercel (built-in OG image, edge caching, simple env management)
- **AI:** Anthropic SDK, Claude Sonnet 4.6 for analysis, prompt caching enabled, structured tool-use for JSON output
- **Cache:** Vercel KV (Redis) keyed by normalised job-title slug → result JSON, TTL 30 days
- **Data store:** flat JSON for the top-200 pre-computed roles in repo, served from CDN; KV for ad-hoc queries
- **Analytics:** Plausible (privacy-friendly, no cookie banner needed)

These are starting positions, not commitments. The autonomous routine is allowed to revisit them in week 1 if it surfaces a good reason.

## Naming

The working name `halflife` has known noise from gaming/physics. Final name TBD. Candidates to evaluate in Sprint 1:
- `halflife.work` / `halflife.ai` / `halflife.jobs`
- `obsolesce.me`
- `replaced.by` / `replacedby.ai`
- `roleclock.ai`
- `until.ai`

The autonomous routine should run a domain-availability + SERP-noise check on each candidate and propose one for sign-off (does **not** buy the domain — that needs human approval).

## Operating constraints

- The user reviews progress async. No live debugging available.
- Daily run window: **03:00 CET (= 01:00 UTC during CEST, 02:00 UTC during CET)**.
- Daily command budget: **≤2 commands Mon–Fri, ≤10 commands Sat–Sun** (weekend pool target ~20 commands total). Andrei rations his weekly Claude cap during the week and burns the remainder on the weekend; the cap resets Monday 09:00 CET.
- Weekly external-data budget: **≤ $1 USD/week of `corgi` skill usage** (for keyword/SERP checks on naming, programmatic-SEO seed, and competitor SERPs).
- Each run must end in either: a merged PR, a draft PR awaiting review, or a `BLOCKED.md` report explaining what's needed from the human.
- No domain purchases, no API keys committed, no production deploys without explicit human sign-off.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Cost runaway from uncached Claude calls | Aggressive caching by normalised slug; rate-limit by IP at the edge |
| "Doom-mongering" reputation tanks credibility | Always pair countdown with concrete pivot steps; cite sources for AI-tools list |
| LLM hallucinated job titles or AI tools | Constrain output via tool-use schema + reject low-confidence results |
| Legal: someone claims defamation over a low score for their occupation | Disclaimer + framing: "this is a forecast, not a verdict"; never name specific companies |
| Domain name with too much SERP noise | Test SERP cleanness before purchase (corgi-keywords/SERP) |
| Burnout of the autonomous routine on a single hard task | Roadmap is small steps; daily run picks the next undone leaf, not a phase |

## Document map

- `PLAN.md` — this file (what + why)
- `ROADMAP.md` — phased work breakdown, leaf tasks
- `ROUTINE.md` — protocol for each scheduled 03:00 CET run
- `DECISIONS.md` — append-only log of choices the routine makes
- `BLOCKED.md` — created only when a run cannot proceed without human input
- `.ai-context/task.md` — short focus pointer (kept in sync with current sprint)
