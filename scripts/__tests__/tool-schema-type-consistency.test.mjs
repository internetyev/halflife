// Tool-schema ⟺ TypeScript-type consistency guard (L5.97 / D-127).
//
// The load-bearing bridge this pins is the UNCHECKED cast at the bottom of
// `lib/anthropic/role-analysis.ts`:
//
//     return toolUse.input as RoleAnalysisToolInput;   // analyzeRole()
//
// `analyzeRole` hands the model's raw `tool_use.input` straight back to the
// scorer as a `RoleAnalysisToolInput` via an `as` cast. TypeScript NEVER
// verifies that the runtime Anthropic tool schema (`ROLE_ANALYSIS_TOOL`) and
// the interface it is cast to describe the same shape — an `as` assertion is a
// compile-time promise the compiler takes on faith, and the schema is a plain
// JS object literal `tsc` treats as unrelated data. So the two field sets can
// silently diverge:
//
//   1. `lib/anthropic/role-analysis.ts` — `ROLE_ANALYSIS_TOOL.input_schema`,
//      the JSON-Schema the SDK forces the model to satisfy (`required` +
//      `properties`, `additionalProperties: false`). This is what the model is
//      ALLOWED and REQUIRED to return.
//   2. `lib/scoring/types.ts` — `interface RoleAnalysisToolInput` (7 fields),
//      `type DimensionKey` (the 6-name union behind `Dimensions =
//      Record<DimensionKey, Dimension>`), and `interface AiTool` (3 fields).
//      This is what the code THINKS it received and reads off the cast.
//
// The drift, invisible to `next build` / `tsc --noEmit`:
//   (a) THE ADD-TO-TYPE SKEW — a field is added to `RoleAnalysisToolInput`
//       (say a new `salary_band: string`) but not to the schema `required`.
//       The model never returns it, every read of `result.salary_band` is
//       `undefined` at runtime, and the `as` cast reports no error — the
//       compiler believes the field is present because the cast SAID so.
//   (b) THE ADD-TO-SCHEMA SKEW — a field is added to the schema `required` but
//       not to the type. `additionalProperties: false` still lets it through,
//       but the code never reads it: the model spends tokens producing data
//       the scorer discards, again with no build signal.
//   (c) THE RENAME SPLIT — a dimension is renamed in the `DimensionKey` union
//       but not in the schema's `dimensions.required` (or vice-versa), so the
//       model emits `task_automatability` while the scorer's weighted sum keys
//       on the renamed key and reads `NaN` — the exact silent-mis-scoring D-009
//       warns the hand-mirroring can cause.
//
// Why this is a NEW surface, not a dup of `role-analysis.test.mjs`: that suite
// asserts `input_schema.required` equals a HARD-CODED literal list living IN
// that test file — a schema-vs-itself anchor. Nothing there (or anywhere) reads
// `lib/scoring/types.ts` and equates the schema's field set with the interface
// the cast targets. `confidence-level-taxonomy` reads types.ts but only the
// `ConfidenceLevel` union; `dimension-weight` reads `lib/scoring/index.ts`
// weights, never the tool schema's key set. This is the first guard that closes
// the schema ⟺ cast-target loop.
//
// Why IMPORT the schema but TEXT-PARSE the type: `role-analysis.ts`'s only two
// imports are BOTH `import type` (the Anthropic SDK default + the `@/`-aliased
// `RoleAnalysisToolInput`), so Node's type-stripper removes them before
// resolution and `import { ROLE_ANALYSIS_TOOL } from "…/role-analysis.ts"`
// resolves with no bundler — exactly as the sibling `lib/anthropic/__tests__/
// role-analysis.test.mjs` already does. So the schema side is read from the
// AUTHORITATIVE runtime object, not a brittle regex over a nested schema
// literal. The type side CANNOT be imported: interfaces and type-unions are
// erased by type-stripping and never exist at runtime, so `RoleAnalysisToolInput`
// / `DimensionKey` / `AiTool` must be recovered from the TEXT of types.ts.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ROLE_ANALYSIS_TOOL } from "../../lib/anthropic/role-analysis.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

const TYPES_FILE = "lib/scoring/types.ts";
const typesSrc = read(TYPES_FILE);

// Drop-detector anchors: the field counts a coordinated shape change must edit
// here on purpose. If a future version legitimately adds/removes a field, these
// three numbers move in the same commit as the schema + the interface.
const EXPECTED_TOP_FIELDS = 7; // RoleAnalysisToolInput
const EXPECTED_DIMENSIONS = 6; // DimensionKey union
const EXPECTED_AITOOL_FIELDS = 3; // AiTool

// --- text extraction from lib/scoring/types.ts -----------------------------

// Brace-match the body of `export interface <name> { … }` and return the
// top-level (depth-1) member names. Robust to nested object braces even though
// these interfaces are flat today.
function interfaceFields(src, name) {
  const sig = new RegExp(`export interface ${name}\\s*\\{`).exec(src);
  assert.ok(sig, `${TYPES_FILE}: could not find \`export interface ${name}\``);
  const open = sig.index + sig[0].length - 1; // at the `{`
  let depth = 0;
  let body = "";
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      depth++;
      if (depth === 1) continue; // skip the outer brace itself
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        body = src.slice(open + 1, i);
        break;
      }
    }
  }
  assert.ok(body, `${TYPES_FILE}: unbalanced braces in interface ${name}`);
  // A member is `name:` or `name?:` at brace-depth 0 of the body. Track depth
  // so a nested `{ … }` field type never contributes its inner keys.
  const fields = [];
  let d = 0;
  for (const line of body.split("\n")) {
    const before = d;
    for (const ch of line) {
      if (ch === "{") d++;
      else if (ch === "}") d--;
    }
    if (before !== 0) continue; // this line is inside a nested block
    const m = /^\s*(\w+)\s*\??\s*:/.exec(line);
    if (m) fields.push(m[1]);
  }
  return fields;
}

