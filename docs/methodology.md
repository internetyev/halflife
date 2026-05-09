# Methodology — How the Obsolescence Score Is Built

_Last updated: 2026-05-09. Authoritative rubric for the v1 prompt drafted in `prompts/role-analysis.md` (L1.4)._

This document is the contract between the Claude prompt and the rest of the product. If you change the score formula, the dimension list, or the confidence rubric, change it here first and update the prompt to match.

## TL;DR

Given a normalised job title, a single Claude tool-use call returns a structured object:

```jsonc
{
  "score": 0,            // 0–100 survival score; higher = more durable
  "countdown_years": 0,  // years until AI plausibly handles ≥50% of the role's tasks
  "ai_tools": [],        // named tools already automating parts of the role
  "pivot_steps": [],     // 3–5 concrete actions a human in this role can take now
  "confidence": "low|medium|high",
  "sources_hint": []     // search terms / publication names to check the claim against
}
```

The `score` is a weighted reduction of six dimensions. The `countdown_years` is derived from the score via a fixed mapping (not a separate model output) so the two cannot disagree.

## What we score

**Input:** a free-text job title, slugified and lower-cased before lookup. Synonym collapse (e.g. `sde` → `software engineer`, `attorney` → `lawyer`) happens in the prompt, not in code, and is logged in the response so the user sees what we actually analysed.

**Out of scope by construction:**
- Specific employers or geographies. The score is for the *role*, not for "marketing manager at Acme Corp in Berlin."
- Income forecasts. We do not predict salary changes.
- Personal advice. The pivot steps are role-level prompts, not career counselling.

## The six dimensions

The prompt asks Claude to rate each dimension on a 0–10 integer scale and to write one sentence justifying the rating. The justifications are not shown in the v1 UI but are stored for evals.

| # | Dimension | What 0 means | What 10 means | Weight |
|---|-----------|--------------|---------------|--------|
| 1 | **Task automatability** — what fraction of the role's day-to-day tasks can a current-gen LLM or agent plausibly execute end-to-end? | Almost everything is automatable today | Tasks require irreducibly human input (physical, relational, regulated) | 0.30 |
| 2 | **Tool maturity** — how production-ready are the AI tools that target this role *right now*? | Multiple GA, paid products owned by incumbents | Demos and research papers only | 0.20 |
| 3 | **Adoption velocity** — how fast is the industry actually deploying those tools? | Visible mass adoption in the last 12 months | No detectable adoption signal | 0.15 |
| 4 | **Human-in-the-loop necessity** — does law, safety, trust, or physical presence require a human in the workflow? | None of those apply | All four bind hard | 0.15 |
| 5 | **Differentiation moat** — does the role rest on judgement, relationships, taste, or accountability that resists imitation? | Commoditised, output-graded work | High-context judgement with named accountability | 0.10 |
| 6 | **Labor-market elasticity** — when productivity rises, does demand expand to absorb it, or does headcount shrink? | Demand is fixed; productivity gains cut headcount | Demand is highly elastic; cheaper output grows the market | 0.10 |

Weights sum to 1.00. They are deliberately rough — the goal is a defensible ordering of roles, not a calibrated probability. We will revisit weights after the L1.5 baseline eval if any dimension is consistently uninformative.

## From dimensions to score

```
raw     = Σ (dimension_score_i × weight_i)        // 0.0–10.0
score   = round(raw × 10)                         // 0–100
```

Higher score = more durable role. A score of 80 is "this role still exists in recognisable form a decade from now"; a score of 20 is "the entry-level version of this role is hollowing out this year."

## From score to countdown

`countdown_years` is a deterministic function of `score`, with one band of jitter so two roles with identical scores can render slightly different countdowns:

| Score band | Countdown range (years) |
|------------|------------------------|
| 0–19       | 0.5 – 2.0 |
| 20–39      | 2.0 – 4.0 |
| 40–59      | 4.0 – 7.0 |
| 60–79      | 7.0 – 12.0 |
| 80–100     | 12.0 – 20.0 |

Within a band, the countdown is interpolated linearly on the score and then perturbed by ±5% using a hash of the slug so the value is stable per role across cache evictions. The user-visible string is rounded to one decimal (`"~7.3 years"`).

This banding is intentionally generous on the high end — the product loses credibility if a 30-year-old role gets a one-year countdown — and intentionally tight on the low end — a role scoring under 20 should feel urgent, not academic.

## Confidence

The prompt returns `confidence` as one of `low | medium | high`. The rubric:

- **high** — the role is well-known, has a stable definition, and the AI-tool landscape for it is unambiguous (e.g. `copywriter`, `paralegal`, `customer support representative`).
- **medium** — the role is recognisable but the AI displacement story is still unfolding, OR the title is ambiguous and the prompt had to pick a common interpretation (e.g. `analyst`, `producer`, `consultant`).
- **low** — the title is rare, jargon-heavy, or the model is uncertain whether the inputs match a real occupation. The UI surfaces low-confidence results with a banner and skips share-card generation.

Drivers that *should* drop confidence:
- Slugs that don't map to a recognisable occupation after synonym collapse.
- Roles where the dimension scores conflict sharply (e.g. high task automatability but high HITL necessity) without a clear story for why.
- Sub-fields advancing fast enough that the model's training cutoff matters (e.g. anything inside "AI engineer" itself).

## Disclaimers (rendered in the result UI)

1. **Forecast, not verdict.** The score reflects the AI displacement story as of the model's knowledge cutoff. It is not a prediction of any individual's career trajectory.
2. **No employer specificity.** The score is for the role as commonly understood. A given employer may automate faster or slower than the median.
3. **Bias toward English-language, US/EU tech discourse.** The training data over-represents that conversation. Roles concentrated in other markets may be mis-scored.
4. **Recency bias.** A model released last week tends to read the most-recent AI-tool release as more transformative than it will look in a year. Treat any score within ±10 of another as a tie.
5. **The pivot steps are starting points, not a plan.** Each is a prompt for a 30-minute conversation with a human who knows your situation.

## Versioning

Every change to weights, dimensions, or the score-to-countdown bands bumps a `methodology_version` integer that ships in the result JSON and in the cache key. A version bump invalidates the entire KV cache for that role on next read.

| Version | Date | Change |
|---------|------|--------|
| 1 | 2026-05-09 | Initial six-dimension rubric, weights as above, banded countdown. |
