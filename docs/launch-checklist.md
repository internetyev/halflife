# Launch Checklist — halflife

_Last updated: 2026-05-18 (L5.9 — added §3 smoke checks for the branded 404 and the `app/error.tsx` error boundary; L5.8 — added the `/api/health` env-wiring checks to §2 and §5). Human sign-off gate before the first production deploy._

The autonomous routine is forbidden from buying domains, deploying, or committing real API keys (see `ROUTINE.md` hard constraints). This document is the human pre-flight: everything that has to be checked off **by a person** before the first `vercel --prod` push lands.

Treat it as a hard gate. Do not deploy until every required box below is ticked. Optional polish items are flagged.

---

## 1. Pre-deploy — naming & domain (blocks L5.1)

- [ ] L1.7b finalised — three survivors (`roleclock.ai`, `obsolesce.me`, `replacedby.ai`) walked through D-013 hard gates 1–3 (TM search, `.com` collision, registrar price ≤ $200/yr). See `docs/naming-shortlist.md` for current status.
- [ ] Final name picked and recorded as a new ADR (`D-NNN final-name`).
- [ ] Domain purchased on a registrar that supports DNSSEC + ALIAS/ANAME (Cloudflare, Porkbun, or Namecheap). **Do not buy through Vercel's flow**: registrar lock-in tax + harder DNS portability later.
- [ ] Domain WHOIS privacy enabled.
- [ ] Repository rename + GitHub remote update **deferred** unless the new name diverges sharply from `halflife`; a content-only rebrand on the same repo is fine.

## 2. Pre-deploy — infrastructure (blocks L5.2)

- [ ] `vercel link` against a fresh Vercel project under the human's personal scope.
- [ ] Vercel KV store provisioned and linked to the project. The four `KV_*` env vars from `.env.example` should auto-populate.
- [ ] Production `ANTHROPIC_API_KEY` minted as a **project-scoped** key (Anthropic console → API keys → scope to a single workspace). Do not reuse the personal key used for the L1.5b baseline run.
- [ ] `ANTHROPIC_API_KEY` added to Vercel as a **Production**-only env var (not Preview, not Development — Preview keys come up in step 3).
- [ ] `NEXT_PUBLIC_SITE_URL` set to the final canonical origin (e.g. `https://roleclock.ai`) in Production. Preview can stay default.
- [ ] `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` set to the registered Plausible site (matches the final domain). Plausible site created under the human's account; goals for `form-submit` and `share-click` stubbed (we do not fire these events yet — L2.9 ships the page-view tag only — but registering the goals now means dashboards exist when L2.10+ wiring lands).
- [ ] Preview environment uses a **separate** Anthropic key with a low monthly cap, so a misconfigured preview can't drain the production budget.
- [ ] After setting the env vars above (and again post-deploy in §5), `curl https://<domain>/api/health` and confirm `config` shows `anthropic: true`, `kv: true`, `siteUrl` = the final canonical origin (and `plausible`/`plunk` true if those are wired). This is the zero-cost env-wiring check — it never submits a paid Claude call and never echoes a secret value (presence booleans only).

## 3. Pre-deploy — local smoke (blocks deploy)

Run from a clean checkout on the laptop that will own the deploy. The routine cannot do these steps because they require `npm install` and `next dev` against live keys.

- [ ] `npm install` succeeds with no peer-dep warnings beyond the known shadcn/Radix set.
- [ ] `npm run build` succeeds. A failed build here means the deploy will fail with no observability — fix locally first.
- [ ] `npx tsc --noEmit` passes. Strict-mode lifts in D-007 (`noUncheckedIndexedAccess` etc.) catch real bugs; do not loosen them to ship.
- [ ] `npx next lint` is either clean or has only warnings reviewed in the diff.
- [ ] `npm run dev` then walk the golden path manually in the browser:
  - [ ] Submit a fresh title → result card renders with a score, countdown, gauge band colour, confidence chip, tools list, pivot steps, and a `cache MISS` footer.
  - [ ] Resubmit the same title → `cache HIT` footer, identical numbers (deterministic countdown jitter, D-008).
  - [ ] Submit an alias (e.g. `attorney` after `lawyer`, or vice versa) → second submit is a HIT thanks to the D-017 dual-key write.
  - [ ] Submit a low-confidence-prone title (gibberish or a fake job) → amber low-confidence banner shows.
  - [ ] Visit `/role/<slug>` for an already-cached title → static page renders the same card.
  - [ ] Visit `/api/og/<slug>` for a cached slug → 1200×630 PNG with the band-coloured layout. For an unknown slug → generic "score your role" fallback (not a 404).
  - [ ] Share buttons: LinkedIn opens a popup pointed at `share-offsite?url=<origin>/role/<slug>`; X opens `intent/tweet`; copy-link writes the canonical role URL to clipboard.
  - [ ] DevTools → Network: Plausible script loads only when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set in `.env.local`; unset → no request to `plausible.io`.
  - [ ] Visit a garbage path (e.g. `/nope`) or an unseeded `/role/<slug>` → the branded **404** (`app/not-found.tsx`, L5.6) with the "Analyze a role" CTA, HTTP status 404 (Network tab) — not Next's default UI, not a soft-200.
  - [ ] Force a render throw (temporarily `throw` in a page, or run the analyzer with `ANTHROPIC_API_KEY` unset so `/api/analyze` 503s and the form surfaces it) → the branded **error boundary** (`app/error.tsx`, L5.9): "Try again" calls `reset()` and recovers in place once the cause clears; "Back to the analyzer" links home. Default Next error UI must not appear.

