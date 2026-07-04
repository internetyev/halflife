// Confidence-level taxonomy consistency guard: the three-level confidence
// vocabulary `{low, medium, high}` is HAND-RESTATED across four surfaces with
// different jobs, and nothing pinned them to one set until now:
//
//   1. `lib/scoring/types.ts` — `type ConfidenceLevel = "low" | "medium" | "high"`,
//      the TypeScript union every downstream consumer is typed against.
//   2. `lib/anthropic/role-analysis.ts` — the tool-use JSON schema's
//      `confidence: { enum: ["low", "medium", "high"] }`, the RUNTIME constraint
//      the model's output is validated against (what the API can actually return).
//   3. `prompts/role-analysis.md` — the published prompt's mirror of that schema
//      (`"confidence": { "enum": ["low", "medium", "high"] }`).
//   4. `components/result-card.tsx` — `CONFIDENCE_COPY: Record<ConfidenceLevel,
//      string>`, the per-level tooltip the result card renders via
//      `CONFIDENCE_COPY[result.confidence]`, plus the `result.confidence === "low"`
//      literal that fires the low-confidence banner.
//
// **Why this is a genuinely NEW surface, not the L5.53 role-analysis suite:** that
// suite pins the tool SCHEMA enum ↔ the prompt doc (surfaces 2↔3, and asserts the
// enum literal is `["low","medium","high"]`). It never reads the `ConfidenceLevel`
// TS union or the result-card `CONFIDENCE_COPY` — the two DOWNSTREAM consumers. So
// the schema↔type↔UI half of the contract was unguarded.
//
// **The load-bearing drift, invisible to `next build` / `tsc --noEmit`:** the tool
// schema's `enum` array is a plain `string[]` — TypeScript does NOT narrow it to
// the `ConfidenceLevel` union, so the union and the runtime enum can silently
// diverge. Add a fourth level (`"very-low"`) to the schema `enum` + the prompt so
// the model can now return it, but forget the `ConfidenceLevel` union → the model
// emits `confidence: "very-low"`, `CONFIDENCE_COPY["very-low"]` is `undefined` at
// runtime (the card renders a blank tooltip), and `tsc` stays fully green because
// nothing ties the enum array to the union. Or rename a level in the union but not
// the schema → same undefined-tooltip footgun in the other direction. And if the
// `"low"` string the banner keys on ever drifts from the taxonomy, the
// low-confidence warning silently never fires.
//
// TypeScript's `Record<ConfidenceLevel, string>` DOES pin the CONFIDENCE_COPY keys
// to the union at compile time — but that is exactly why the runtime enum (which
// tsc leaves as `string[]`) is the load-bearing gap, and this guard runs in CI
// without a tsc step anyway (same D-080 wall).
//
// **Why a text guard:** same D-080 wall as the L5.57–L5.85 arc — `types.ts` and
// `role-analysis.ts` value-import `@anthropic-ai/sdk` / `@/`-aliased modules the
// bare `.mjs` loader can't resolve and that aren't installed for the runner, and
// the prompt is Markdown — so it reads each source as TEXT and extracts the level
// set with string-scoped regexes.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

const TYPES_FILE = "lib/scoring/types.ts";
const SCHEMA_FILE = "lib/anthropic/role-analysis.ts";
const PROMPT_FILE = "prompts/role-analysis.md";
const CARD_FILE = "components/result-card.tsx";

// The canonical taxonomy — the anchor a coordinated rename must edit deliberately.
const CANONICAL = ["low", "medium", "high"];

