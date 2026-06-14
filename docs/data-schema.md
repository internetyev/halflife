# Data schema — on-disk JSON contracts

This is the field-by-field reference for the JSON artifacts the routine and the
human-gated seed pass write under `data/`. It is the contract that three
pre-commit validators enforce and that the live app reads **unchecked at
runtime** — so a file that drifts from the shape documented here lands as a
silent 500 on a production page, not a build error.

Why this doc exists separately from [`architecture.md`](./architecture.md):
`architecture.md` describes the *pipeline* (how a request flows, where the
scoring and caching live). This describes the *artifacts at rest* — the exact
keys, types, ranges, and cross-file invariants a reviewer needs when eyeballing
the ~200 seed files the human commits in **L3.2b**, or when hand-editing a
ranking row. The source of truth for each contract is the TypeScript type or the
validator named below; this doc paraphrases them in one place and **must be kept
in sync** if either changes.

## The input → seed → ranking triangle

Three artifacts form a pipeline, each with its own validator:

| Artifact | Path | Written by | Validated by | Read by |
|----------|------|-----------|--------------|---------|
| Corpus | `data/job-titles/top-200.json` | `scripts/rank-job-titles.py` (L3.1) | `scripts/validate-job-titles.mjs` (L5.29) | `scripts/seed-roles.mjs` (L3.2) |
| Seed | `data/roles/<slug>.json` | `scripts/seed-roles.mjs` (L3.2b, human-gated) | `scripts/validate-roles.mjs` (L5.20) | `app/role/[slug]/page.tsx`, `scripts/rank-at-risk.mjs` |
| Ranking | `data/report/most-at-risk-<YEAR>.json` | `scripts/rank-at-risk.mjs` (L4.1b) | `scripts/validate-report.mjs` (L5.23) | `app/report/2026/page.tsx` |

All three validators are **self-maintaining**: a missing file exits `0` with
`0 file(s) validated`, so CI (`npm run validate`, wired in `.github/workflows/ci.yml`)
stays green through the pre-seed period when none of these files exist yet. Run
all three locally with `npm run validate`; each validator's contract is also
exercised by `scripts/__tests__/validators.test.mjs` (L5.39).

Each `.json` artifact has a `.csv` sibling (`top-200.csv`, `most-at-risk-<YEAR>.csv`)
written by the same producer for spreadsheet review. The CSVs are **derived
views, not a separate contract** — the JSON is canonical; nothing in the app
reads the CSV.

---

## 1. Corpus — `data/job-titles/top-200.json`

The ranked job-title pool that drives the seed pass. Source of truth:
`scripts/validate-job-titles.mjs`.

```jsonc
{
  "meta": {
    "generated": "2026-05-09T…",   // non-empty string (ISO-8601 in practice)
    "candidate_count": 308,         // integer >= 0; full pool size before --top slice
    "top_n": 200,                   // integer >= 0; MUST equal roles.length
    "volume_source": "curated-interim" // non-empty string; e.g. "keyword_overview" post-L3.1b
  },
  "roles": [
    {
      "title": "Paralegal",         // non-empty string
      "slug": "paralegal",          // non-empty string; MUST equal slugify(title)
      "volume": 0,                  // finite number >= 0 (0 in curated-interim mode)
      "difficulty": null,           // null OR finite number (null in stub/no-signal)
      "cpc": null,                  // null OR finite number (null in stub/no-signal)
      "rank": 1                     // finite number; MUST equal array index + 1 (1..N)
    }
  ]
}
```

`slugify` is `lowercase → [^a-z0-9]+ → "-" → strip leading/trailing "-"` — the
**same** derivation used by `scripts/seed-roles.mjs`, `app/role/[slug]/page.tsx`,
`app/sitemap.ts`, and the share buttons (D-022/D-027). Keep them identical or a
corpus slug will not resolve to a role page.

**Cross-file invariants** the validator enforces:

- `meta.top_n === roles.length` — the file's whole purpose is the top-N slice.
- `meta.candidate_count >= roles.length` — the pool can never be smaller than the
  slice it was drawn from.
- `roles[i].rank === i + 1` — contiguous 1..N, no gaps.
- `slug` is unique across `roles`.

`difficulty`/`cpc` are nullable because `corgi-keywords` returns `null` in stub
mode (L3.1a) and for keywords the API has no signal on; they are optional ranking
inputs, not required fields. Until L3.1b reruns the corpus against real US search
volume, every `volume` is `0` and `volume_source` is `curated-interim`.

---

## 2. Seed — `data/roles/<slug>.json`

