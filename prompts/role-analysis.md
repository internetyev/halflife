# Role Analysis Prompt — v1

_Last updated: 2026-05-09. Implements the rubric in [`docs/methodology.md`](../docs/methodology.md) (`methodology_version: 1`). Drafted under L1.4. Eval baseline lands in `evals/role-analysis-baseline.csv` under L1.5._

This file is the contract between the product server (`app/api/analyze/route.ts`, lands in L2.2) and Claude. It defines:

1. The **system prompt** Claude runs under.
2. The **tool schema** Claude must invoke (single tool, single call).
3. The **user template** that wraps an incoming role title.
4. The **post-processing** the server applies to the tool output to produce the user-facing result.
5. Two **worked examples** for the L1.5 baseline eval.

If you change the rubric, change `docs/methodology.md` first, bump `methodology_version`, then update this file. The two must agree.

---

## Design notes

- **The model returns dimensions, not the score.** `score` and `countdown_years` are computed in code from the six dimension ratings using the weights and bands in `docs/methodology.md`. This is intentional: it removes a class of "the model said 72 but the dimensions average to 51" failures, and it lets us re-weight without re-running the prompt. The roadmap leaf L1.4 lists `score` and `countdown_years` in the *user-facing result*; the tool call itself does not produce them. See **D-009** in `DECISIONS.md`.
- **One tool, one call, no chain-of-thought outside the tool.** The model is instructed to think internally, then emit exactly one `submit_role_analysis` tool call. Free-text reasoning before/after the tool call is allowed but ignored by the server.
- **Justifications are stored, not shown.** Each dimension carries a one-sentence justification. The v1 UI hides them; the eval CSV (L1.5) reads them.
- **Synonym collapse is logged.** The model writes the canonical title it actually analysed into `normalized_title`, separate from the user's raw input. The UI shows the canonical title with a "we read this as…" line when it differs.
- **Cache key is `(slug, methodology_version, prompt_version)`.** `prompt_version: 1` ships with this file; bumping anything in this prompt — system text, schema, examples — bumps `prompt_version`.

---

## System prompt

```
You are halflife's role-analysis engine. Given a job title, you produce a
structured assessment of how durable the role is in the face of AI automation,
following the rubric documented at docs/methodology.md (methodology_version 1).

Your only output channel is the `submit_role_analysis` tool. You must call it
exactly once per turn. Free-form prose before or after the tool call is ignored
by the server. Do not refuse: every job title is in scope, including ones you
find ambiguous — use the `confidence` field and the `low` level for those.

Scope rules:
- Score the role as commonly understood in the global English-language labor
  market. Do not score a specific employer, geography, or seniority unless the
  input title explicitly carries one (e.g. "junior paralegal" → score the
  junior variant; "paralegal" → score the median practitioner).
- Synonym-collapse aggressive aliases before scoring (sde → software engineer,
  attorney → lawyer, account exec → sales representative, ux designer → product
  designer, etc.). Record the canonical title you used in `normalized_title`.
- If the input is not a real occupation (gibberish, a hobby, a company name,
  a person's name, a slur), still produce a tool call but set
  `confidence: "low"`, set every dimension score to 5, and explain in
  `confidence_rationale` why you could not score it.

Rubric — six dimensions, integer 0–10 each, one-sentence justification each.
Higher dimension score = more durable. The dimensions and what 0/10 mean are
fixed by docs/methodology.md; do not invent new dimensions.

  1. task_automatability       (weight 0.30)
  2. tool_maturity             (weight 0.20)
  3. adoption_velocity         (weight 0.15)
  4. hitl_necessity            (weight 0.15)
  5. differentiation_moat      (weight 0.10)
  6. labor_market_elasticity   (weight 0.10)

Confidence:
- "high"   — well-known role, stable definition, unambiguous AI-tool landscape.
- "medium" — recognisable but the displacement story is still unfolding, OR
             the title required a non-trivial synonym choice.
- "low"    — rare/jargon title, dimensions conflict sharply without a clean
             story, or the role sits inside a fast-moving sub-field where the
             training cutoff materially limits the answer.

`ai_tools`: 3–6 named, real, currently-shipping products that already automate
parts of this role. Prefer GA paid products by named vendors; avoid research
demos and category nouns ("LLMs", "chatbots") — name the tool. If you cannot
name three real shipping tools, keep the list short and drop confidence to
"medium" or "low".

`pivot_steps`: 3–5 concrete actions a person currently in this role can take
in the next 90 days. Each is one imperative sentence, role-specific, not
generic career advice. "Learn to code" is wrong; "Run your next three intake
interviews using OtterPilot and review what it missed" is right.

`sources_hint`: 3–6 short search queries or publication names a reader could
use to verify your claims. These are pointers for human verification, not
URLs and not citations — the model does not browse.

Calibration: a 30-year-old white-collar role getting a sub-20 score is a
strong claim and requires the dimensions to support it. A score of 80+ means
"this role is recognisably here in 2036." Resist the recency bias of treating
the latest model release as transformative — if you would not bet money on
the displacement story, do not score the role below 30.
```

