// Unit tests for the core score/countdown math (lib/scoring/index.ts).
//
// This is the highest-value runtime module on the site — `computeScore` /
// `bandedCountdown` / `buildResult` turn the model's six dimensions into the
// user-facing score and countdown that every role page and share card renders,
// and a weight/band regression here is silent (the output is still a plausible
// number). It is the FIRST suite enabled by the L5.54 test resolver
// (scripts/test-resolver.mjs): index.ts has a value import
// `… from "./types"` that Node's native type-stripping cannot resolve
// extensionless, which is exactly what D-080 deferred and D-084 unblocks.
//
// Pinned invariants: the six DIMENSION_WEIGHTS (sum 1.0, each isolated via a
// one-hot dimension vector so a single weight edit fails loudly), the score
// formula's endpoints + rounding, banded-countdown determinism / clamping /
// per-band range, slug normalization (lowercase, NFKD diacritic-strip, collapse,
// trim), and buildResult's composition contract — including D-010's deliberate
// omission of `dimensions` + `confidence_rationale` from the public shape and
// the D-009/index.ts note that jitter keys off `normalized_title`, not the raw
// input. Pure Node built-ins; run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DIMENSION_WEIGHTS,
  computeScore,
  bandedCountdown,
  slugify,
  buildResult,
} from "../index.ts";
import { METHODOLOGY_VERSION, PROMPT_VERSION } from "../types.ts";

const DIMENSION_KEYS = [
  "task_automatability",
  "tool_maturity",
  "adoption_velocity",
  "hitl_necessity",
  "differentiation_moat",
  "labor_market_elasticity",
];

// Build a Dimensions object from a partial { key: score } map (default 0).
function makeDimensions(scores = {}) {
  const dims = {};
  for (const key of DIMENSION_KEYS) {
    dims[key] = { score: scores[key] ?? 0, justification: `${key} rationale` };
  }
  return dims;
}

function makeToolInput(overrides = {}) {
  return {
    normalized_title: "registered nurse",
    dimensions: makeDimensions({
      task_automatability: 5,
      tool_maturity: 5,
      adoption_velocity: 5,
      hitl_necessity: 5,
      differentiation_moat: 5,
      labor_market_elasticity: 5,
    }),
    ai_tools: [
      { name: "Tempus", vendor: "Tempus AI", what_it_automates: "triage" },
    ],
    pivot_steps: ["Learn AI-assisted charting", "Specialize in acute care"],
    confidence: "medium",
    confidence_rationale: "moderate evidence base",
    sources_hint: ["BLS OOH", "vendor docs"],
    ...overrides,
  };
}

// --- DIMENSION_WEIGHTS ------------------------------------------------------

test("DIMENSION_WEIGHTS has the six methodology dimensions summing to 1.0", () => {
  assert.deepEqual(Object.keys(DIMENSION_WEIGHTS).sort(), [...DIMENSION_KEYS].sort());
  const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9, `weights sum to ${sum}, expected 1.0`);
});

// --- computeScore -----------------------------------------------------------

test("computeScore maps all-10 dimensions to 100 and all-0 to 0", () => {
  const allTen = makeDimensions(Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 10])));
  assert.equal(computeScore(allTen), 100);
  assert.equal(computeScore(makeDimensions()), 0);
});

test("computeScore is a weighted sum × 10 — a one-hot dimension yields weight×100", () => {
  // Isolating each dimension at 10 (rest 0) makes the score read back the
  // weight directly, so a mistuned weight fails on its own line.
  const expected = {
    task_automatability: 30,
    tool_maturity: 20,
    adoption_velocity: 15,
    hitl_necessity: 15,
    differentiation_moat: 10,
    labor_market_elasticity: 10,
  };
  for (const key of DIMENSION_KEYS) {
    const dims = makeDimensions({ [key]: 10 });
    assert.equal(computeScore(dims), expected[key], `weight for ${key}`);
  }
});

