# Operations runbook

Day-2 operations for the deployed app: how to verify a deploy, re-run the data
pipeline, bust or roll back the cache, rotate keys, read the telemetry, and
recover from the failure modes that actually happen in production.

This is the **post-deploy** companion to the three docs that stop at launch:

- [`launch-checklist.md`](launch-checklist.md) — the **pre-flight** a human ticks before `vercel --prod`.
- [`architecture.md`](architecture.md) — how the request → analyze → cache → render pipeline fits together.
- [`data-schema.md`](data-schema.md) — the field-by-field contract for the on-disk JSON artifacts.

When a statement here would drift from the code, the **code is authoritative** —
every section names the file it summarizes so you can confirm against the source.

---

## 1. Environment variables

All runtime configuration is environment variables; there is no config file to
edit in production. The canonical list with descriptions is
[`.env.example`](../.env.example). The variables that change behaviour:

| Variable | Consumer | Effect when **unset** |
|---|---|---|
| `ANTHROPIC_API_KEY` | `app/api/analyze/route.ts` | `/api/analyze` returns **503** (no live analysis); cached/seeded reads still serve. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | `lib/cache/role-cache.ts` | Cache is a **no-op** — every analyze is a live (billed) Claude call, nothing is stored. |
| `PLUNK_API_KEY` | `lib/email/capture.ts` | `/api/subscribe` returns **503**; the capture form shows its calm "opens at launch" state (L5.4a/D-034). |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `components/plausible-analytics.tsx` | No analytics script loads; `trackEvent` no-ops. Zero analytics traffic. |
| `NEXT_PUBLIC_SITE_URL` | sitemap / robots / JSON-LD / OG / canonicals | Falls back to `https://halflife.work`. Set it to the **real canonical origin** before launch or every absolute URL is wrong. |

Two independence rules worth internalising:

- **A missing secret degrades one feature, never the whole app.** Each consumer
  checks its own var (see the `config` map in `app/api/health/route.ts`), so a
  dead KV store or an unset Plunk key cannot blank-page the site.
- **`NEXT_PUBLIC_*` values are baked into the client bundle at build time.**
  Changing `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` requires a
  **rebuild/redeploy**, not just an env edit in the Vercel dashboard. The
  secret-bearing (server-only) vars take effect on the next request after the
  env change propagates.

---

## 2. Verify a deploy

Right after `vercel --prod`, confirm production env wiring **without** spending a
paid Claude call:

```bash
curl -s https://<your-domain>/api/health | jq
```

`app/api/health/route.ts` always returns `200` with:

```json
{
  "status": "ok",
  "time": "2026-06-14T21:00:00.000Z",
  "config": {
    "anthropic": true,
    "kv": true,
    "plunk": false,
    "plausible": true,
    "siteUrl": "https://halflife.work"
  }
}
```

Each `config` boolean is `Boolean(process.env.X)` for the var that feature
actually reads, so `true` means "this feature will work here," not "a related
var happens to be set." **No secret value is ever serialised** — only presence
booleans plus the public `siteUrl`. The response is `Cache-Control: no-store`
so you always see the *running* env, never a cached snapshot. Safe to curl from
anywhere; `/api/*` is `Disallow`-ed in `app/robots.ts`.

Expected at launch: `anthropic`, `kv`, `plausible`, `siteUrl` all set;
`plunk` may be `false` until the human-gated L5.4b lights it up.

After the probe is green, walk the golden path once by hand (submit a real role
on the home form) — that is the only step that costs a Claude call, and the
checklist (§5) wants it done exactly once.

---

## 3. Re-run the data pipeline

The site renders two kinds of pre-computed data: per-role seed files and the
annual ranking. Both are produced by stdlib scripts (no `npm install`), and both
are idempotent. See [`architecture.md`](architecture.md) for the full pipeline
and [`data-schema.md`](data-schema.md) for the output shapes.

### 3a. Re-seed roles (`scripts/seed-roles.mjs`, L3.2)

The seed driver POSTs every title in `data/job-titles/top-200.json` through a
**running** `/api/analyze` and writes `data/roles/<slug>.json`. It goes through
the HTTP route on purpose — the route *is* the contract (pinned model, v1
prompt, `buildResult()`, the KV dual-key write), so a model/prompt bump never
needs a matching edit here.

```bash
# Start the app against a live ANTHROPIC_API_KEY first, then:
node scripts/seed-roles.mjs --limit 10        # smoke run, ~10 roles
node scripts/seed-roles.mjs                    # full ~200-title pass
node scripts/seed-roles.mjs --dry-run          # list hits/skips, no requests
node scripts/seed-roles.mjs --force            # re-fetch + overwrite existing
```

Key properties:

- **Idempotent / resumable.** By default it skips any slug that already has a
  file, so a re-run only fills gaps. Use `--force` to regenerate.
- **Re-running warms KV for free.** A second pass is all cache HITs — no
  re-billing — because the first pass wrote every entry to KV via the route.
- **`--limit N`** processes only the first N (smoke test); **`--concurrency N`**
  (default 2) tunes parallel in-flight requests.

Validate before committing:

```bash
node scripts/validate-roles.mjs        # schema-checks every data/roles/*.json
```

### 3b. Regenerate the ranking (`scripts/rank-at-risk.mjs`, L4.1)

Pure local computation over the committed seed JSON — **no network/Claude call**:

```bash
node scripts/rank-at-risk.mjs                  # writes data/report/most-at-risk-2026.json + .csv
node scripts/validate-report.mjs               # schema-checks the artifact
```