## 4. Pre-deploy — content & legal

- [ ] Disclaimer visible on the result card or the home page: "This is a forecast, not a verdict. We do not endorse career decisions made solely from this score." (PLAN.md risks table.)
- [ ] Methodology link in footer points at `/docs/methodology` or the rendered equivalent — a user who wants to argue with the number must be able to read the rubric.
- [ ] Privacy note in footer or `/privacy`: Plausible is cookieless, no PII collected, role inputs are cached for 30 days keyed by slug. No GDPR cookie banner required (D-012, PLAN.md).
- [ ] `robots.txt` allows indexing of `/` and `/role/[slug]` but disallows `/api/`. Add to `app/robots.ts` before deploy.
- [ ] `sitemap.xml` plan: leave to L3.3, but confirm `/api/og/[slug]` is **not** in the sitemap (crawlers fetching it would burn KV reads for no SEO win).

## 5. Day-of-deploy

- [ ] Tag the pre-deploy commit: `git tag v0.1.0-prelaunch && git push origin v0.1.0-prelaunch`.
- [ ] `vercel --prod` from the linked working tree. Watch the build log for missing env vars — Vercel will warn but not fail on missing optional vars (KV, Plausible).
- [ ] `curl https://<domain>/api/health` **before** the first paid request: `status: "ok"`, `config.anthropic` and `config.kv` both `true`, `config.siteUrl` = the production origin. If any is wrong, fix the Vercel env var and redeploy — do **not** spend a Claude call against a misconfigured deploy.
- [ ] First production request: submit one title manually. Confirm `x-halflife-cache: MISS` on first call, `HIT` on second.
- [ ] Check Vercel KV usage in the dashboard: a single round trip should not blow past free-tier limits. If it does, regress before announcing the URL.
- [ ] Check the Anthropic console: the production key shows 1–2 calls. If it shows more, the cache key is wrong — block launch and investigate.
- [ ] OG image smoke: paste the canonical role URL into [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and [Twitter Card Validator](https://cards-dev.twitter.com/validator). Both should show the band-coloured 1200×630 preview.
- [ ] Plausible dashboard shows the first page view within ~30 seconds.

## 6. Post-deploy — first 24 hours

- [ ] Set an `ANTHROPIC_API_KEY` monthly spend alert at $20 in the Anthropic console. Phase-1 success metric is p50 cost-per-result < $0.01 (PLAN.md); $20/mo at that cost is ~2k uncached results.
- [ ] Set a Vercel project spend alert if a paid plan is enabled.
- [ ] Vercel KV: confirm 30-day TTL is reflected on stored keys via the dashboard or `vercel kv` CLI on a sample slug.
- [ ] Run a tiny edge-case sweep manually: a non-English title, a hyphenated title, a title with punctuation. Confirm none crash the route.
- [ ] If any production error surfaces, capture it before retrying — the route swallows KV errors by design (D-017), so the only red signal is in Vercel logs.

## 7. Post-deploy — before public launch

These do **not** block the first deploy (a quiet, unannounced production push is fine), but **do** block the LinkedIn / ProductHunt / press wave handled by L5.3.

- [ ] L3.1–L3.4 landed: top 200 roles seeded, sitemap generated, JSON-LD schema per role page.
- [ ] L4.1–L4.2 landed: "Most At-Risk Roles 2026" report page exists at `/report/2026`.
- [ ] L5.3 launch posts drafted in `docs/launch-posts.md` and reviewed.
- [ ] L5.4 email capture wired and tested with a real submission.
- [ ] Press-outreach memo (L4.3) ready but **not sent** — sending is a human step, not a routine step.

## 8. Rollback plan

- The auto-merge workflow squash-merges into `main` (`.github/workflows/auto-merge-claude.yml`). A bad commit can be reverted via a normal `git revert` + push; Vercel will re-deploy from `main` automatically.
- KV poisoning (a bad cached result going public) is mitigated by the dual-version cache key (D-017): bumping `prompt_version` or `methodology_version` in `lib/scoring/types.ts` silently invalidates every entry on next read with zero ops work.
- A leaking API key requires: revoke in the Anthropic console first, mint a new key, update Vercel env var, redeploy. The cache survives the key rotation untouched.

---

_If anything on this list is unclear before the first deploy, do not deploy. Open an issue or update the relevant ADR in `DECISIONS.md` first, then come back to this list._
