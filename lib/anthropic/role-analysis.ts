// v1 prompt + tool schema, mirrored from prompts/role-analysis.md as runtime
// constants so the API route does not parse markdown. If you change either
// file, change both — see D-009. A change here bumps `prompt_version` in
// lib/scoring/types.ts.
//
// The schema below is the JSON-Schema fragment from prompts/role-analysis.md,
// inlined (no $ref / definitions) because the Anthropic SDK's tool schema
// validation is intolerant of $ref. The shape is otherwise identical.

import type Anthropic from "@anthropic-ai/sdk";

import type { RoleAnalysisToolInput } from "@/lib/scoring/types";

export const ROLE_ANALYSIS_TOOL_NAME = "submit_role_analysis" as const;

// Sonnet 4.6 — pinned in D-012/D-016. Lives next to the prompt and tool
// schema (rather than in the route) so a model bump and a prompt edit are
// reviewed together; cache keys compose methodology_version × prompt_version
// and a stray env var should not silently swap the production model.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
// Deterministic sampling. The SDK default is 1.0; the L1.5b eval procedure
// (evals/README.md Path A step 1) reproduces this call at temperature 0, so an
// implicit default would make the eval baseline predict a call production never
// makes. Set explicitly and guarded — D-130.
const TEMPERATURE = 0;

type ToolDefinition = Anthropic.Messages.Tool;

export const ROLE_ANALYSIS_SYSTEM_PROMPT = `You are halflife's role-analysis engine. Given a job title, you produce a
structured assessment of how durable the role is in the face of AI automation,
following the rubric documented at docs/methodology.md (methodology_version 1).

Your only output channel is the \`submit_role_analysis\` tool. You must call it
exactly once per turn. Free-form prose before or after the tool call is ignored
by the server. Do not refuse: every job title is in scope, including ones you
find ambiguous — use the \`confidence\` field and the \`low\` level for those.

Scope rules:
- Score the role as commonly understood in the global English-language labor
  market. Do not score a specific employer, geography, or seniority unless the
  input title explicitly carries one (e.g. "junior paralegal" → score the
  junior variant; "paralegal" → score the median practitioner).
- Synonym-collapse aggressive aliases before scoring (sde → software engineer,
  attorney → lawyer, account exec → sales representative, ux designer → product
  designer, etc.). Record the canonical title you used in \`normalized_title\`.
- If the input is not a real occupation (gibberish, a hobby, a company name,
  a person's name, a slur), still produce a tool call but set
  \`confidence: "low"\`, set every dimension score to 5, and explain in
  \`confidence_rationale\` why you could not score it.

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

\`ai_tools\`: 3–6 named, real, currently-shipping products that already automate
parts of this role. Prefer GA paid products by named vendors; avoid research
demos and category nouns ("LLMs", "chatbots") — name the tool. If you cannot
name three real shipping tools, keep the list short and drop confidence to
"medium" or "low".

\`pivot_steps\`: 3–5 concrete actions a person currently in this role can take
in the next 90 days. Each is one imperative sentence, role-specific, not
generic career advice. "Learn to code" is wrong; "Run your next three intake
interviews using OtterPilot and review what it missed" is right.

\`sources_hint\`: 3–6 short search queries or publication names a reader could
use to verify your claims. These are pointers for human verification, not
URLs and not citations — the model does not browse.

Calibration: a 30-year-old white-collar role getting a sub-20 score is a
strong claim and requires the dimensions to support it. A score of 80+ means
"this role is recognisably here in 2036." Resist the recency bias of treating
the latest model release as transformative — if you would not bet money on
the displacement story, do not score the role below 30.`;

const dimensionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "justification"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 10 },
    justification: {
      type: "string",
      description:
        "One sentence; references the rubric anchor at this end of the scale.",
    },
  },
} as const;

export const ROLE_ANALYSIS_TOOL: ToolDefinition = {
  name: ROLE_ANALYSIS_TOOL_NAME,
  description:
    "Submit the structured analysis of how AI-durable the input role is.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "normalized_title",
      "dimensions",
      "ai_tools",
      "pivot_steps",
      "confidence",
      "confidence_rationale",
      "sources_hint",
    ],
    properties: {
      normalized_title: {
        type: "string",
        description:
          "The canonical job title the analysis is for, after synonym collapse. Lowercase, singular, no qualifiers unless the input carried them.",
      },
      dimensions: {
        type: "object",
        additionalProperties: false,
        required: [
          "task_automatability",
          "tool_maturity",
          "adoption_velocity",
          "hitl_necessity",
          "differentiation_moat",
          "labor_market_elasticity",
        ],
        properties: {
          task_automatability: dimensionSchema,
          tool_maturity: dimensionSchema,
          adoption_velocity: dimensionSchema,
          hitl_necessity: dimensionSchema,
          differentiation_moat: dimensionSchema,
          labor_market_elasticity: dimensionSchema,
        },
      },
      ai_tools: {
        type: "array",
        minItems: 0,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "vendor", "what_it_automates"],
          properties: {
            name: { type: "string" },
            vendor: { type: "string" },
            what_it_automates: {
              type: "string",
              description:
                "One short clause naming the part of the role this tool replaces today.",
            },
          },
        },
      },
      pivot_steps: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "string",
          description:
            "One imperative sentence, role-specific, doable in 90 days.",
        },
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      confidence_rationale: {
        type: "string",
        description: "One sentence on why this confidence level.",
      },
      sources_hint: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: {
          type: "string",
          description:
            "A short search query or publication name a reader can use to verify the analysis. Not a URL.",
        },
      },
    },
  },
};

export function buildUserMessage(rawTitle: string): string {
  return `Analyse the durability of the following role against AI automation.

Role: ${rawTitle}

Call submit_role_analysis exactly once.`;
}

// Thrown when the model returns no `submit_role_analysis` tool_use block,
// despite tool_choice forcing it. Distinguished from network/upstream errors
// so the route can map it to a 502 with a stable message.
export class RoleAnalysisToolMissingError extends Error {
  constructor() {
    super("Model did not invoke the submit_role_analysis tool.");
    this.name = "RoleAnalysisToolMissingError";
  }
}

// One forced tool-use call against Claude. Returns the model's tool input
// verbatim — score derivation and response shaping happen in lib/scoring.
// Caller owns the Anthropic client (so tests / scripts can inject one) and
// owns retry / backoff (the route does neither today).
export async function analyzeRole(
  client: Anthropic,
  rawTitle: string,
): Promise<RoleAnalysisToolInput> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: [
      {
        type: "text",
        text: ROLE_ANALYSIS_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        ...ROLE_ANALYSIS_TOOL,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: ROLE_ANALYSIS_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: buildUserMessage(rawTitle),
      },
    ],
  });

  const toolUse = response.content.find(
    (block) =>
      block.type === "tool_use" && block.name === ROLE_ANALYSIS_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new RoleAnalysisToolMissingError();
  }
  return toolUse.input as RoleAnalysisToolInput;
}