Re-run this whenever `data/roles/*.json` changes (after any re-seed). The 5-band
thresholds are duplicated from `components/result-card.tsx` so the report and the
role pages always agree. Until seed data exists it emits an empty-but-valid
ranking (self-maintaining, same a/b split as the seed pass).

### 3c. Re-rank the corpus by search volume (`scripts/rank-job-titles.py`, L3.1b)

The one step that costs **real cash** (DataForSEO via `corgi`, tracked in
[`../LEDGER.md`](../LEDGER.md) against the $1/week cap). Run only on a non-stub
`corgi-keywords` build:

```bash
corgi-keywords --metric keyword_overview --batch data/job-titles/candidates.txt --locale us --budget 0.40
python3 scripts/rank-job-titles.py --overview <dump> --top 200
node scripts/validate-job-titles.mjs
```

---

## 4. Cache operations

The KV cache is keyed `role:m${METHODOLOGY_VERSION}:p${PROMPT_VERSION}:${slug}`
(`lib/cache/role-cache.ts`), TTL **30 days** (D-005). The version numbers in the
key are the whole cache-management story — there is no manual purge command.

### 4a. Bust the cache (after a methodology or prompt change)

Bump `METHODOLOGY_VERSION` and/or `PROMPT_VERSION` in `lib/scoring/types.ts`.
Because both are part of the key, every existing entry is **orphaned on the next
read** — the new version reads a fresh namespace, misses, and re-bills one Claude
call per role. No deploy-time purge step, no KV admin access required. The old
entries simply age out at their 30-day TTL.

After bumping versions, re-run the seed pass (§3a) so the new namespace is warm
before users hit it — otherwise the first visitor to each role pays the live
call.

### 4b. Roll back a bad prompt/methodology (D-017)

The dual-version key is also the rollback mechanism. If a new prompt/methodology
version ships and proves worse:

1. **Revert** `METHODOLOGY_VERSION` / `PROMPT_VERSION` in `lib/scoring/types.ts`
   to the previous values and redeploy.
2. The key reverts to the **previous namespace**, where the old (good) entries
   are still live within their 30-day TTL — so rollback is **instant and
   re-bills nothing** for roles that were cached under the old version.

This is why the launch-checklist's rollback plan "leans on the dual-version
cache key" — you never have to dump or rebuild KV to undo a model change.

### 4c. Cache HIT/MISS visibility

`/api/analyze` sets an `x-halflife-cache` response header (`HIT`/`MISS`) and the
home form forwards it as a `cache` prop on the Plausible `form-submit` event
(L5.25). To inspect a single request:

```bash
curl -s -D - -o /dev/null -X POST https://<your-domain>/api/analyze \
  -H 'content-type: application/json' -d '{"title":"paralegal"}' | grep -i x-halflife-cache
```

A run of MISSes on roles you expected to be seeded means the seed pass didn't
write to *this* KV store (wrong env, or seeded against a different store) — re-run
§3a against production.

---

## 5. Key rotation

All secrets live only in the deployment env (Vercel project settings) and local
`.env` — never in git (`.gitignore` excludes `.env`; `.env.example` carries names
only). To rotate:

1. Generate the new key at the provider (Anthropic / Vercel KV / Plunk).
2. Update it in the Vercel project env (and any local `.env`).
3. Redeploy (or, for server-only vars, let the next request pick it up once the
   env change propagates).
4. `curl /api/health` — confirm the relevant `config` boolean is still `true`.
5. Revoke the old key at the provider.

Rotating `KV_REST_API_*` to a **different** store starts from a cold cache (every
role re-bills until re-seeded) — rotate the token on the *same* store unless you
intend to migrate.

---

## 6. Telemetry

- **Plausible** (cookieless, no PII — D-012). Two custom events beyond pageviews
  (L5.25): `form-submit` with a `cache: HIT|MISS` prop (split paid vs. free
  results — the p50-cost-per-result KPI in [`../PLAN.md`](../PLAN.md)) and
  `share-click` with `channel` + `slug` props (which share primitive is actually
  used). These fire only when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set; the named
  goals must also exist on the Plausible site for them to surface as goals rather
  than generic custom events.
- **Vercel** function logs / analytics for `/api/analyze`, `/api/subscribe`,
  `/api/og/[slug]` errors and latency.
- **`/api/health`** for at-a-glance env wiring (§2).

---

## 7. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `/api/analyze` returns 503 | `ANTHROPIC_API_KEY` unset in prod | Set it in Vercel env, redeploy, `curl /api/health` → `anthropic: true`. |
| Every analyze is a MISS / Claude bill climbing | KV unset or wrong store | `curl /api/health` → check `kv`; re-seed (§3a) against the prod store. |
| Role page 404s for a title you expect | No seed file **and** no KV entry for that slug | `app/role/[slug]/page.tsx` `notFound()`s on a double miss (D-021); seed the role or confirm the slug. |
| `/report/2026` shows the empty state | `data/report/most-at-risk-2026.json` not generated/committed | Run §3b after the seed pass and commit the artifact. |
| Capture form stuck on "opens at launch" | `PLUNK_API_KEY` unset (503) | Expected pre-L5.4b; set the key + redeploy to activate. |
| Share previews blank / wrong domain | `NEXT_PUBLIC_SITE_URL` wrong, set at build time | Fix the var and **redeploy** (it's baked into the bundle). |
| Bad results after a prompt change | New prompt/methodology version regressed | Roll back the version constants (§4b) — instant, no re-bill. |

A malformed committed JSON is the one class the running app cannot self-heal
(`JSON.parse(...) as RoleAnalysisResult` is unchecked at runtime, D-021) — which
is why the three validators in §3 are the guard. Run them before every data
commit; CI runs them too ([`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)).