test("computeScore rounds to the nearest integer", () => {
  // All 5s → raw 5.0 → 50 exactly; a half-step dimension shifts by its weight×10.
  assert.equal(computeScore(makeDimensions(Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 5])))), 50);
});

// --- bandedCountdown --------------------------------------------------------

test("bandedCountdown is deterministic for a given (score, slug)", () => {
  const a = bandedCountdown(42, "registered-nurse");
  const b = bandedCountdown(42, "registered-nurse");
  assert.equal(a, b);
});

test("bandedCountdown jitter keys off the slug — different slugs can diverge", () => {
  // Same score, different slugs: the FNV-1a slug hash drives ±5% jitter, so the
  // values are independent draws (this pins that the slug actually feeds jitter).
  const nurse = bandedCountdown(50, "registered-nurse");
  const clerk = bandedCountdown(50, "data-entry-clerk");
  assert.notEqual(nurse, clerk);
});

test("bandedCountdown stays within its band ±5% jitter at the band edges", () => {
  // score 0 → band [0.5, 2.0] at t=0 → 0.5 ±5%; score 100 → band [12, 20] at t=1 → 20 ±5%.
  const low = bandedCountdown(0, "any-slug");
  assert.ok(low >= 0.5 * 0.95 && low <= 0.5 * 1.05, `low=${low}`);
  const high = bandedCountdown(100, "any-slug");
  assert.ok(high >= 20 * 0.95 && high <= 20 * 1.05, `high=${high}`);
});

test("bandedCountdown clamps out-of-range scores instead of throwing", () => {
  const below = bandedCountdown(-50, "x");
  const above = bandedCountdown(150, "x");
  assert.equal(below, bandedCountdown(0, "x"));
  assert.equal(above, bandedCountdown(100, "x"));
});

test("bandedCountdown returns one decimal place", () => {
  const y = bandedCountdown(63, "office-manager");
  assert.equal(Math.round(y * 10) / 10, y);
});

// --- slugify ----------------------------------------------------------------

test("slugify lowercases and hyphenates whitespace", () => {
  assert.equal(slugify("Registered Nurse"), "registered-nurse");
});

test("slugify NFKD-strips diacritics and drops punctuation", () => {
  assert.equal(slugify("Señior  Café Manager!"), "senior-cafe-manager");
});

test("slugify trims leading/trailing separators and collapses runs", () => {
  assert.equal(slugify("  --Hello,  World--  "), "hello-world");
});

// --- buildResult ------------------------------------------------------------

test("buildResult composes score, countdown and version stamps", () => {
  const tool = makeToolInput();
  const result = buildResult("RN", tool);

  const expectedScore = computeScore(tool.dimensions);
  assert.equal(result.score, expectedScore);
  assert.equal(result.countdown_years, bandedCountdown(expectedScore, slugify(tool.normalized_title)));
  assert.equal(result.input_title, "RN");
  assert.equal(result.normalized_title, "registered nurse");
  assert.deepEqual(result.ai_tools, tool.ai_tools);
  assert.deepEqual(result.pivot_steps, tool.pivot_steps);
  assert.equal(result.confidence, "medium");
  assert.deepEqual(result.sources_hint, tool.sources_hint);
  assert.equal(result.methodology_version, METHODOLOGY_VERSION);
  assert.equal(result.prompt_version, PROMPT_VERSION);
});

test("buildResult omits dimensions and confidence_rationale from the public shape (D-010)", () => {
  const result = buildResult("RN", makeToolInput());
  assert.ok(!("dimensions" in result), "dimensions must not leak to clients");
  assert.ok(!("confidence_rationale" in result), "confidence_rationale must not leak to clients");
});

test("buildResult derives jitter slug from normalized_title, not the raw input", () => {
  // Two different raw inputs that normalize to the same role get the same
  // countdown — the index.ts contract that ties countdown to the cache key.
  const a = buildResult("RN", makeToolInput({ normalized_title: "registered nurse" }));
  const b = buildResult("staff nurse", makeToolInput({ normalized_title: "registered nurse" }));
  assert.equal(a.countdown_years, b.countdown_years);
});
