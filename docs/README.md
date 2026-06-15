# Documentation index

The `docs/` directory holds halflife's longer-form documentation. This index is
the single entry point — GitHub renders it automatically when you navigate into
the directory, and the L5.48 [relative-link checker](../scripts/check-doc-links.mjs)
keeps every link below honest. For the project's front door, start at the
repo-root [`README.md`](../README.md); for the work queue, see
[`ROADMAP.md`](../ROADMAP.md).

The docs split into two audiences: **contributor docs** describe the system as
built and stay authoritative against the code, and **launch docs** are the
human's pre-launch playbooks (several are explicit `DRAFT — DO NOT POST/SEND`
files the autonomous routine is forbidden to act on).

## Contributor docs

| Doc | What it covers |
| --- | --- |
| [`architecture.md`](architecture.md) | How the codebase fits together — the request flow, the data pipeline, and the recurring patterns a contributor meets first. |
| [`data-schema.md`](data-schema.md) | Field-by-field reference for the three on-disk JSON contracts under `data/` that the validators enforce and the app reads at runtime. |
| [`operations.md`](operations.md) | Day-2 runbook for the deployed app — verify a deploy, re-run the data pipeline, bust or roll back the cache, rotate keys, read telemetry. |
| [`methodology.md`](methodology.md) | The authoritative rubric for how the obsolescence score is constructed (the v1 prompt drafted in [`../prompts/role-analysis.md`](../prompts/role-analysis.md)). |

## Launch docs (human-gated)

| Doc | What it covers |
| --- | --- |
| [`launch-checklist.md`](launch-checklist.md) | The human sign-off gate before the first production deploy — naming/domain, env wiring, smoke walk-through, content/legal gates, day-of-deploy verification, rollback. |
| [`naming-shortlist.md`](naming-shortlist.md) | The final-name evaluation (TM / `.com` collision / registrar price / SERP gates) feeding the L5.1 naming sign-off. |
| [`launch-posts.md`](launch-posts.md) | **DRAFT — DO NOT POST.** The launch-copy kit: ProductHunt listing, LinkedIn posts, optional X thread, post gate, and launch-day order of operations. |
| [`press-outreach.md`](press-outreach.md) | **DRAFT — DO NOT SEND.** The outreach playbook: story hooks, target list, asset kit, and the send gate a person ticks before anything goes out. |

## Related top-level docs

These live at the repo root, not under `docs/`, but are part of the same set:

- [`../PLAN.md`](../PLAN.md) — the product thesis and scope.
- [`../ROADMAP.md`](../ROADMAP.md) — the phase-by-phase leaf queue the routine works through.
- [`../DECISIONS.md`](../DECISIONS.md) — the ADR log (`D-NNN` entries referenced throughout these docs).
- [`../ROUTINE.md`](../ROUTINE.md) — how each autonomous run behaves.
- [`../SECURITY.md`](../SECURITY.md) — responsible-disclosure policy.
- [`../.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) — local setup and the contribution flow.
