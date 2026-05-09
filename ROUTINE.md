# Autonomous Routine — halflife

_How each scheduled local run is expected to behave._

## Schedule

- **Cadence:** every 4 hours, on the user's MacBook (laptop is `andrei` or `andriy` — same person, two machines)
- **Driver:** macOS `launchd` agent (see `~/Library/LaunchAgents/com.halflife.routine.plist`); the agent invokes `claude -p` headlessly via `~/bin/run-claude-routine.sh halflife`, capped at $2 USD per run via `--max-budget-usd` (Claude Code CLI has no turn-count flag — soft target is ~50 turns)
- **Working tree:** `~/PROJ/halflife` (resolves to `/Users/andrei/PROJ/halflife` on one laptop, `/Users/andriy/PROJ/halflife` on the other)
- **Remote:** `https://github.com/internetyev/halflife`
- **Mirror:** `~/Library/CloudStorage/Dropbox/DropsyncFiles/Obsidian Vault/HALFLIFE/` (if the directory exists on this laptop; otherwise skip the mirror step and note it in the commit body)

> **Note:** This routine used to run as a cloud agent on a daily 03:00 schedule. The cloud agent stopped landing commits, so the routine moved to local execution. Any reference below to "the wrapper" or "the cloud platform" is historical — it is the local launchd job and the local `git push` that publishes work now.

## Hard constraints

1. **Per-run budget: ≤ $2 USD spend** (enforced by `claude -p --max-budget-usd 2.00`). Soft target: ~50 prompt turns. Plan to land at least one leaf per run; on a quiet run, prefer splitting a chunky leaf into sub-leaves over forcing low-value work.
2. **≤ $1 USD/week total `corgi` skill spend.** Track cumulative use in `LEDGER.md`. If the running 7-day total would exceed $1, defer the corgi step and pick a different leaf.
3. **No production deploys, no domain purchases, no API-key commits, no destructive git operations** (no `push --force`, no `reset --hard origin/...`, no branch deletion on the remote, no `git push origin :main` style deletions).
4. **No `npm install` / `pnpm install` / `pip install`** — installs are human steps. Commit manifests and config; do not run package managers.
5. **No interactive commands.** Every command must run non-interactively to completion.
6. **Push to a `claude/<timestamp>-<leaf-id>` branch only — never directly to `main`.** The `.github/workflows/auto-merge-claude.yml` workflow squash-merges any PR opened from a `claude/*` branch. If `gh` is not authenticated on this laptop, push the branch and stop — leave PR creation for the human.

## The run, step by step

### 1. Orient

- `cd ~/PROJ/halflife`
- `git status && git fetch origin && git log --oneline -10`
- If the working tree is dirty with someone else's changes, **abort** — write a one-line note to `BLOCKED.md` and stop.
- Read `ROADMAP.md` and `BLOCKED.md` (if present).

### 2. Pick a leaf

- Choose the **first unchecked `[ ]` leaf** in `ROADMAP.md` (top-down, phase-by-phase).
- If the leaf depends on something that needs human sign-off (domain purchase, deploy, real API key, sending email), skip it.
- If the leaf would clearly exceed the $2 / ~50-turn budget, **split it** by writing sub-leaves into `ROADMAP.md` (e.g. L1.4 → L1.4a, L1.4b). Splitting is itself a valid productive run.

### 3. Work in place

- Create a fresh working branch: `git checkout -b claude/$(date -u +%Y%m%dT%H%M%SZ)-<leaf-id>` (e.g. `claude/20260509T140000Z-L1.3`).
- Do the smallest amount of work that completes the leaf.
- Update `ROADMAP.md`: mark the leaf `[~]` (draft, wants review) or `[x]` (ready to merge).
- Append a one-line entry to `DECISIONS.md` if a non-obvious choice was made.
- Append the corgi spend (if any) to `LEDGER.md` with date + USD + reason.

### 4. Mirror (if available)