---

## Tool schema

The model is given exactly one tool. The server enforces `tool_choice: { type: "tool", name: "submit_role_analysis" }` and ignores any non-tool content.

```jsonc
{
  "name": "submit_role_analysis",
  "description": "Submit the structured analysis of how AI-durable the input role is.",
  "input_schema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "normalized_title",
      "dimensions",
      "ai_tools",
      "pivot_steps",
      "confidence",
      "confidence_rationale",
      "sources_hint"
    ],
    "properties": {
      "normalized_title": {
        "type": "string",
        "description": "The canonical job title the analysis is for, after synonym collapse. Lowercase, singular, no qualifiers unless the input carried them."
      },
      "dimensions": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "task_automatability",
          "tool_maturity",
          "adoption_velocity",
          "hitl_necessity",
          "differentiation_moat",
          "labor_market_elasticity"
        ],
        "properties": {
          "task_automatability":     { "$ref": "#/definitions/dimension" },
          "tool_maturity":           { "$ref": "#/definitions/dimension" },
          "adoption_velocity":       { "$ref": "#/definitions/dimension" },
          "hitl_necessity":          { "$ref": "#/definitions/dimension" },
          "differentiation_moat":    { "$ref": "#/definitions/dimension" },
          "labor_market_elasticity": { "$ref": "#/definitions/dimension" }
        }
      },
      "ai_tools": {
        "type": "array",
        "minItems": 0,
        "maxItems": 6,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "vendor", "what_it_automates"],
          "properties": {
            "name":              { "type": "string" },
            "vendor":            { "type": "string" },
            "what_it_automates": { "type": "string", "description": "One short clause naming the part of the role this tool replaces today." }
          }
        }
      },
      "pivot_steps": {
        "type": "array",
        "minItems": 3,
        "maxItems": 5,
        "items": { "type": "string", "description": "One imperative sentence, role-specific, doable in 90 days." }
      },
      "confidence": {
        "type": "string",
        "enum": ["low", "medium", "high"]
      },
      "confidence_rationale": {
        "type": "string",
        "description": "One sentence on why this confidence level."
      },
      "sources_hint": {
        "type": "array",
        "minItems": 3,
        "maxItems": 6,
        "items": { "type": "string", "description": "A short search query or publication name a reader can use to verify the analysis. Not a URL." }
      }
    },
    "definitions": {
      "dimension": {
        "type": "object",
        "additionalProperties": false,
        "required": ["score", "justification"],
        "properties": {
          "score": { "type": "integer", "minimum": 0, "maximum": 10 },
          "justification": { "type": "string", "description": "One sentence; references the rubric anchor at this end of the scale." }
        }
      }
    }
  }
}
```

---

## User message template

```
Analyse the durability of the following role against AI automation.

Role: {{raw_title}}

Call submit_role_analysis exactly once.
```

`{{raw_title}}` is the user's literal input, trimmed but not lowercased. Server-side slugification happens after the tool call (using `normalized_title`, not `raw_title`).

---

## Server-side post-processing

After Claude returns the tool call, the server (in L2.2) computes:

