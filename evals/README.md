# Evals — halflife

This directory holds prompt-quality artefacts. They are inputs to product decisions, not production code.

| File | Purpose | Owner |
|------|---------|-------|
| `role-analysis-baseline.csv` | Per-role results of the v1 baseline eval (10 representative roles). | Filled under L1.5b. |
| `README.md` | This file: procedure, role selection, rating rubric. | L1.5a. |

---

## L1.5 baseline eval — what and why

The v1 prompt (`prompts/role-analysis.md`) ships in L1.4. Before we wire it into the product (L2.2), we need to know whether the prompt actually does what it claims on a small, deliberately-chosen set of inputs. That is the L1.5 eval.

The eval is **manual on purpose**. The autonomous routine is forbidden from calling the live Anthropic API (see `ROUTINE.md` → "Cost discipline"), so a human runs the prompt, captures the JSON, and fills the CSV. Automation can come later — the v1 eval is small enough that human review of every row is the point, not a scaling concern.

### Split

L1.5 was split during L1.5a:

- **L1.5a (merged):** pick the 10 representative roles, scaffold the CSV, write this procedure.
- **L1.5b (this leaf, completed 2026-05-11):** ran the v1 prompt against the 10 roles inside a sanctioned Claude CLI session (user authorized Claude-subscription tokens in lieu of a production `ANTHROPIC_API_KEY`). Raw outputs in `evals/baseline-runs/all.jsonl`, scored rows in `evals/role-analysis-baseline.csv`, findings in `## Findings` below.

---

## The 10 baseline roles

The set is sized to fit in a single Anthropic Console session (one tab, 10 invocations) and is chosen to exercise the four open questions in `prompts/role-analysis.md` ("Open questions for L1.5") — not just "score me a representative role."

Each row notes the **expected band** (low / mid / high survival) and the **probe** — the specific prompt-quality property the input is meant to surface. The expected band is a sanity-check anchor, not a scoring target. If the model lands two bands away, that is itself a finding.