One file per analyzed role, written by the seed pass. Source of truth:
`lib/scoring/types.ts` (`RoleAnalysisResult`) + `scripts/validate-roles.mjs`.
The filename stem is the role's slug; `app/role/[slug]/page.tsx` re-`slugify`s the
URL param and looks up `data/roles/<slug>.json`, falling through to a KV read and
then `notFound()` on a miss (D-021).

```jsonc
{
  "input_title": "paralegal",       // non-empty string (the raw query)
  "normalized_title": "Paralegal",  // non-empty string (model-normalized label)
  "score": 34,                      // finite number in [0,100] (higher = safer)
  "countdown_years": 6,             // finite number >= 0
  "ai_tools": [                     // array (may be empty)
    {
      "name": "Harvey",             // non-empty string
      "vendor": "Harvey AI",        // non-empty string
      "what_it_automates": "…"      // non-empty string
    }
  ],
  "pivot_steps": ["…", "…"],        // NON-EMPTY array of non-empty strings
  "confidence": "medium",           // enum: "low" | "medium" | "high"
  "sources_hint": ["…"],            // array of strings (may be empty)
  "methodology_version": 1,         // MUST equal METHODOLOGY_VERSION (1)
  "prompt_version": 1               // MUST equal PROMPT_VERSION (1)
}
```

Note what is **not** persisted in the public artifact: the six-dimension
`dimensions` breakdown and `confidence_rationale` from `RoleAnalysisToolInput`
are KV-only (evals/debugging), intentionally stripped from the on-disk
`RoleAnalysisResult` (D-010). Do not add them here.

Why a runtime validator at all: `app/role/[slug]/page.tsx` does
`JSON.parse(raw) as RoleAnalysisResult` with **no runtime check** — TypeScript
verifies the shape *we wrote*, not the shape of arbitrary JSON on disk — so a
file missing `score` or `pivot_steps` would 500 the live page or emit a corrupt
`application/ld+json` graph. The validator is the only guard, and it matters most
**before** L3.2b commits ~200 model-generated files in bulk.

The `score` → band mapping (shared with the ranking and `components/result-card.tsx`):
`<20 Urgent`, `<40 At-risk`, `<60 Contested`, `<80 Durable`, `>=80 Stable`.

---

## 3. Ranking — `data/report/most-at-risk-<YEAR>.json`

The "Most At-Risk Roles 2026" artifact, computed by `scripts/rank-at-risk.mjs`
over every `data/roles/*.json` (sorted at-risk-first: `score` asc → `countdown_years`
asc → `title`). Source of truth: `scripts/validate-report.mjs`. Read by
`app/report/2026/page.tsx`.

```jsonc
{
  "meta": {
    "report_year": 2026,            // integer; MUST equal the filename <YEAR>
    "title": "Most At-Risk Roles…", // non-empty string
    "generated_at": "2026-…",       // non-empty string; MUST parse as a Date
    "total_seeded": 200,            // integer >= 0; count of seed files read
    "ranked": 200,                  // integer >= 0; MUST equal roles.length
    "ranking_key": ["score", "countdown_years", "title"], // non-empty array of non-empty strings
    "source": "data/roles/*.json",  // non-empty string
    "note": "…"                     // OPTIONAL; if present, non-empty string
  },
  "roles": [
    {
      "rank": 1,                    // integer >= 1; contiguous 1..N
      "slug": "paralegal",          // non-empty string; unique (React key)
      "title": "Paralegal",         // non-empty string
      "score": 12,                  // finite number in [0,100]
      "band": "Urgent",             // enum below; MUST match score's band
      "countdown_years": 3,         // finite number >= 0
      "confidence": "medium"        // enum: "low"|"medium"|"high"|"unknown"
    }
  ]
}
```

`band` enum: `"Urgent" | "At-risk" | "Contested" | "Durable" | "Stable"`, and the
validator re-derives it from `score` (same `<20/<40/<60/<80` thresholds as the
seed artifact) — a `band` that disagrees with its `score` is a hard error.

**Cross-file invariants** the validator enforces:

- `meta.ranked === roles.length`.
- `meta.total_seeded >= meta.ranked` — `--top` can drop rows, never add.
- `roles[i].rank` are 1..N contiguous (the consumer does not re-sort; a gap shows
  as a numbering jump in the UI).
- `slug` is unique (it is the `<li key={r.slug}>` React key).

Note the wider `confidence` enum here: the ranking adds `"unknown"` on top of the
seed's `low|medium|high`, so a row whose source seed lacked a confidence still
ranks rather than crashing the producer.

---

## Keeping this doc honest

If you change `lib/scoring/types.ts` or any of the three validators, update the
matching section above in the same change — this doc is the human-readable mirror
of those machine-checked contracts, and a drift here is worse than no doc because
a reviewer trusts it. The validators, not this file, are authoritative; when in
doubt, read the validator.
