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
