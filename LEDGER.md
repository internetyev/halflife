# Spend Ledger — halflife

External-data spend (corgi-cli, ad-hoc API calls). Append-only. Reset the rolling 7-day window mentally; the routine checks the last 7 days of entries against the $1.00 cap before any corgi call.

| Date | Run id | Tool | USD | Reason |
|------|--------|------|-----|--------|
| 2026-04-27 | setup | — | 0.00 | Planning bundle, no external data calls |
| 2026-05-01 | smoke-test | — | 0.00 | Local smoke test of auto-merge workflow on a claude/* branch |
| 2026-05-09 | L1.2 | — | 0.00 | Repo hygiene scaffold: `.gitignore`, `.env.example`, `tsconfig.json`, README rewrite |
| 2026-05-09 | L1.3 | — | 0.00 | Methodology doc — pure prose, no external data calls |
| 2026-05-09 | L1.4 | — | 0.00 | v1 role-analysis prompt — prose + JSON tool schema, no external calls |
| 2026-05-09 | L1.5a | — | 0.00 | Eval scaffold — 10 baseline roles + CSV header + procedure doc, no external calls. Actual eval API spend lands under L1.5b when the human runs it. |
| 2026-05-10 | L1.6  | — | 0.00 | ADRs only (stack ratification + naming-evaluation criteria) — pure prose edits to `DECISIONS.md`, no external calls. |
| 2026-05-10 | L1.7a | corgi-serp | 0.00 | One `corgi-serp --dry-run` to confirm $0.0006/query estimate; live SERP probes deferred to L1.7b because `DATAFORSEO_LOGIN` is not configured on this laptop. |
| 2026-05-10 | L2.2  | — | 0.00 | Implement analyze route + scoring lib + prompt-as-TS-constants. Pure code edits, no live Claude calls from the routine; live calls happen when the human runs `next dev` with `ANTHROPIC_API_KEY`. |
| 2026-05-11 | L2.3  | — | 0.00 | KV cache layer (`lib/cache/role-cache.ts`) + analyzeRole extraction. Pure code edits, no DataForSEO calls. KV calls happen at runtime against the human's linked Vercel KV store; the cache no-ops when env vars are absent so dev still works. |
| 2026-05-11 | L1.7b | corgi-serp | 0.0036 | Gate-4 measurement pass: batched 6 naming candidates (`halflife`, `obsolesce`, `replaced`, `replacedby`, `roleclock`, `until`), geo=US, depth=10. Routed via `~/PROJ/corgi-seo/.env` creds (DATAFORSEO_USERNAME aliased to DATAFORSEO_LOGIN for the shell session). Results merged into `docs/naming-shortlist.md`. |
| 2026-05-11 | L1.5b | — | 0.00 | Ran v1 prompt against 10 baseline roles inside a sanctioned Claude CLI session (no Anthropic API call — used the maintainer's Claude subscription via this CLI). Outputs in `evals/baseline-runs/all.jsonl`; CSV populated; Findings appended to `evals/README.md`. Verdict: ship v1 as-is. |
| 2026-05-11 | L2.4  | — | 0.00 | Input form on `app/page.tsx` posts to `/api/analyze` with idle/loading/error/result states. Pure code edits, no external calls. |
| 2026-05-11 | L2.7  | — | 0.00 | Per-role page `app/role/[slug]/page.tsx` — reads precomputed JSON, falls back to KV, `notFound()` otherwise. Server component, no external data calls. |
