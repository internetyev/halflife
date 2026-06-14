# Architecture

How the halflife codebase fits together — the request flow, the data
pipeline, and the handful of cross-cutting patterns that recur in almost
every file. Read this once before touching the code; it is the map the
per-file ROADMAP/DECISIONS entries assume you already have.

Companion docs: [`README.md`](../README.md) (front door + local setup),
[`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) (how to contribute),
[`methodology.md`](./methodology.md) (how the obsolescence score is built),
[`../ROUTINE.md`](../ROUTINE.md) (the autonomous build loop), and
[`../DECISIONS.md`](../DECISIONS.md) (the ADR log — every `D-0XX` referenced
below).

## What it is

A Next.js 15 (App Router) app that scores how exposed a job title is to AI
automation. A visitor types a role, the app asks Claude to evaluate it across
six weighted dimensions, derives a 0–100 survival score and a "countdown"
estimate, and renders a shareable result card. Per-role pages and an annual
"most at-risk" report are generated from the same precomputed data, and the
share primitive (OG image + per-role URL) is the intended distribution
channel (see `PLAN.md`).

The full stack and version pins live in `README.md` and `package.json`; this
doc is about *how the pieces talk to each other*, not what they are.

## Directory map

```
app/                     Next.js App Router — routes, API handlers, metadata routes
  api/
    analyze/route.ts     POST: the core analyze endpoint (Claude + cache)
    og/[slug]/route.tsx  Edge: Satori OG share image, reads KV by slug
    subscribe/route.ts   POST: env-gated email capture (L5.4a)
    health/route.ts      GET: deploy-verification probe (presence booleans)
  page.tsx               Home analyzer (Client Component)
  role/[slug]/page.tsx   Per-role static page (precompute → KV → notFound)
  report/2026/page.tsx   Annual "most at-risk" report
  privacy/page.tsx       Privacy notice
  layout.tsx             Root layout: metadata, footer, analytics, site JSON-LD
  sitemap.ts robots.ts manifest.ts icon.tsx apple-icon.tsx
  opengraph-image.tsx twitter-image.tsx     Metadata routes (self-maintaining)
  not-found.tsx error.tsx global-error.tsx loading.tsx   App Router special files
components/              result-card, share-buttons, email-capture, site-footer,
                         plausible-analytics
lib/
  anthropic/role-analysis.ts   Claude tool-use call → RoleAnalysisToolInput
  scoring/                      Score/countdown math + slugify + shared types
  cache/role-cache.ts          Vercel KV layer (dual-key, version-keyed)
  seo/json-ld.ts               schema.org graphs (role + site)
  analytics/plausible.ts       SSR-safe trackEvent helper
  email/capture.ts             Plunk REST wrapper (env-gated no-op)
scripts/                 Pure-stdlib data pipeline + validators (no deps)
  __tests__/             node:test (*.test.mjs) + unittest (test_*.py) suites
data/
  job-titles/            Curated corpus + ranked top-200 (corpus *input*)
  roles/                 Seeded per-role JSON (the *seed*, human-gated L3.2b)
  report/                most-at-risk-<YEAR>.{json,csv} (the *ranking output*)
prompts/  evals/  docs/  Planning + prompt + eval + documentation surfaces
```

## The analyze request lifecycle

`POST /api/analyze` (`app/api/analyze/route.ts`) is the heart of the app.
The flow, in order:

1. **Guard** — if `ANTHROPIC_API_KEY` is unset, return `503` (the app builds
   and serves without it; only the live call needs it).
2. **Validate** — body must be JSON with a non-empty `title` ≤ 200 chars,
   else `400`.
3. **Cache lookup** — `getCachedRole(rawTitle)` slugifies and reads KV. On a
   hit, return the stored `result` with header `x-halflife-cache: HIT`.
4. **Model call** — on a miss, `analyzeRole(client, rawTitle)`
   (`lib/anthropic/role-analysis.ts`) makes a single Claude tool-use call and
   returns the structured `RoleAnalysisToolInput` (the six dimensions, tool
   list, pivot steps, confidence, sources). A missing tool block throws
   `RoleAnalysisToolMissingError` → `502`.
5. **Derive** — `buildResult(rawTitle, toolInput)` (`lib/scoring`) turns the
   dimensions into the public `RoleAnalysisResult` (score + countdown). See
   *The scoring pipeline* below.
6. **Cache write** — `setCachedRole(...)` writes the result to KV under both
   the raw-input slug and the model's normalized-title slug (synonym
   handling), each with a 30-day TTL.
7. **Return** — the result with header `x-halflife-cache: MISS`.

`runtime = "nodejs"` (the Anthropic SDK needs Node, not the edge runtime).
The `x-halflife-cache` header lets `scripts/seed-roles.mjs` count paid Claude
calls vs. free KV reads, and feeds the Plausible `form-submit` event's
`cache` prop (L5.25).

## The scoring pipeline (`lib/scoring`)

The model never returns the user-facing score directly — it returns
*dimensions*, and the math lives in code so a weight change is a one-file edit
plus a `methodology_version` bump. `lib/scoring/index.ts`:

- **`computeScore(dimensions)`** — weighted sum of the six dimension scores
  (`task_automatability` 0.30, `tool_maturity` 0.20, `adoption_velocity`
  0.15, `hitl_necessity` 0.15, `differentiation_moat` 0.10,
  `labor_market_elasticity` 0.10), scaled to 0–100.
- **`bandedCountdown(score, slug)`** — maps the score into one of five
  year-bands, interpolates within the band, and adds a deterministic ±5%
  jitter derived from an FNV-1a hash of the slug (so two equal-score roles
  don't show identical countdowns, but the same role is always stable).
- **`slugify(title)`** — lowercase / NFKD / non-alphanumeric→hyphen. This is
  the **load-bearing identity function** of the whole system: it derives KV
  cache keys, the countdown jitter seed, role-page URLs, sitemap entries, and
  share targets. The `.mjs`/`.py` scripts re-implement the same rule, and
  `scripts/validate-job-titles.mjs` checks `slug === slugify(title)` precisely
  because a drift between implementations is a silent `/role/<slug>` mismatch
  (D-059).

`lib/scoring/types.ts` is the single source of truth for the result shape and
the `METHODOLOGY_VERSION` / `PROMPT_VERSION` constants (both pinned to `1`).

## Caching (`lib/cache/role-cache.ts`)

- **Key:** `role:m<methodology_version>:p<prompt_version>:<slug>`. The
  versions are *in the key*, so bumping methodology or prompt invalidates
  every entry on next read with no manual purge (D-008/D-009).
- **TTL:** 30 days (D-005).
- **Dual-key write:** a fresh miss writes under both the raw-input slug and
  the model's normalized-title slug, so two inputs the prompt collapses to one
  canonical role share an entry on later reads.
- **Graceful degradation:** when `KV_REST_API_URL` / `KV_REST_API_TOKEN` are
  absent (typical for `next dev` without a linked store) the cache is a
  no-op — every read misses, every write is dropped, the route still serves
  live results. KV runtime errors are swallowed for the same reason: a dead
  cache must never break the analyze endpoint.

## Per-role page data resolution (`app/role/[slug]/page.tsx`)

A role page resolves its data in priority order: **precomputed
`data/roles/<slug>.json` first**, then a KV lookup via
`getCachedRoleBySlug`, then `notFound()` (which renders the branded
`app/not-found.tsx`, L5.6) when both miss. Until the human-gated seed pass
(L3.2b) commits files into `data/roles/`, *every* role slug falls through to
`notFound()` — which is why the 404 page is the most-hit role state pre-launch.

## Recurring patterns

These three patterns explain why most files look the way they do. Internalise
them and the per-file code reads as variations on a theme.

### 1. Self-maintaining empty state

Anything that reads `data/**` is written to be **correct-but-empty today and
real the moment the data lands**, never to error in between. `app/sitemap.ts`
emits `/` plus one entry per *seeded* role file (zero today, auto-populating
as L3.2b commits JSON); `scripts/rank-at-risk.mjs` writes an empty-but-valid
ranking with zero seed files; `app/report/2026/page.tsx` renders a stable
"report is generating" state rather than `notFound()`; the validators
(`scripts/validate-*.mjs`) exit `0` with "0 file(s) validated" on a missing
input so CI stays green through the pre-seed period. The principle (D-027 /
D-031 / D-036): *never ship a state that breaks the live surface.*

### 2. Environment-variable gating

Every external dependency no-ops when its env var is unset, so the dev laptop
and unconfigured previews ship zero traffic and a clean build: no
`ANTHROPIC_API_KEY` → analyze returns `503`; no `KV_*` → cache is a no-op; no
`PLUNK_API_KEY` → `/api/subscribe` returns `503` and the capture form shows a
calm "opens at launch" state (L5.4a); no `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` →
analytics script never loads and `trackEvent` is a no-op (L2.9 / L5.25). The
`/api/health` probe reports a presence **boolean** for each of these (never
the secret value) so a deploy can be verified with one `curl` (L5.8).

### 3. The metadata-route family / single `SITE_URL` literal

`sitemap.ts`, `robots.ts`, `manifest.ts`, `lib/seo/json-ld.ts`,
`app/layout.tsx`'s `metadataBase`, and `public/.well-known/security.txt` all
resolve the canonical origin from `NEXT_PUBLIC_SITE_URL ?? https://halflife.work`
(trailing-slash-stripped). The literal is duplicated deliberately (small reads
over a shared-helper refactor that would churn shipped code), so the
human-gated final-domain pick (L1.7b / L5.1) flows in with a single
search-and-replace. Per-route canonicals (`alternates.canonical`, L5.18)
resolve relative paths against that `metadataBase`.

## The data pipeline (`scripts/`)

Pure Node-stdlib / Python-stdlib, no dependencies, no `npm install`. The
chain, input → output:

1. **Corpus** — `data/job-titles/candidates.txt` (curated) →
   `scripts/rank-job-titles.py` ranks by search volume →
   `data/job-titles/top-200.json` (the role *list*). The real volume re-rank
   is the corgi-gated L3.1b; an alphabetical curated-interim ordering ships
   today.
2. **Seed** — `scripts/seed-roles.mjs` POSTs each corpus title through
   `/api/analyze` and writes `data/roles/<slug>.json`. Idempotent /
   resumable / `--dry-run`. The live pass is the human-gated L3.2b (needs a
   real key).
3. **Rank** — `scripts/rank-at-risk.mjs` reads every `data/roles/*.json`,
   sorts by score → countdown → title, bands each row, and writes
   `data/report/most-at-risk-<YEAR>.{json,csv}` (consumed by the report page).
   The post-seed run is L4.1b.

Each stage is path-overridable (`--corpus`/`--roles`/`--out-dir` etc.) so the
test suites can point it at a temp dir and never touch the repo's real
`data/` tree.

## Validation & tests

Three validators guard the JSON contracts the app reads unchecked at runtime
(`JSON.parse(...) as RoleAnalysisResult` is not type-checked, D-021):

- `validate-job-titles.mjs` — the corpus *input* (`top-200.json`).
- `validate-roles.mjs` — the seed *output* (`roles/<slug>.json`).
- `validate-report.mjs` — the ranking *output* (`most-at-risk-<YEAR>.json`).

They run together via `npm run validate` (L5.28) and in CI. The
`scripts/__tests__/` suites cover the validators and the producer scripts:
`*.test.mjs` via `node --test`, `test_*.py` via `python3 -m unittest`. The
`Makefile` (`make ci`) runs the full pre-merge gate locally in CI step order
(`typecheck → lint → build → validate → test → test-py`); `make test`,
`make test-py`, and `make help` need no `npm install`.

## The build loop

This repo is built by an autonomous overnight routine (`ROUTINE.md`): it picks
the first unchecked `ROADMAP.md` leaf, does the smallest unit of work, logs an
ADR in `DECISIONS.md`, and opens a `claude/*` PR that
`.github/workflows/auto-merge-claude.yml` squash-merges. Human-gated leaves
(naming, domain, live keys, deploy, sending email) are skipped; when only
those remain, the routine adds and executes a net-new routine-doable
launch-readiness leaf rather than idle. That is why the Phase-5 history is a
long arc of self-maintaining tooling, metadata, and docs (this file included).
