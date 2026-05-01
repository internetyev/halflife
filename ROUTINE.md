# Autonomous Routine — halflife

_How each scheduled 03:00 CET run is expected to behave._

## Schedule

- **Cadence:** daily
- **Time:** 03:00 Europe/Madrid (Andrei's local CET/CEST)
- **Working tree:** `/Users/andrei/PROJ/halflife`
- **Remote:** `https://github.com/internetyev/halflife`
- **Mirror:** `/Users/andrei/Library/CloudStorage/Dropbox/DropsyncFiles/Obsidian Vault/HALFLIFE/`

## Hard constraints

1. **Daily budget depends on day of week.** Check `date -u +%u` (Mon=1..Sun=7) and the Madrid local hour (`TZ='Europe/Madrid' date +%H`) before doing anything else.
   - **Sunday (any hour) and Monday before 09:00 Madrid: UNCAPPED — deplete.** This is the "use it or lose it" window; Andrei's weekly Claude cap resets at Monday 09:00 CET, and Sunday-plus-early-Monday is the last stretch where remaining quota can still be spent on this project. Burn through as many leaves as the session can handle. Stop only when the session limit kicks in or there are no actionable leaves left. Make multiple commits in one session — one per leaf — each in the commit-only-no-push pattern; the wrapper opens a PR per commit and the auto-merge workflow squash-merges them.
   - **Saturday: ≤ 10 tool/command calls per run.** Saturday is the warm-up: take down a chunky leaf or two, but leave headroom for Sunday's depletion sweep.
   - **Tue–Fri (any hour) and Mon at 09:00 or later: ≤ 2 tool/command calls per run.** Tight — usually only enough for a tiny edit or a `ROADMAP.md` split. That is fine. (The 03:00 cron always fires before 09:00 on Monday, so in practice the Monday cron run uses the UNCAPPED rule above; this 2-command rule covers manual / off-schedule fires.)
   Plan the run before starting and stop early if you blow past the budget. A short, clean PR beats a long broken one.
2. **≤ $1 USD/week total `corgi` skill spend.** Track cumulative use in `LEDGER.md`. If the running 7-day total would exceed $1, defer the corgi step and pick a different leaf.
3. **No production deploys, no domain purchases, no API-key commits, no destructive git operations** (no `push --force`, no `reset --hard origin/...`, no branch deletion on the remote).
4. **No `npm install` / `pnpm install` / `pip install`** — installs are human steps. Commit manifests and config; do not run package managers.
5. **No interactive commands.** Every command must run non-interactively to completion.
6. **Do not run `git push` or `gh pr create`.** The cloud wrapper handles publishing. Just commit on the workspace's default branch (which the platform set up) and exit — the wrapper will create a `claude/...` branch and open the PR. Never push directly to `main`.

## The run, step by step

### 1. Orient (≤ 1 command)

- `git -C /Users/andrei/PROJ/halflife status && git fetch origin && git log --oneline -10`
- Read `ROADMAP.md` and `BLOCKED.md` (if it exists).

### 2. Pick a leaf

- Choose the **first unchecked `[ ]` leaf** in `ROADMAP.md` (top-down, phase-by-phase).
- If the leaf depends on something that needs human sign-off, skip it and go to the next.
- If the chosen leaf would clearly exceed today's budget (2 on Tue–Fri, 10 on Sat, uncapped on Sun + Mon-pre-09:00), **split it** by writing a sub-plan into `ROADMAP.md` (leaves like L1.4 → L1.4a, L1.4b) — that itself is a valid daily run. On weekdays splitting will be the norm; that is fine. On uncapped days, prefer to do the work rather than split.

### 3. Work in place

- Stay on the working branch the platform handed you (do not run `git checkout` to switch branches).
- Do the smallest amount of work that completes the leaf.
- Update `ROADMAP.md`: mark the leaf `[~]` (draft) or `[x]` (ready to merge).
- Append a one-line entry to `DECISIONS.md` if a non-obvious choice was made.
- Append the corgi spend (if any) to `LEDGER.md` with date + USD + reason.

### 4. Mirror

- Copy any new/changed `*.md` and `*.csv` files under `docs/`, `evals/`, `prompts/`, plus the top-level planning docs (`PLAN.md`, `ROADMAP.md`, `ROUTINE.md`, `DECISIONS.md`, `BLOCKED.md`, `LEDGER.md`) to:
  `/Users/andrei/Library/CloudStorage/Dropbox/DropsyncFiles/Obsidian Vault/HALFLIFE/`
- Preserve relative paths under that root.

### 5. Commit only — the platform publishes, the workflow auto-merges

- Commit message format: `<phase-id>: <leaf-id> <imperative summary>` (e.g., `phase-1: L1.3 add scoring methodology`).
- **Your PRs auto-merge.** A `.github/workflows/auto-merge-claude.yml` workflow squash-merges any PR opened from a `claude/*` branch as soon as it is created. There is no human review gate. **That means your commit body becomes the merged PR description and lives in the repo's history forever — write it as if a future maintainer (possibly you, in a different session) is the only person who will ever read it.**
- Commit body must include these structured fields, in this order:
  - **Leaf:** the line copied verbatim from `ROADMAP.md` (id + description).
  - **Why:** one sentence on why this leaf, now. Skip if the answer is "it was the next unchecked leaf" — only write Why when there's context worth preserving.
  - **What changed:** 2–4 bullets that name files and concepts, not just verbs. "Adds `lib/foo/types.ts` with the `Score` discriminated union and 6-field `Result` shape" beats "Adds types".
  - **Design notes:** any non-obvious choice — a tradeoff, a deferred concern, a thing the next run should know. Skip if there are none.
  - **Cost:** corgi USD spent in this run + Claude prompt cost estimate (e.g. `$0.00 corgi, ~$0.02 prompt`).
  - **Mirror:** list of new/changed `*.md` and `*.csv` paths under `docs/`, `evals/`, `prompts/`, plus the top-level planning docs. Andrei syncs these to `Obsidian Vault/HALFLIFE/` separately on his Mac — this list is a courtesy index, not a trigger.
  - **Next:** the leaf id and short description of what the next run will likely pick.
- **Do NOT run `git push` or `gh pr create`.** The cloud platform's wrapper publishes the commit to a `claude/...` branch and opens the PR. Direct push and direct PR creation are 403'd by the proxy.

### 6. If blocked

If the leaf cannot be completed without human input (need a credential, need a decision, hit an unexpected error twice), stop and write `BLOCKED.md` with:

```
# BLOCKED — <date>

**Leaf:** <leaf-id>
**What I tried:**
**What I need from you:**
**Suggested next action:**
```

Commit `BLOCKED.md` on a branch and open a PR titled `BLOCKED: <leaf-id> needs human input`. **Do not** write `BLOCKED.md` for run-budget exhaustion — that's a normal stop, just leave the leaf as `[~]`.

## Cost discipline

- Prefer free tools (Read, grep, file edits) over web/API calls.
- Before any `corgi-cli` call, estimate spend; if a single call > $0.20, write the rationale in the PR body.
- Claude prompt design: short system prompts, prompt caching enabled in any code that calls the API. Do **not** call the live Anthropic API from the routine itself — only commit prompt files and eval results that the human runs.

## Stop conditions (any one fires → end run gracefully)

- Today's command budget used (2 on weekdays, 10 on weekend).
- A test or a `gh pr create` fails twice.
- Working tree has unrelated changes from another session — abort, do not touch them, write a one-line note in `BLOCKED.md`.
- A leaf would require buying a domain, deploying, sending an email, or posting publicly.

## Per-run output expectation

A normal day produces exactly one of:
- ✅ Merged PR (one leaf done, ROADMAP updated, mirror updated)
- 🟡 Draft PR awaiting human review
- 🔴 `BLOCKED.md` PR with a clear ask

Empty days are a smell. If the routine cannot find an unblocked leaf, the routine itself **opens a PR adjusting `ROADMAP.md`** to add the next leaves — that's still a productive day.
