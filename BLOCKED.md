# BLOCKED — 2026-07-17 (still standing as of 2026-08-01, 25th fire)

**Leaf:** L3.2b Run the seed against a live key (**human-gated**) — and, behind it, every other
unchecked leaf: L3.1b, L4.1b, L5.1, L5.2, L5.4b.

This is not a one-leaf block. The routine has finished everything it can reach. All six remaining
unchecked leaves need a credential, a purchase, or a deploy — each one is a step the routine is
constitutionally forbidden to take (ROUTINE.md "Hard constraints" 3). D-131 (2026-07-16) called this
out and told the next run to stop rather than invent an L5.102. This file is that stop, and it has
held byte-for-byte through ten weekend/weeknight fires (see the re-confirmation log at the bottom).

## The six gated leaves

| Leaf | Gate | What unblocks it |
|---|---|---|
| L3.1b Re-rank corpus by real search volume | corgi-deferred | a **non-stub** `corgi-keywords` build — a corgi-repo code change, **not** a credential (see Standing facts) |
| L3.2b Run the seed against a live key | human-gated | `ANTHROPIC_API_KEY` + app running |
| L4.1b Generate + commit the live ranking | depends on L3.2b | nothing of its own — it just needs `data/roles/*.json` to exist |
| L5.1 Naming sign-off + domain purchase | human-gated | a browser + a credit card |
| L5.2 Deploy to Vercel | human-gated | Vercel account + keys |
| L5.4b Activate email capture | human-gated | `PLUNK_API_KEY` + a deploy |

(`L1.7b` is `[~]`, not `[ ]`; its remainder is likewise three human browser-checks — TM, .com
collision, registrar price — on `roleclock.ai` / `obsolesce.me` / `replacedby.ai`, ≤ 15 min.)

## Standing facts (verified against the system, not just re-read)

