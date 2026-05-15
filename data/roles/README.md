# Seeded role pages (`data/roles/*.json`)

Each `<slug>.json` here is one `RoleAnalysisResult` (the public shape from
`lib/scoring/types.ts`). `app/role/[slug]/page.tsx` reads `data/roles/<slug>.json`
**first**, before KV (D-021), so committing these files is what turns the
Phase-3 corpus into statically-served, indexable role pages.

The slug is taken verbatim from `data/job-titles/top-200.json`, so a row with
`"slug": "paralegal"` becomes `data/roles/paralegal.json` and serves at
`/role/paralegal`.

## L3.2a (done, by the routine) — the harness

`scripts/seed-roles.mjs` is the batch driver. It POSTs each corpus title to a
running `/api/analyze` and writes the response here. It goes through the HTTP
route on purpose: that reuses the pinned model, the v1 prompt + tool schema,
`buildResult()`, the KV dual-key write (D-017) and the `x-halflife-cache`
header with **zero duplicated logic** — a model or prompt bump never needs a
matching edit in the script. Pure Node stdlib, no dependencies.

## L3.2b (human-gated) — run the seed against a live key

The autonomous routine must not make live Claude calls (ROUTINE.md cost
discipline; same boundary as the L1.5b eval run). A human runs this once:

1. Set `ANTHROPIC_API_KEY` (and optionally `KV_REST_API_URL` /
   `KV_REST_API_TOKEN` — with KV linked, the seed also warms the production
   cache; without it the route still serves live results and the seed still
   works, it just won't populate KV).
2. Start the app: `npm run dev` (or `npm run build && npm run start`).
3. Estimate spend first. ~200 roles × one forced tool-use call on
   `claude-sonnet-4-6` (system prompt + tool schema are prompt-cached after
   the first call, see D-016). Do a costed smoke run:
   `node scripts/seed-roles.mjs --limit 10` and extrapolate ×20 before the
   full pass. ROADMAP L3.2 says: if the full Claude spend would exceed ~$5,
   split it across two sessions with `--limit` / resume.
4. Full pass: `node scripts/seed-roles.mjs`
   - Idempotent + resumable: a slug that already has a file is skipped (no
     API call). Safe to Ctrl-C and re-run; it resumes from the first gap.
   - Re-running after a partial/failed pass retries only the missing slugs.
   - `--force` re-fetches everything (use after a `prompt_version` bump).
   - `--concurrency N` (default 2) trades wall-time for rate-limit risk.
5. Review a sample of the generated JSON for obvious nonsense, then commit
   `data/roles/*.json` (and append the actual Claude spend note + a `LEDGER`
   row — corgi spend is $0.00; Claude tokens are Max/subscription, not the
   real-cash LEDGER cap).
6. Then the routine can pick up L3.3 (sitemap) and L3.4 (JSON-LD), which read
   this directory.

This README is intentionally not a `.json` file, so it neither serves as a
role page nor is touched by the driver.