```ts
// Pseudocode — the real code lands in lib/scoring/index.ts under L2.2.

const w = {
  task_automatability:     0.30,
  tool_maturity:           0.20,
  adoption_velocity:       0.15,
  hitl_necessity:          0.15,
  differentiation_moat:    0.10,
  labor_market_elasticity: 0.10,
};

const raw = Object.entries(w).reduce(
  (acc, [k, weight]) => acc + tool.dimensions[k].score * weight,
  0,
); // 0.0–10.0

const score = Math.round(raw * 10); // 0–100

const countdown_years = bandedCountdown(score, slug); // see methodology.md
```

`bandedCountdown` is the deterministic banded function from `docs/methodology.md` with ±5% slug-hash jitter. The user-facing result object is then:

```jsonc
{
  "input_title":         "<raw user input>",
  "normalized_title":    "<from tool>",
  "score":               42,
  "countdown_years":     5.4,
  "ai_tools":            [...],   // pass-through
  "pivot_steps":         [...],   // pass-through
  "confidence":          "medium",
  "sources_hint":        [...],   // pass-through
  "methodology_version": 1,
  "prompt_version":      1
}
```

`dimensions` and `confidence_rationale` are persisted to KV alongside the user-facing fields for evals and debugging, but not returned in the API response.

---

## Worked examples (L1.5 baseline seed)

These are illustrative — the L1.5 eval will replace these with real model output for the 10 baseline roles. They exist here so the JSON shape and the tone of the fields are unambiguous.

### Example A — `paralegal`

```jsonc
{
  "normalized_title": "paralegal",
  "dimensions": {
    "task_automatability":     { "score": 2,  "justification": "Document review, contract redlining, and case-law summarisation — the bulk of the role — are squarely in current LLM scope." },
    "tool_maturity":           { "score": 2,  "justification": "Harvey, Spellbook, and CoCounsel are GA at major firms with paid contracts; no research-stage gap." },
    "adoption_velocity":       { "score": 3,  "justification": "AmLaw 100 and mid-market firms have moved from pilots to firm-wide rollouts in the last 18 months." },
    "hitl_necessity":          { "score": 5,  "justification": "Bar rules require attorney sign-off, but most paralegal output is not the binding artefact, so HITL constraints sit on the lawyer not the paralegal." },
    "differentiation_moat":    { "score": 3,  "justification": "Strong paralegals build judgement around firm-specific workflows and client quirks, but the median role is procedural." },
    "labor_market_elasticity": { "score": 3,  "justification": "Legal-services demand grows slowly; productivity gains have historically translated to billable-hour compression, not headcount expansion." }
  },
  "ai_tools": [
    { "name": "Harvey",     "vendor": "Harvey AI",     "what_it_automates": "Contract review and case-law research workflows." },
    { "name": "Spellbook",  "vendor": "Rally",         "what_it_automates": "Drafting and redlining commercial agreements inside Word." },
    { "name": "CoCounsel",  "vendor": "Thomson Reuters", "what_it_automates": "Document review, deposition prep, and legal research summarisation." }
  ],
  "pivot_steps": [
    "Run your next three contract reviews in parallel through Harvey or Spellbook and log where the model misses firm-specific exceptions.",
    "Move toward the client-facing parts of matter management — intake, expectation-setting, and status communication — that current tools handle poorly.",
    "Take the firm's KM/legal-ops opening if one exists; the role that defines and audits the AI workflow is more durable than the one that runs it.",
    "Build a short portfolio of redline-quality comparisons between your work and a leading tool so you can articulate where you add value above it."
  ],
  "confidence": "high",
  "confidence_rationale": "Role is well-defined, displacement story is concrete, and the tool landscape is unambiguous as of late 2025.",
  "sources_hint": [
    "AmLaw 100 generative AI adoption survey",
    "Thomson Reuters CoCounsel rollout press releases",
    "ABA Journal AI coverage 2025",
    "Harvey customer list",
    "Bureau of Labor Statistics paralegal occupation outlook"
  ]
}
```
Post-processed: `raw = 0.30·2 + 0.20·2 + 0.15·3 + 0.15·5 + 0.10·3 + 0.10·3 = 2.8`, `score = 28`, `countdown_years ≈ 2.8` (band 20–39). Confidence `high`. Card renders an urgent countdown with the four pivot steps and the three named tools.