- **Live `.env` gate state:** `DATAFORSEO_USERNAME` and `DATAFORSEO_PASSWORD` are **SET**;
  `ANTHROPIC_API_KEY`, `PLUNK_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `VERCEL_TOKEN` are
  all **empty**. This has not changed since the 2026-07-17 halt.
- **L3.1b is not credential-gated.** DataForSEO creds are already present (above). The
  `corgi-keywords` binary exists on PATH (`/opt/homebrew/bin/corgi-keywords`), but its whole dispatch
  table is stubbed: `corgi/src/corgi/ahrefs/dispatcher.py:43` defines `fetch_keyword_overview(**kwargs)`
  as a stub that echoes params and makes no API call ($0.00, no data). Unblocking it means wiring
  `keyword_overview` to the real `ahrefs/client.py` path (~line 306) and rebuilding — **corgi-repo
  work, tracked in the corgi backlog, out of scope for this routine** (which cannot `pip install` or
  edit that repo as a leaf).
- **The launchd fires are still armed.** Both `~/Library/LaunchAgents/com.halflife.routine.burn.plist`
  and `...weeknight.plist` are present on this laptop (re-verified by `ls`). The "disable the plists
  until a gate opens" recommendation (D-132) has not been acted on, so each night's fire keeps
  spending Max quota to rediscover this file. The routine does **not** self-disable them — that is the
  human's deliberate call (it would un-arm the routine the instant a gate opens), already asked for
  nine times below.

## What I need from you — one of these, in priority order

1. **`ANTHROPIC_API_KEY`** → unblocks the keystone **L3.2b**, then the routine does **L4.1b**
   unattended and the shell becomes a site with content. Procedure is in `data/roles/README.md`:
   cost a `--limit 10` smoke run first, then `node scripts/seed-roles.mjs` over ~200 titles. Claude
   tokens (Max/subscription), **not** real cash.
2. **Disable the two launchd plists** until a gate opens — stops the nightly quota burn on a dammed
   roadmap. (Do this *and* #1 if you want the routine dormant until you hand over the key, then
   re-enable.)
3. **A non-stub `corgi-keywords` build** → unblocks **L3.1b** (a *quality* re-ranking, not a
   downstream blocker). ≤ $0.40 against the $1/week LEDGER cap.
4. **Naming sign-off + deploy** (L5.1 → L5.2 → L5.4b) — the launch chain.
   `docs/launch-checklist.md` is the sign-off doc.

**Suggested next action:** give me `ANTHROPIC_API_KEY` and nothing else — smallest input, largest
unblock. Until then the routine should not fire; every run is either empty or an invented guard, and
D-131 is explicit that the second is worse than the first.

---

## Re-confirmation log

Each entry below is a fire that re-checked the six gates against live system state and found the
block unchanged. Collapsed here (2026-07-27, hygiene — was six sprawling dated sections) so future
fires read one table, not a growing wall of identical paragraphs. **No entry found an open gate.**
Add a row; do not add a section.

| Date | Fire # | PR | What was re-verified this fire | New datum (if any) |
|---|---|---|---|---|
| 2026-07-17 | 1 | #149 | Original halt: walked ROADMAP top-down, all six leaves gated; pipeline not stuck (no non-superseded `claude/*` PRs) | — (D-132) |
| 2026-07-20 | 2 | #150 | Gate state unchanged | DataForSEO creds present; `corgi-keywords` binary exists but dispatch stubbed → L3.1b blocker is corgi-repo code, not a secret |
| 2026-07-24 | 3 | #152 | Live `.env`: only DataForSEO set; PR queue dependabot-only | A full week on from the halt, launchd fires still running (D-134) |
| 2026-07-26 | 5 | #153 | Live `.env` unchanged; PRs #63–#67, #116, #151 all dependabot | `ls`'d LaunchAgents — both plists present and armed (D-135) |
| 2026-07-26 | 6 | #154 | Live `.env` unchanged; PR queue dependabot-only | Second fire *same calendar day* as #153 — direct evidence the burn window fires several times a night |
| 2026-07-27 | 7 | #155 | Live `.env` unchanged (only DataForSEO set); PRs #63–#67, #116, #151 dependabot-only; both plists still armed | Consolidated this log into a table (doc hygiene); no leaf, no guard invented (D-131) |
| 2026-07-27 | 8 | #156 | Live `.env` unchanged (only DataForSEO set); PRs #63–#67, #116, #151 dependabot-only; both plists still armed | First fire reading the *consolidated* table — the #155 collapse held; 2nd burn-window night in a row, still no gate |
| 2026-07-27 | 9 | #157 | Live `.env` unchanged (only DataForSEO set); PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean | 3rd fire this calendar day — matches the burn cadence (`:30` half-hour fires); table still one screen, no section sprawl |
| 2026-07-28 | 10 | #158 | Live `.env` unchanged (only DataForSEO set); PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean | First **weeknight** fire since the halt (prior nine were burn-window) — confirms both plists fire independently; block outcome identical |
| 2026-07-29 | 11 | #159 | Live `.env` unchanged (only DataForSEO set); PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD 546782b) | Second consecutive **weeknight** fire — the weeknight plist is now firing on cadence; block outcome identical, ask unchanged |
| 2026-07-29 | 12 | #160 | Live `.env` unchanged (only DataForSEO set); PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD 20820d4) | Third **weeknight** fire in a row (two same calendar day, 2026-07-29) — the weeknight `:00`/`:30` cadence is now the dominant fire source; block outcome identical, ask unchanged |
| 2026-07-30 | 13 | #161 | Live `.env` unchanged (only DataForSEO set); PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD 2bae399) | Fourth consecutive **weeknight** fire — two full weeks (14 days) past the 2026-07-17 halt with the same six gates dammed; block outcome identical, ask unchanged |
| 2026-07-30 | 14 | (#162, ee2e247) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #64–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD ea5f0a7) | Fifth consecutive **weeknight** fire, second same calendar day (2026-07-30) as #161 — confirms the weeknight `:00`/`:30` pair both fire; block outcome identical, ask unchanged |
| 2026-07-31 | 15 | (#162, ee2e247) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #64–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD ee2e247) | Sixth consecutive **weeknight** fire, first fire of a new calendar day (2026-07-31) — two full weeks past the halt; block outcome identical, ask unchanged |
| 2026-07-31 | 16 | (#164, dedc322) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD e7739e4, #162 merged forward) | Seventh consecutive **weeknight** fire, second same calendar day (2026-07-31) as #162 — confirms the weeknight `:00`/`:30` pair both fire; block outcome identical, ask unchanged |
| 2026-07-31 | 17 | (#164, e02dbaa) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD dedc322, #164 merged forward) | First **burn-window** fire after seven straight weeknight fires (#158–#164) — confirms the burn `:30` plist is still firing on its weekend cadence too; block outcome identical, ask unchanged |
| 2026-08-01 | 18 | (#165, 9eb5826) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD 919644b, #164 merged forward) | Second consecutive **burn-window** fire (weekend of 2026-08-01), first fire of a new calendar month — 15 days past the 2026-07-17 halt with the same six gates dammed; block outcome identical, ask unchanged |
| 2026-08-01 | 19 | (this) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD f695eac, #165 merged forward) | Third consecutive **burn-window** fire, same weekend (2026-08-01) — 15 days past the 2026-07-17 halt with the same six gates dammed; block outcome identical, ask unchanged |
| 2026-08-01 | 20 | (this) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD b97cd8e, #167 merged forward) | Fourth consecutive **burn-window** fire, same weekend (2026-08-01) — the 19th fire (#167) auto-merged forward cleanly; block outcome identical, ask unchanged |
| 2026-08-01 | 21 | (this) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD 96719d6, #168 merged forward) | Fifth consecutive **burn-window** fire, same weekend (2026-08-01) — the 20th fire auto-merged forward cleanly (HEAD 96719d6); block outcome identical, ask unchanged |
| 2026-08-01 | 22 | (#170, 4dcd1a1) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD 25bf384, #169 merged forward) | Sixth consecutive **burn-window** fire, same weekend (2026-08-01) — the 21st fire auto-merged forward cleanly (HEAD 25bf384); block outcome identical, ask unchanged |
| 2026-08-01 | 23 | (#171, 4c2b498) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD 4dcd1a1, #170 merged forward) | Seventh consecutive **burn-window** fire, same weekend (2026-08-01) — the 22nd fire auto-merged forward cleanly (HEAD 4dcd1a1); block outcome identical, ask unchanged |
| 2026-08-01 | 24 | (this) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD c51113c, #171 merged forward) | Eighth consecutive **burn-window** fire, same weekend (2026-08-01) — the 23rd fire auto-merged forward cleanly (HEAD c51113c); block outcome identical, ask unchanged |
| 2026-08-01 | 25 | (this) | Live `.env` re-read key-by-key: `ANTHROPIC_API_KEY`/`PLUNK_API_KEY`/`KV_REST_API_URL`/`KV_REST_API_TOKEN`/`VERCEL_TOKEN` all empty, only DataForSEO set; PRs #63–#67, #116, #151 dependabot-only; both plists still armed; `ff-only` re-baseline to `origin/main` clean (HEAD 2ab6afa, #171/c0ec91f merged forward) | Ninth consecutive **burn-window** fire, same weekend (2026-08-01) — the 24th fire (c0ec91f) auto-merged forward cleanly; block outcome identical, ask unchanged |

Ask, unchanged across all twenty-five fires: **disable the plists, and/or hand over `ANTHROPIC_API_KEY`
(the keystone → L3.2b → L4.1b).** Nothing smaller than one of these changes the outcome of a fire.