// Pull every double-quoted token out of a fragment, lower-cased.
function quoted(fragment) {
  return [...fragment.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
}

// 1. The `ConfidenceLevel` union: `"low" | "medium" | "high"` up to the `;`.
function typeUnionLevels(src) {
  const m = /export type ConfidenceLevel\s*=\s*([^;]+);/.exec(src);
  assert.ok(m, `could not find the ConfidenceLevel union in ${TYPES_FILE}`);
  return quoted(m[1]);
}

// 2/3. The `confidence` field's `enum: [...]` — scoped to the confidence object
// (non-greedy stop at the first `]`) so `confidence_rationale` (no enum) and any
// other enum in the schema are never captured.
function enumLevels(src, key, file) {
  const m = new RegExp(
    `"?${key}"?\\s*:\\s*\\{[^}]*?"?enum"?\\s*:\\s*\\[([^\\]]*)\\]`,
  ).exec(src);
  assert.ok(m, `could not find a ${key} enum in ${file}`);
  return quoted(m[1]);
}

// 4. The keys of the `CONFIDENCE_COPY: Record<ConfidenceLevel, string>` object.
// Brace-match the object body from the `{` after the annotation, then read the
// `<key>:` at the top of each entry.
function copyMapBody(src) {
  const sig =
    /const CONFIDENCE_COPY\s*:\s*Record<\s*ConfidenceLevel\s*,\s*string\s*>\s*=\s*\{/.exec(
      src,
    );
  assert.ok(sig, `could not find CONFIDENCE_COPY in ${CARD_FILE}`);
  let depth = 0;
  const start = sig.index + sig[0].length - 1; // at the opening `{`
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail(`unbalanced braces in CONFIDENCE_COPY of ${CARD_FILE}`);
}

function copyMap(src) {
  const body = copyMapBody(src);
  const keys = [...body.matchAll(/(\w+)\s*:\s*"/g)].map((m) => m[1].toLowerCase());
  const values = [...body.matchAll(/\w+\s*:\s*"([^"]*)"/g)].map((m) => m[1]);
  return { keys, values };
}

// The magic string literal the low-confidence banner keys on.
function bannerLiteral(src) {
  const m = /result\.confidence\s*===\s*"([^"]+)"/.exec(src);
  assert.ok(m, `could not find the low-confidence banner literal in ${CARD_FILE}`);
  return m[1].toLowerCase();
}

const typesSrc = read(TYPES_FILE);
const schemaSrc = read(SCHEMA_FILE);
const promptSrc = read(PROMPT_FILE);
const cardSrc = read(CARD_FILE);

const union = typeUnionLevels(typesSrc);
const schemaEnum = enumLevels(schemaSrc, "confidence", SCHEMA_FILE);
const promptEnum = enumLevels(promptSrc, "confidence", PROMPT_FILE);
const copy = copyMap(cardSrc);
const banner = bannerLiteral(cardSrc);

const asSet = (a) => new Set(a);
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

test("every taxonomy surface parsed to a non-empty level set (vacuous-parse guard)", () => {
  // If any extraction silently returned [] the set-equality checks below would
  // compare ∅ vs ∅ and pass trivially. Anchor each surface to ≥3 members.
  for (const [name, levels] of [
    ["ConfidenceLevel union", union],
    ["schema confidence enum", schemaEnum],
    ["prompt confidence enum", promptEnum],
    ["CONFIDENCE_COPY keys", copy.keys],
  ]) {
    assert.ok(
      levels.length >= 3,
      `${name}: expected ≥3 confidence levels, got ${JSON.stringify(levels)}`,
    );
  }
  assert.ok(banner.length > 0, "the low-confidence banner literal is empty");
});

test("the ConfidenceLevel union equals the runtime tool-schema enum (the load-bearing tie)", () => {
  // Nothing in the type system pins the schema's `string[]` enum to the union —
  // this is the drift `tsc --noEmit` cannot see.
  assert.ok(
    setEq(asSet(union), asSet(schemaEnum)),
    `ConfidenceLevel union ${JSON.stringify(union)} must equal the tool-schema ` +
      `confidence enum ${JSON.stringify(schemaEnum)} — else the model can return a ` +
      `level the UI has no copy for (undefined tooltip) while the build stays green.`,
  );
});

test("the tool-schema enum equals the published prompt-doc enum", () => {
  assert.ok(
    setEq(asSet(schemaEnum), asSet(promptEnum)),
    `the tool-schema confidence enum ${JSON.stringify(schemaEnum)} must equal the ` +
      `prompt doc's ${JSON.stringify(promptEnum)} — the runtime constraint and the ` +
      `published prompt must offer the same levels.`,
  );
});

test("CONFIDENCE_COPY covers exactly the ConfidenceLevel union (every renderable level has copy)", () => {
  assert.ok(
    setEq(asSet(copy.keys), asSet(union)),
    `CONFIDENCE_COPY keys ${JSON.stringify(copy.keys)} must equal the ConfidenceLevel ` +
      `union ${JSON.stringify(union)} — a missing key renders CONFIDENCE_COPY[level] ` +
      `as undefined; an extra key is dead copy.`,
  );
});

test("the shared taxonomy is exactly {low, medium, high} and the banner keys on a real level", () => {
  // Anchor (drop-detector): a fully-coordinated rename across all four surfaces
  // stays a deliberate, test-visible edit rather than silently redefining the
  // product's confidence vocabulary.
  assert.ok(
    setEq(asSet(union), asSet(CANONICAL)),
    `the confidence taxonomy ${JSON.stringify([...asSet(union)])} drifted from the ` +
      `canonical ${JSON.stringify(CANONICAL)} — update CANONICAL only alongside a ` +
      `deliberate taxonomy change.`,
  );
  // The low-confidence banner literal must be one of the real levels, so the
  // warning can actually fire.
  assert.ok(
    asSet(union).has(banner),
    `the low-confidence banner keys on "${banner}", which is not a confidence level ` +
      `in ${JSON.stringify(union)} — the banner would never fire.`,
  );
  assert.equal(banner, "low", `the banner should fire on "low", not "${banner}"`);
});

test("each surface's levels are distinct + lowercase and every copy string is non-empty (no vacuous collapse)", () => {
  for (const [name, levels] of [
    ["ConfidenceLevel union", union],
    ["schema confidence enum", schemaEnum],
    ["prompt confidence enum", promptEnum],
    ["CONFIDENCE_COPY keys", copy.keys],
  ]) {
    assert.equal(
      new Set(levels).size,
      levels.length,
      `${name}: levels are not all distinct (${JSON.stringify(levels)}) — a dup could ` +
        `let a set-equality check pass for the wrong reason.`,
    );
    for (const lv of levels) {
      assert.match(lv, /^[a-z]+$/, `${name}: level "${lv}" is not a bare lowercase word`);
    }
  }
  // Each level's tooltip is present and distinct, so no level renders a blank or
  // duplicated explanation.
  assert.equal(copy.values.length, copy.keys.length, "CONFIDENCE_COPY key/value count skew");
  assert.ok(copy.values.every((v) => v.trim().length > 0), "a CONFIDENCE_COPY value is empty");
  assert.equal(
    new Set(copy.values).size,
    copy.values.length,
    `CONFIDENCE_COPY values are not all distinct: ${JSON.stringify(copy.values)}`,
  );
});
