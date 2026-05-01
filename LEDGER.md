# Spend Ledger — halflife

External-data spend (corgi-cli, ad-hoc API calls). Append-only. Reset the rolling 7-day window mentally; the routine checks the last 7 days of entries against the $1.00 cap before any corgi call.

| Date | Run id | Tool | USD | Reason |
|------|--------|------|-----|--------|
| 2026-04-27 | setup | — | 0.00 | Planning bundle, no external data calls |
| 2026-05-01 | smoke-test | — | 0.00 | Local smoke test of auto-merge workflow on a claude/* branch |