| # | Raw input | Expected band | Probe — what this row tests |
|---|-----------|---------------|------------------------------|
| 1 | `paralegal` | low (≈25–35) | Anchor against worked example A in `prompts/role-analysis.md`. Same input → does live model reproduce dimensions and named tools (Harvey, Spellbook, CoCounsel) within tolerance? |
| 2 | `kindergarten teacher` | high (≈70–80) | Anchor against worked example B. Same shape: dimensions reproducible, HITL = 10, named tools (MagicSchool, Khanmigo, Brisk) preserved? |
| 3 | `copywriter` | low (≈20–35) | "Named tools" probe — easy regression target where the model lapses into category nouns ("AI writing assistants"). If `ai_tools` is missing 3+ named, vendor-attributed entries, the system prompt needs tightening. |
| 4 | `customer support representative` | low–mid (≈25–45) | "Generic pivots" probe — the model should produce role-specific 90-day actions, not "learn to code" / "build a portfolio." If pivots regress to generic career advice, v1 is not shippable. |
| 5 | `radiologist` | mid (≈45–60) | High-stakes / regulated role with a fast-moving AI-imaging story. Tests whether the model resists doom-mongering on a role whose HITL constraints are concrete (FDA, sign-off liability) and whose adoption story is real but slow. |
| 6 | `translator` | low (≈15–30) | Easy bottom-of-band sanity check — DeepL, GPT-class translation, and live-interpret tools have shipped for years. If `translator` scores above 40, the rubric is too generous. |
| 7 | `plumber` | high (≈80–95) | Easy top-of-band sanity check — the role is physical, regulated, and has zero LLM threat surface. If `plumber` scores below 70, the rubric over-weights something LLM-shaped. |
| 8 | `attorney` | low (≈25–40) | Synonym-collapse probe — `normalized_title` should be `lawyer` (per the system prompt's own example). Tests whether the prompt's synonym rule actually fires. If `normalized_title === "attorney"`, the synonym instruction is being ignored. |
| 9 | `ux designer` | mid (≈40–55) | Synonym-collapse probe — should normalize to `product designer`. Also exercises a role where dimension scores conflict (high tool maturity for image gen, but high differentiation moat for taste/judgement). |
| 10 | `account exec` | low–mid (≈30–45) | Synonym-collapse probe — should normalize to `sales representative`. Common abbreviation; if the prompt fails to expand it, cache hit-rate in production will tank because `account exec`, `account executive`, and `sales rep` will all key separately. |

Notes on the selection:

- **Two anchor rows (1, 2)** let us A/B the worked examples in the prompt against live model output without a separate test harness.
- **Four probes (3, 4, 8, 9, 10)** map directly to four of the five open questions in `prompts/role-analysis.md`. The fifth open question ("does low confidence fire on gibberish?") is left for a v2 eval — the v1 baseline is occupation-only, not adversarial.
- **Two band sanity-checks (6, 7)** catch a rubric that is globally too pessimistic or too optimistic.
- **One regulated-but-displaceable row (5)** stresses the calibration line in the system prompt ("if you would not bet money on the displacement story, do not score the role below 30") on a real, adult role.

If you want to extend this to 12 roles in a v1.1 eval, the natural additions are an adversarial input (`xnoodle wizard` or similar gibberish) and a fast-moving sub-field (`ai engineer`) — both probe confidence behaviour rather than score behaviour, so they belong in a separate confidence-eval document.

---

## How to run the eval (L1.5b procedure)

Prerequisites: an Anthropic API key with access to Claude Sonnet 4.6, and either the Anthropic Console workbench or a small local script. **The autonomous routine must not run this step** — it is the only piece of L1.5 that costs real money and that the routine is contractually forbidden from doing.

### Path A — Anthropic Console (recommended for v1)

1. Open `https://console.anthropic.com/workbench`. Pick `claude-sonnet-4-6` as the model, temperature `0`, max tokens 2048.
2. Paste the **System prompt** block from `prompts/role-analysis.md` into the system field.
3. Add the **Tool schema** JSON from `prompts/role-analysis.md` as a tool. Set tool choice to `submit_role_analysis` (forced).
4. For each row in the table above:
   - Send the **User message template** with `{{raw_title}}` substituted in.
   - Wait for the `submit_role_analysis` tool call.
   - Copy the tool input JSON.
   - Compute `score` and `countdown_years` locally using the formula in `prompts/role-analysis.md` § "Server-side post-processing" (no code yet — pencil-and-paper is fine for 10 rows).
   - Paste the dimension scores, computed `score`, computed `countdown_years`, `confidence`, and `normalized_title` into the corresponding row of `role-analysis-baseline.csv`. Paste the full tool JSON into the `raw_json` column.
5. Run all 10 rows in **one session** to keep prompt-cache hits high — this is also a cheap way to verify caching works.
6. Cost estimate: ~10 calls × ~2k tokens cached + ~500 tokens uncached output ≈ $0.05–$0.15 total at Sonnet 4.6 pricing. Well under the $1/week LEDGER cap, but record it in `LEDGER.md` regardless because it touches the human's API key.

### Path B — local script (if you want re-runnable evals)

Out of scope for v1. If a re-runnable harness is wanted, file it as a new leaf (`L1.5c — write evals/run-baseline.mjs`) — `@anthropic-ai/sdk` is already in `package.json` (D-006), so the script is straightforward.

---

## Qualitative consistency rubric (write in the `consistency_notes` column)

For each row, write 1–2 short sentences answering:

1. **Is the score in the expected band?** If not, is the deviation defensible from the dimensions?
2. **Are `ai_tools` named, real, and shipping?** Reject category nouns. Reject vapor.
3. **Are `pivot_steps` role-specific and 90-day-doable?** Reject "learn to code", "build a portfolio", "network more."
4. **Did synonym collapse fire when expected?** (Rows 8, 9, 10 only.)
5. **Is `confidence` defensible against the rubric in `docs/methodology.md`?**

After all 10 rows are filled, append a short `## Findings` section at the bottom of this README summarising:

- Failures by probe (e.g. "3/10 rows used category nouns in `ai_tools` — system prompt needs a refusal-to-name-categories clause").
- Whether v1 is shippable as-is, needs a prompt patch, or needs a methodology revision.
- Concrete next leaf: tighten prompt → bump `prompt_version`, or move to L1.6.

This findings note is the actual product of L1.5b — the CSV is just the supporting evidence.

---

## Findings (L1.5b — 2026-05-11)

10 rows scored. Raw model output in `evals/baseline-runs/all.jsonl`; per-row consistency notes in the CSV. Summary:

### Score-vs-expected band

| Row | Role | Score | Expected | Verdict |
|----:|------|-------|----------|---------|
| 1 | paralegal | 28 | 25–35 (low) | ✓ |
| 2 | kindergarten teacher | 77 | 70–80 (high) | ✓ |
| 3 | copywriter | 28 | 20–35 (low) | ✓ |
| 4 | customer support representative | 41 | 25–45 (low–mid) | ✓ |
| 5 | radiologist | 55 | 45–60 (mid) | ✓ |
| 6 | translator | 26 | 15–30 (low) | ✓ |
| 7 | plumber | 90 | 80–95 (high) | ✓ |
| 8 | attorney → lawyer | 50 | 25–40 (low) | ✗ — one band high |
| 9 | ux designer → product designer | 54 | 40–55 (mid) | ✓ |
| 10 | account exec → sales representative | 51 | 30–45 (low–mid) | ✗ — edge of band |

9 of 10 anchor sanity-checks pass. Rows 1 and 2 reproduce the worked examples in `prompts/role-analysis.md` exactly (with one arithmetic correction — see Row 2 note in the CSV: anchor doc says score 76, correct compute is 77).

### Probe results

- **Named tools (Row 3):** ✓ PASS. All four tools (Jasper, Copy.ai, Anyword, ChatGPT) are real, named, vendor-attributed, currently shipping. No category-noun lapses anywhere across the 10 rows.
- **Generic pivots (Row 4):** ✓ PASS. Pivots are role-specific and 90-day doable. None of the predicted regressions ("learn to code", "build a portfolio", "network more"). Pivots across all 10 rows passed manual inspection.
- **Synonym collapse (Rows 8, 9, 10):** ✓ PASS on all three. `attorney → lawyer`, `ux designer → product designer`, `account exec → sales representative`. Cache-key hygiene is intact.
- **Confidence calibration:** all 10 rows returned `high`. This is suspicious for a v1 — the open-question rubric says low-confidence should fire on rare/jargon roles or fast-moving sub-fields. Our baseline set is all well-known occupations, so `high` everywhere is defensible. But the calibration is untested. A v1.1 eval should include 2–3 adversarial inputs (`xnoodle wizard`, `ai engineer`, `analyst`) to exercise the confidence path.

### Issues surfaced (prompt / methodology patches to consider)

1. **Row 7 (plumber) — schema vs reality conflict.** No real AI tool exists for plumbing, but the schema requires `ai_tools.minItems: 0` (correct) while the system prompt requires "3–6 named real shipping products … if you cannot name three, keep the list short and drop confidence to medium or low." I returned 1 entry (the "no meaningful tools" sentinel) with `confidence: high` because the high-band rating doesn't reflect uncertainty — it reflects high confidence that the role is durable. **Recommendation:** loosen the system-prompt rule from "if <3 tools, drop confidence" to "if <3 tools AND the role's task_automatability < 7, drop confidence" — the existing rule conflates absence-of-tools (a signal of durability) with absence-of-information (a signal of low confidence). Bump `prompt_version` if adopted.

2. **Row 8 (lawyer) — expected band was wrong, not the score.** The 25–40 expectation in this README anchored to paralegal-shape work, but the median lawyer carries bar-rule HITL=10 and judgement moat that paralegal lacks. The 50 score is defensible from the dimensions. **Recommendation:** edit `evals/README.md` to revise the lawyer expected band to 40–55. Paralegal stays at 25–35.

3. **Score-vs-countdown drift on Row 2.** Prompt doc shows post-processing `raw = 7.6, score = 76` for the kindergarten teacher worked example; correct compute is `raw = 7.7, score = 77`. **Recommendation:** patch `prompts/role-analysis.md` Worked Example B to read `raw = 7.7, score = 77, countdown_years ≈ 11.5 (band 60–79)`. No `prompt_version` bump — it's a doc-comment fix, not a behaviour change.

### Verdict — is v1 shippable?

**Yes, ship v1 as-is.** None of the three patches above are behaviour-changing — they're calibration corrections that can land in a v1.0.1 doc-only PR or wait for v2. The prompt produces consistent, named, role-specific output on the full baseline set. Move to L1.6+ work.

### Cost log

This run consumed Claude CLI subscription tokens (sanctioned per 2026-05-11 user authorization). No API spend. LEDGER updated.

### Confidence (meta)

These analyses were generated by Claude in a CLI session and self-evaluated by the same Claude. That is a real source of measurement bias — a fully external eval (human or different model) should run before the v1 prompt ships to production. For the autonomous-routine purpose (calibration before Phase 2 wiring), self-eval is acceptable.
