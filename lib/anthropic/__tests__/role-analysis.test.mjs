// Unit tests for the v1 prompt + tool schema (lib/anthropic/role-analysis.ts).
//
// Fourth lib/ suite (after L5.50 plausible, L5.51 json-ld, L5.52 capture),
// picked up by the L5.50 `lib/**/__tests__/*.test.mjs` glob. role-analysis.ts
// is cleanly testable for the same reason as json-ld.ts: BOTH its imports are
// `import type` (Anthropic default + `@/lib/scoring/types`), so Node's
// type-stripper removes them before resolution — the extensionless `@/` alias
// never reaches the loader (the D-080 wall that still defers lib/scoring/index.ts,
// which imports VALUE constants from "./types"). So `import … from
// "../role-analysis.ts"` resolves with no TS loader and no source churn.
//
// The load-bearing invariant is D-009: this file is hand-mirrored from
// prompts/role-analysis.md and the weights in lib/scoring/index.ts, with no
// runtime cross-check. These tests pin the parts a drift would silently break:
// the six dimension keys + their docs/methodology weights named in the system
// prompt, the tool schema's `required`/bounds (pivot_steps 3–5, sources_hint
// 3–6, ai_tools 0–6, dimension score integer 0–10, additionalProperties:false),
// the forced-tool name shared with the tool_choice, and the user-message shape.
// A stubbed client also exercises analyzeRole's happy path + the
// RoleAnalysisToolMissingError branch without any network call.
//
// Run via `npm test`. Pure Node built-ins, no npm install — identical on the
// routine laptop and CI.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROLE_ANALYSIS_TOOL_NAME,
  ROLE_ANALYSIS_SYSTEM_PROMPT,
  ROLE_ANALYSIS_TOOL,
  buildUserMessage,
  analyzeRole,
  RoleAnalysisToolMissingError,
} from "../role-analysis.ts";

// The six dimensions, in the canonical order, with the docs/methodology.md v1
// weights. Kept here so a drift in either the prompt text or the tool schema's
// `required` list against the documented rubric fails a test.
const DIMENSIONS = [
  ["task_automatability", "0.30"],
  ["tool_maturity", "0.20"],
  ["adoption_velocity", "0.15"],
  ["hitl_necessity", "0.15"],
  ["differentiation_moat", "0.10"],
  ["labor_market_elasticity", "0.10"],
];

test("ROLE_ANALYSIS_TOOL_NAME is the stable forced-tool name", () => {
  assert.equal(ROLE_ANALYSIS_TOOL_NAME, "submit_role_analysis");
  // The tool definition must advertise that exact name — the route forces it
  // via tool_choice, so a mismatch would never trigger the tool.
  assert.equal(ROLE_ANALYSIS_TOOL.name, ROLE_ANALYSIS_TOOL_NAME);
});

test("system prompt routes all output through the tool and names the rubric", () => {
  const p = ROLE_ANALYSIS_SYSTEM_PROMPT;
  assert.ok(p.length > 0);
  // Output channel + once-per-turn contract that analyzeRole relies on.
  assert.match(p, /submit_role_analysis/);
  assert.match(p, /exactly once/);
  // methodology_version 1 anchor (D-009 keeps this in sync with types.ts).
  assert.match(p, /methodology_version 1/);
  // Every dimension is named with its weight, in the prompt's numbered rubric.
  for (const [key, weight] of DIMENSIONS) {
    assert.match(p, new RegExp(key), `prompt names ${key}`);
    assert.match(p, new RegExp(`weight ${weight}`), `prompt weights ${key}`);
  }
});

test("tool input_schema requires the full v1 result shape", () => {
  const schema = ROLE_ANALYSIS_TOOL.input_schema;
  assert.equal(schema.type, "object");
  // No extra keys: the model cannot smuggle un-typed fields past the SDK.
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "normalized_title",
    "dimensions",
    "ai_tools",
    "pivot_steps",
    "confidence",
    "confidence_rationale",
    "sources_hint",
  ]);
});

test("dimensions sub-schema requires exactly the six rubric keys, each 0–10", () => {
  const dims = ROLE_ANALYSIS_TOOL.input_schema.properties.dimensions;
  assert.equal(dims.additionalProperties, false);
  assert.deepEqual(
    dims.required,
    DIMENSIONS.map(([key]) => key),
  );
  // Each dimension is the shared {score, justification} schema; score is a
  // clamped integer so computeScore's weighted sum stays in [0,100].
  for (const [key] of DIMENSIONS) {
    const d = dims.properties[key];
    assert.deepEqual(d.required, ["score", "justification"]);
    assert.equal(d.properties.score.type, "integer");
    assert.equal(d.properties.score.minimum, 0);
    assert.equal(d.properties.score.maximum, 10);
  }
});

test("array fields carry the methodology bounds", () => {
  const props = ROLE_ANALYSIS_TOOL.input_schema.properties;
  // ai_tools: 0–6 (may be empty when fewer than 3 real tools exist).
  assert.equal(props.ai_tools.minItems, 0);
  assert.equal(props.ai_tools.maxItems, 6);
  // pivot_steps: 3–5 concrete actions.
  assert.equal(props.pivot_steps.minItems, 3);
  assert.equal(props.pivot_steps.maxItems, 5);
  // sources_hint: 3–6 verification pointers.
  assert.equal(props.sources_hint.minItems, 3);
  assert.equal(props.sources_hint.maxItems, 6);
  // confidence is the three-level enum used everywhere downstream.
  assert.deepEqual(props.confidence.enum, ["low", "medium", "high"]);
});

test("buildUserMessage interpolates the raw title and forces one tool call", () => {
  const msg = buildUserMessage("registered nurse");
  assert.match(msg, /Role: registered nurse/);
  assert.match(msg, /Call submit_role_analysis exactly once\./);
  // The raw title is passed through verbatim (normalization is the model's job).
  const odd = buildUserMessage("SDE II @ BigCo");
  assert.match(odd, /Role: SDE II @ BigCo/);
});

test("analyzeRole returns the tool input verbatim from a forced tool_use", async () => {
  const toolInput = { normalized_title: "lawyer", confidence: "high" };
  let captured;
  const client = {
    messages: {
      create: async (args) => {
        captured = args;
        return {
          content: [
            { type: "text", text: "ignored prose" },
            {
              type: "tool_use",
              name: ROLE_ANALYSIS_TOOL_NAME,
              input: toolInput,
            },
          ],
        };
      },
    },
  };

  const out = await analyzeRole(client, "attorney");
  assert.equal(out, toolInput);
  // The call forces the tool and routes the raw title through buildUserMessage.
  assert.deepEqual(captured.tool_choice, {
    type: "tool",
    name: ROLE_ANALYSIS_TOOL_NAME,
  });
  assert.match(captured.messages[0].content, /Role: attorney/);
});

test("analyzeRole throws RoleAnalysisToolMissingError when no tool_use block", async () => {
  const client = {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: "I refuse." }],
      }),
    },
  };

  await assert.rejects(
    () => analyzeRole(client, "paralegal"),
    (err) => {
      assert.ok(err instanceof RoleAnalysisToolMissingError);
      assert.ok(err instanceof Error);
      assert.equal(err.name, "RoleAnalysisToolMissingError");
      return true;
    },
  );
});
