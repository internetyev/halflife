# Job-title seed corpus (Phase 3 programmatic SEO)

The seed list of roles that get precomputed `/role/<slug>` pages (L3.2 → L3.4).

## Files

- **`candidates.txt`** — 308 curated, deduped, lowercase, sector-balanced US
  job titles (tech, healthcare, legal, finance, education, trades, creative,
  admin, sales/marketing, ops/logistics, science, hospitality, public sector).
  Each line is the bare role title (no "jobs"/"salary" modifiers) so it
  slugifies to the same form `lib/scoring` produces and matches how the
  analyzer canonicalizes input.
- **`top-200.json` / `top-200.csv`** — the ranked seed consumed by L3.2.
  `meta.volume_source` says how it was ordered.

## Status: curated-interim ordering (L3.1b open)

L3.1 spec was "source the top ~200 most-searched job titles via
`corgi-keywords` (budget ≤ $0.40)". The `corgi-keywords` build installed on
the routine laptop is a **stub**: `corgi.ahrefs.dispatcher.fetch_keyword_overview`
returns `{"metric": ..., **kwargs}` and issues no DataForSEO/Ahrefs request
(verified L3.1 — `--dry-run` and live `--budget 0.40` produced byte-identical
param-echo output; **$0.00 corgi spend**, no real-cash API call made).

So L3.1 was split (precedent: L1.7a/L1.7b, L1.5a/L1.5b):

- **L3.1a (done)** — this corpus + `scripts/rank-job-titles.py`. `top-200.json`
  is shipped with `volume_source: "curated-interim"`: a deterministic
  alphabetical-stable ordering, `volume: 0` for every role. This unblocks
  L3.2–L3.4 (they need the *list*, not the ordering).
- **L3.1b (corgi-deferred)** — re-rank by real US search volume once a
  non-stub `corgi-keywords` (or DataForSEO-backed equivalent) is available:

  ```sh
  corgi-keywords --metric keyword_overview \
      --batch data/job-titles/candidates.txt --locale us \
      --budget 0.40 > data/job-titles/keyword_overview.json
  python3 scripts/rank-job-titles.py \
      --overview data/job-titles/keyword_overview.json --top 200
  ```

  The script tolerates the real corgi/Ahrefs JSON shape (rows under
  `rows`/`results`/`data`; volume under `volume`/`search_volume`/`vol`/
  `avg_monthly_searches`) and exits non-zero with a clear message if it only
  gets the stub param-echo back.