- If `~/Library/CloudStorage/Dropbox/DropsyncFiles/Obsidian Vault/HALFLIFE/` exists, copy any new/changed `*.md` and `*.csv` files under `docs/`, `evals/`, `prompts/`, plus the top-level planning docs (`PLAN.md`, `ROADMAP.md`, `ROUTINE.md`, `DECISIONS.md`, `BLOCKED.md`, `LEDGER.md`) into it. Preserve relative paths under that root.
- If the directory does not exist on this laptop, skip and note `mirror: skipped (vault not on this laptop)` in the commit body.

### 5. Commit + push to a `claude/*` branch — workflow auto-merges

- Commit message format: `<phase-id>: <leaf-id> <imperative summary>` (e.g., `phase-1: L1.3 add scoring methodology`).
- **Your PRs auto-merge.** A `.github/workflows/auto-merge-claude.yml` workflow squash-merges any PR opened from a `claude/*` branch as soon as it is created. There is no human review gate. **That means your commit body becomes the merged PR description and lives in the repo's history forever — write it as if a future maintainer (possibly you, in a different session) is the only person who will ever read it.**
- Commit body must include these structured fields, in this order:
  - **Leaf:** the line copied verbatim from `ROADMAP.md` (id + description).
  - **Why:** one sentence on why this leaf, now. Skip if the answer is "it was the next unchecked leaf" — only write Why when there's context worth preserving.
  - **What changed:** 2–4 bullets that name files and concepts, not just verbs. "Adds `lib/foo/types.ts` with the `Score` discriminated union and 6-field `Result` shape" beats "Adds types".
  - **Design notes:** any non-obvious choice — a tradeoff, a deferred concern, a thing the next run should know. Skip if there are none.
  - **Cost:** corgi USD spent in this run + Claude prompt cost estimate (e.g. `$0.00 corgi, ~$0.05 prompt`).
  - **Mirror:** list of new/changed `*.md` and `*.csv` paths under `docs/`, `evals/`, `prompts/`, plus the top-level planning docs. (Or `mirror: skipped (vault not on this laptop)`.)
  - **Next:** the leaf id and short description of what the next run will likely pick.
- Push the branch: `git push -u origin HEAD`.
- If `gh` is authenticated on this laptop, open the PR: `gh pr create --fill --base main --head <branch>`. The auto-merge workflow handles the rest.
- If `gh` is **not** authenticated, stop after the push and leave a note in the run log — the human will open the PR. Do not attempt `gh auth login` from the routine.

### 6. If blocked

If the leaf cannot be completed without human input (need a credential, need a decision, hit an unexpected error twice), stop and write `BLOCKED.md` with:

```
# BLOCKED — <date>

**Leaf:** <leaf-id>
**What I tried:**
**What I need from you:**
**Suggested next action:**
```

Commit `BLOCKED.md` on a `claude/blocked-<leaf-id>` branch and push. **Do not** write `BLOCKED.md` for run-budget exhaustion — that's a normal stop, just leave the leaf as `[~]`.

## Cost discipline

- Prefer free tools (Read, grep, file edits) over web/API calls.
- Before any `corgi-cli` call, estimate spend; if a single call > $0.20, write the rationale in the PR body.
- Claude prompt design: short system prompts, prompt caching enabled in any code that calls the API. Do **not** call the live Anthropic API from the routine itself — only commit prompt files and eval results that the human runs.

## Stop conditions (any one fires → end run gracefully)

- The $2 spend budget is exhausted.
- A test or `git push` fails twice.
- Working tree has unrelated changes from another session — abort, do not touch them, write a one-line note in `BLOCKED.md`.
- A leaf would require buying a domain, deploying, sending an email, or posting publicly.

## Per-run output expectation

A normal run produces exactly one of:
- ✅ Merged PR (one leaf done, ROADMAP updated, mirror updated)
- 🟡 Pushed branch awaiting human PR creation (`gh` not authed) or human review
- 🔴 `BLOCKED.md` PR with a clear ask
- 🛠️ A roadmap-split PR (the leaf was too big; sub-leaves added)

Empty runs are a smell. If the routine cannot find an unblocked leaf, the routine itself **opens a PR adjusting `ROADMAP.md`** to add the next leaves — that's still a productive run.
