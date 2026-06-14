# Contributing to halflife

Thanks for your interest in halflife. This file is the contributor-facing
companion to the surfaces that already exist in `.github/`: the issue forms
(`ISSUE_TEMPLATE/`), the pull-request template (`PULL_REQUEST_TEMPLATE.md`),
the reviewer routing (`CODEOWNERS`), and the security policy (`SECURITY.md`).
It exists so a first-time contributor does not have to reverse-engineer the
contribution model from those individual files.

## How this repo is built

halflife is built by an **autonomous Claude Code routine**, not by hand. The
full protocol is in [`ROUTINE.md`](../ROUTINE.md); the short version:

- Work is broken into **leaves** tracked in [`ROADMAP.md`](../ROADMAP.md). Each
  scheduled run picks the first unchecked `[ ]` leaf, does the smallest amount
  of work that completes it, and opens one auto-merging PR from a `claude/*`
  branch.
- Non-obvious choices are logged append-only in [`DECISIONS.md`](../DECISIONS.md)
  (ADR-style, `D-NNN`). Real-cash tool spend is tracked in
  [`LEDGER.md`](../LEDGER.md).
- Because the routine drives the build, most leaves land without human review.
  `claude/*` PRs squash-merge automatically via
  [`workflows/auto-merge-claude.yml`](workflows/auto-merge-claude.yml).

Human contributions are welcome, but please read the routing below first —
several common contributions have a designated channel that is **not** a plain
pull request or a blank issue.

## Reporting a bug or requesting a feature

Blank issues are disabled. Open a **New issue** and pick one of the two forms:

- **Bug report** (`ISSUE_TEMPLATE/bug_report.yml`) — a problem with the app or
  with a specific role-analysis result. Include the role you analyzed and what
  you expected.
- **Feature request** (`ISSUE_TEMPLATE/feature_request.yml`) — describe the
  underlying problem first, then the proposed solution. Note that halflife has
  a deliberately **fixed scope**: items in the
  [Out-of-scope parking lot](../ROADMAP.md) (mobile app, accounts/auth, paid
  tier, localisation, fine-tuned models, industry deep-dives) are welcome as
  discussion but may be declined to keep the product focused.

## Reporting a security vulnerability

**Do not** open a public issue, pull request, or discussion for anything
security-relevant. Use **GitHub Security Advisories**, which keeps the report
private until coordinated disclosure:

  https://github.com/internetyev/halflife/security/advisories/new

This is the same channel [`SECURITY.md`](../SECURITY.md) and the website's
`/.well-known/security.txt` both point at — there is one place security
reporters end up.

## Opening a pull request

Human-authored PRs go through normal review (the routine's own PRs do not).
When you open one:

- Fill in [`PULL_REQUEST_TEMPLATE.md`](PULL_REQUEST_TEMPLATE.md). Its fields
  mirror ROUTINE.md §5's commit-body contract (Leaf / Why / What changed /
  Design notes / Cost / Mirror / Next) so a human PR and a routine PR read the
  same way in the merged history. Delete a field heading entirely if it does
  not apply — do not leave empty stubs.
- [`CODEOWNERS`](CODEOWNERS) requests the maintainer as a reviewer
  automatically; you do not need to add reviewers by hand.
- Keep PRs small and single-purpose, in the spirit of the one-leaf-per-PR
  routine. Unrelated changes belong in separate PRs.

## Local development

Setup lives in the [README](../README.md#local-setup), and
[`docs/architecture.md`](../docs/architecture.md) maps how the codebase fits
together (request flow, data pipeline, the recurring patterns) — read it
before your first change. The key contributor constraints:

- **The routine never runs package installs** — the first human to clone runs
  `npm install` by hand. CI uses `npm install` (not `npm ci`); there is no
  committed lockfile (`.npmrc` sets `package-lock=false`).
- **Node version:** use the version pinned in [`.nvmrc`](../.nvmrc) (`nvm use`).
  `.npmrc` sets `engine-strict=true`, so an unsupported Node version fails the
  install with a clear message rather than a confusing downstream error.
- **Editor conventions:** [`.editorconfig`](../.editorconfig) and
  [`.gitattributes`](../.gitattributes) pin indentation and LF line endings.
  Most editors apply these automatically.
- **Common commands** are wrapped in the repo-root [`Makefile`](../Makefile):
  `make help` lists every target; `make ci` runs the full pre-merge sequence
  (typecheck → lint → build → validate → test → test-py) locally, mirroring
  [`.github/workflows/ci.yml`](workflows/ci.yml). The targets are thin wrappers
  over the `package.json` scripts — use either; `make` is just the shorter
  entry point.

## License

A license has not yet been chosen; it will be settled before public launch
(tracked as a Phase 5 decision). Until then, treat the code as
all-rights-reserved and ask before reusing it outside a contribution.