// The `export type <name> = "a" | "b" | …;` union members, lower-cased.
function unionMembers(src, name) {
  const m = new RegExp(`export type ${name}\\s*=\\s*([^;]+);`).exec(src);
  assert.ok(m, `${TYPES_FILE}: could not find \`export type ${name}\``);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((q) => q[1]);
}

const typeTopFields = interfaceFields(typesSrc, "RoleAnalysisToolInput");
const typeDimensionKeys = unionMembers(typesSrc, "DimensionKey");
const typeAiToolFields = interfaceFields(typesSrc, "AiTool");

// --- authoritative runtime schema (imported object) -------------------------

const schema = ROLE_ANALYSIS_TOOL.input_schema;
const dimSchema = schema.properties.dimensions;
const aiToolItems = schema.properties.ai_tools.items;

const setEq = (a, b) =>
  a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

const sorted = (a) => [...a].sort();

// --- 1. vacuous-scan floor --------------------------------------------------
// If any text extraction silently returned `[]` (a regex miss after a refactor)
// every set-equality below could pass for the wrong reason. Pin the counts.
test("type-side extractions are non-empty and match their anchor counts", () => {
  assert.equal(
    typeTopFields.length,
    EXPECTED_TOP_FIELDS,
    `${TYPES_FILE}: RoleAnalysisToolInput has ${typeTopFields.length} fields, expected ${EXPECTED_TOP_FIELDS}: ${JSON.stringify(typeTopFields)}`,
  );
  assert.equal(
    typeDimensionKeys.length,
    EXPECTED_DIMENSIONS,
    `${TYPES_FILE}: DimensionKey has ${typeDimensionKeys.length} members, expected ${EXPECTED_DIMENSIONS}: ${JSON.stringify(typeDimensionKeys)}`,
  );
  assert.equal(
    typeAiToolFields.length,
    EXPECTED_AITOOL_FIELDS,
    `${TYPES_FILE}: AiTool has ${typeAiToolFields.length} fields, expected ${EXPECTED_AITOOL_FIELDS}: ${JSON.stringify(typeAiToolFields)}`,
  );
  // Each set is internally distinct (a duplicated key would let a bad set-equal
  // sneak through the Set-size trick).
  assert.equal(new Set(typeTopFields).size, typeTopFields.length);
  assert.equal(new Set(typeDimensionKeys).size, typeDimensionKeys.length);
  assert.equal(new Set(typeAiToolFields).size, typeAiToolFields.length);
});

// --- 2. schema is self-consistent (required ⟺ properties) -------------------
// `additionalProperties: false` makes `required` the authoritative field set
// only if every required field is declared AND no extra property leaks in. Pin
// required === Object.keys(properties) at all three levels so a half-edit
// (added to `required` but not `properties`) fails here before the cross-check.
test("schema required set equals its properties keys at every level", () => {
  assert.equal(schema.additionalProperties, false, "top-level schema must be closed");
  assert.ok(
    setEq(schema.required, Object.keys(schema.properties)),
    `top-level required ${JSON.stringify(sorted(schema.required))} != properties ${JSON.stringify(sorted(Object.keys(schema.properties)))}`,
  );

  assert.equal(dimSchema.additionalProperties, false, "dimensions must be closed");
  assert.ok(
    setEq(dimSchema.required, Object.keys(dimSchema.properties)),
    `dimensions required ${JSON.stringify(sorted(dimSchema.required))} != properties ${JSON.stringify(sorted(Object.keys(dimSchema.properties)))}`,
  );

  assert.equal(aiToolItems.additionalProperties, false, "ai_tools item must be closed");
  assert.ok(
    setEq(aiToolItems.required, Object.keys(aiToolItems.properties)),
    `ai_tools.item required ${JSON.stringify(sorted(aiToolItems.required))} != properties ${JSON.stringify(sorted(Object.keys(aiToolItems.properties)))}`,
  );
});

// --- 3. THE bridge: schema field set === RoleAnalysisToolInput --------------
test("input_schema.required equals the RoleAnalysisToolInput field set", () => {
  assert.ok(
    setEq(schema.required, typeTopFields),
    `the tool the model must satisfy and the type analyzeRole casts to have diverged — ` +
      `schema.required ${JSON.stringify(sorted(schema.required))} != ` +
      `RoleAnalysisToolInput ${JSON.stringify(sorted(typeTopFields))}. ` +
      `The \`as RoleAnalysisToolInput\` cast in role-analysis.ts would silently mis-shape the result.`,
  );
});

// --- 4. the six dimensions: schema `dimensions.required` === DimensionKey ---
test("dimensions.required equals the DimensionKey union members", () => {
  assert.ok(
    setEq(dimSchema.required, typeDimensionKeys),
    `dimensions.required ${JSON.stringify(sorted(dimSchema.required))} != ` +
      `DimensionKey ${JSON.stringify(sorted(typeDimensionKeys))} — a renamed dimension ` +
      `would make the weighted score read NaN on the missing key (D-009).`,
  );
});

// --- 5. the ai_tools item: schema item.required === AiTool field set --------
test("ai_tools.items.required equals the AiTool field set", () => {
  assert.ok(
    setEq(aiToolItems.required, typeAiToolFields),
    `ai_tools.items.required ${JSON.stringify(sorted(aiToolItems.required))} != ` +
      `AiTool ${JSON.stringify(sorted(typeAiToolFields))}.`,
  );
});
