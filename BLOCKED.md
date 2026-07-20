# BLOCKED — 2026-07-17

**Leaf:** L3.2b Run the seed against a live key (**human-gated**) — and, behind it, every other unchecked leaf: L3.1b, L4.1b, L5.1, L5.2, L5.4b.

This is not a one-leaf block. The routine has finished everything it can reach. All six remaining
unchecked leaves need a credential, a purchase, or a deploy — each one is a step the routine is
constitutionally forbidden to take (ROUTINE.md "Hard constraints" 3). D-131 (2026-07-16) called
this out and told the next run to stop rather than invent an L5.102. This file is that stop.

## What I tried

- Re-baselined to `origin/main` (clean, fast-forward to `d57110c`), confirmed no non-superseded
  `claude/*` PRs are open — the pipeline is not stuck, there is simply nothing left to pick.
- Walked `ROADMAP.md` top-down for the first unchecked `[ ]` leaf. All six are gated:

  | Leaf | Gate | What unblocks it |
  |---|---|---|
  | L3.1b Re-rank corpus by real search volume | corgi-deferred | a **non-stub** `corgi-keywords` build (creds are already present — see the 2026-07-20 note below) |
  | L3.2b Run the seed against a live key | human-gated | `ANTHROPIC_API_KEY` + app running |
  | L4.1b Generate + commit the live ranking | depends on L3.2b | nothing of its own — it just needs `data/roles/*.json` to exist |
  | L5.1 Naming sign-off + domain purchase | human-gated | a browser + a credit card |
  | L5.2 Deploy to Vercel | human-gated | Vercel account + keys |
  | L5.4b Activate email capture | human-gated | `PLUNK_API_KEY` + a deploy |

  (`L1.7b` is `[~]`, not `[ ]`, and its remainder is likewise three human browser-checks.)
- Did **not** write a new `scripts/__tests__/*-consistency.test.mjs` guard. D-131 names that exact
  move as the failure mode to stop: the L5.90–L5.100 tail was make-work invented to avoid an
  "empty run" smell, and its marginal value has reached ~0.

## What I need from you

One of these three unblocks a different slice of the roadmap. **L3.2b is the keystone** — it alone
unblocks L4.1b, and together those two are the last of the actual product work:

1. **`ANTHROPIC_API_KEY`** → unblocks **L3.2b**, then the routine can do **L4.1b** unattended.
   Procedure is already written in `data/roles/README.md`. Cost a `--limit 10` smoke run first,
   then `node scripts/seed-roles.mjs` over the ~200 titles. Claude tokens, not real cash.
2. **A non-stub `corgi-keywords` build** → unblocks **L3.1b**. ≤ $0.40 against the
   $1/week LEDGER cap. This is a *quality* improvement (real volume ordering vs. the current
   `curated-interim` alphabetical), not a blocker for anything downstream. **Credentials are no
   longer the gap** — see the 2026-07-20 re-verification below; the remaining blocker is a
   corgi-repo code change, not a secret this routine can be handed.
3. **Naming sign-off + deploy** (L5.1 → L5.2 → L5.4b) — the launch chain. `docs/launch-checklist.md`
   is the sign-off doc; `docs/naming-shortlist.md` has the three survivors (`roleclock.ai`,
   `obsolesce.me`, `replacedby.ai`) awaiting ~15 minutes of TM / .com-collision / registrar-price
   browser checks.

## Suggested next action

Give me **`ANTHROPIC_API_KEY`** and nothing else. That is the smallest input with the largest
unblock: L3.2b is the last piece of real product work the routine can then carry through L4.1b on
its own, and it turns the site from a working shell into a site with content in it.

Until then, **the routine should not fire.** Every run from here is either an empty run or another
invented guard, and D-131 is explicit that the second is worse than the first. Suggest disabling
the launchd jobs (`com.halflife.routine.burn.plist`, `com.halflife.routine.weeknight.plist`) until
one of the three gates above is opened — otherwise the nightly fires will keep burning Max quota to
rediscover this same file.

---

## Re-verification — 2026-07-20 (burn run, blocked-L3.1b)

A burn-window run re-checked whether any gate had opened since 2026-07-17. Verdict: **no gate is
open; the block stands.** But two facts were confirmed against the actual system state (not just a
re-read of this file), and they sharpen the L3.1b ask:

1. **DataForSEO credentials are already present** in the repo's `.env` — `DATAFORSEO_USERNAME` and
   `DATAFORSEO_PASSWORD` both hold values. The original L3.1b row named `DATAFORSEO_LOGIN` as the
   gate, which read as "creds are missing." They are not. (`ANTHROPIC_API_KEY`, `PLUNK_API_KEY`,
   and the Vercel/KV secrets remain empty — L3.2b / L5.2 / L5.4b are unchanged.)
2. **The `corgi-keywords` binary now exists on PATH** (`/opt/homebrew/bin/corgi-keywords`, a real
   Click CLI backed by `corgi.ahrefs.keywords_cli`) — but its whole dispatch table is still stubbed.
   `corgi/src/corgi/ahrefs/dispatcher.py:43` defines `fetch_keyword_overview(**kwargs)` as a
   `"""Stub callable"""` that `return {"metric": "keyword_overview", **kwargs}` — it echoes the
   parsed flags and makes **no** API call ($0.00, no data). `--dry-run` confirms: it prints the
   params back, not a cost estimate. Every metric in `METRIC_DISPATCH_TABLE` points at a like stub.

**So L3.1b's sole remaining blocker is a corgi-repo change, not a credential this routine can be
handed.** Someone must wire `keyword_overview` in the corgi dispatcher to the real
`ahrefs/client.py` path (which already implements it, line ~306) and rebuild `corgi-keywords`. That
is corgi-project work, tracked in the corgi backlog — out of scope for the halflife routine, which
cannot `pip install` or edit that repo as part of a leaf. Until the corgi build ships a live
`keyword_overview`, L3.1b stays deferred exactly as before; the keystone ask is unchanged
(**`ANTHROPIC_API_KEY` → L3.2b → L4.1b**). This run wrote no test guard (D-131).