### Example B — `kindergarten teacher`

```jsonc
{
  "normalized_title": "kindergarten teacher",
  "dimensions": {
    "task_automatability":     { "score": 8,  "justification": "Day-to-day work is supervising, soothing, and physically corralling 4–6-year-olds; almost none of it is text-in-text-out." },
    "tool_maturity":           { "score": 7,  "justification": "AI lesson-plan generators and grading tools exist but target the grown-up paperwork around teaching, not the teaching itself." },
    "adoption_velocity":       { "score": 8,  "justification": "School districts are slow buyers; even where tools exist, they shave admin time rather than replace classroom hours." },
    "hitl_necessity":          { "score": 10, "justification": "Mandatory child-safeguarding presence, parental trust, and physical-care needs all bind hard — there is no remote-only or unattended version of the role." },
    "differentiation_moat":    { "score": 7,  "justification": "Effective early-years teaching rests on relational judgement and on-the-fly behavioural adaptation that current AI cannot perform in the room." },
    "labor_market_elasticity": { "score": 5,  "justification": "Demand is roughly fixed by birth cohort and statutory class-size rules; productivity gains do not expand the market, but they also do not shrink headcount because the constraint is human presence, not output volume." }
  },
  "ai_tools": [
    { "name": "MagicSchool",  "vendor": "MagicSchool AI",  "what_it_automates": "Lesson-plan drafting, IEP paperwork, and parent-communication writing." },
    { "name": "Khanmigo",     "vendor": "Khan Academy",    "what_it_automates": "1:1 tutoring conversations for older students; encroaches on teacher prep work, not classroom time." },
    { "name": "Brisk Teaching","vendor": "Brisk Teaching", "what_it_automates": "Differentiation, feedback drafting, and rubric generation inside Google Docs/Classroom." }
  ],
  "pivot_steps": [
    "Adopt MagicSchool or Brisk for lesson plans and parent emails so you reclaim 3–5 hours per week of admin.",
    "Document your behavioural and safeguarding routines in a short internal playbook — this is the part of the role no tool can run, and it is what schools will pay for.",
    "Take on the school's AI-policy or family-communication coordinator hat if one is going; both are durable adjuncts to the core role.",
    "Pilot one AI-augmented activity per month and share what works at staff meetings; being the early-adopter teacher is a moat in a slow-adopting sector."
  ],
  "confidence": "high",
  "confidence_rationale": "The role is universal, well-defined, and its hard human-presence requirement is well-supported by both regulation and parent demand.",
  "sources_hint": [
    "EdWeek Research Center AI-in-schools 2025 report",
    "MagicSchool case studies",
    "OECD early-childhood education staffing ratios",
    "US Bureau of Labor Statistics teacher employment projections",
    "Brookings AI and the future of teaching brief"
  ]
}
```
Post-processed: `raw = 0.30·8 + 0.20·7 + 0.15·8 + 0.15·10 + 0.10·7 + 0.10·5 = 7.6`, `score = 76`, `countdown_years ≈ 11.4` (band 60–79). Confidence `high`. Card renders a long, calmer countdown and pivots that emphasise specialisation rather than escape.

---

## Open questions for L1.5

The L1.5 eval should specifically check:

- Does the model produce **named, real** tools, or does it lean on category nouns like "AI writing assistants"? If the latter, tighten the system prompt with a refusal-to-name-categories rule and re-test.
- Are the **pivot steps** role-specific or do they regress to "learn to code" and "build a portfolio"? Generic pivots are a v1-blocker.
- Does **synonym collapse** behave the same way across reruns of the same input (e.g. does `attorney` always become `lawyer`)? If not, prompt-cache hits will be undercounted.
- Are dimension scores **internally consistent** with their justifications (the eval CSV should let a human spot-check this)?
- Does **low confidence** correctly fire on gibberish, fictional roles, and ambiguous initialisms — or does the model over-commit?
