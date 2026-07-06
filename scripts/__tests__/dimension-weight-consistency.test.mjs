// Dimension-weight consistency guard: the six per-dimension scoring weights are
// the load-bearing core of the whole product — `computeScore` in
// `lib/scoring/index.ts` folds them over the model's 0–10 dimension scores to
// produce the one number (`score`, then `countdown_years`) the site is built
// around. That weight vector is written down THREE times, by hand, in three
// different notations:
//
//   1. `lib/scoring/index.ts` — the executable truth: the `DIMENSION_WEIGHTS`
//      object literal (`task_automatability: 0.3, tool_maturity: 0.2, ...`).
//   2. `docs/methodology.md` — the PUBLIC contract: the "six dimensions" table's
//      trailing `Weight` column (`| 1 | **Task automatability** … | 0.30 |`),
//      plus the prose promise "Weights sum to 1.00".
//   3. `prompts/role-analysis.md` — the model-facing rubric: the numbered list
//      `1. task_automatability       (weight 0.30)`.
//
// The `index.ts` header literally says it "Matches docs/methodology.md v1 and the
// post-processing pseudocode in prompts/role-analysis.md" — this test pins that
// claim so the three copies cannot silently drift apart.
//
// What's pinned: (a) the six weights, compared BY POSITION across all three
// sources (dimension #1's weight in the code == row 1's weight in the doc ==
// list item 1's weight in the prompt), normalising notation so `0.3` (code) and
// `0.30` (doc/prompt) compare equal; (b) the six snake_case dimension KEYS are
// identical and in the same order in the code and the prompt (the doc uses prose
// names, so it is matched positionally, not by key); (c) the code weights sum to
// 1.00 AND the methodology doc still prints its "Weights sum to 1.00" promise.
//
// The drift it pins is a silent, build-green corruption of the product's meaning.
// `next build` / `tsc --noEmit` never relate a TypeScript number literal to a
// Markdown table cell in another file to a numbered list in a third, so any of
// these slips through green:
//   • A weight is re-tuned in `DIMENSION_WEIGHTS` (e.g. `task_automatability`
//     0.3 → 0.35 to "weight automation harder") but the doc and prompt keep
//     0.30 → the PUBLISHED methodology now lies about how every role is scored,
//     and the model is being rubric'd on a weighting the code no longer uses.
//   • A dimension is renamed/reordered in the code but not the prompt (or vice
//     versa) → the by-position weight mapping shears and the model's rubric no
//     longer lines up with the math folding its outputs.
//   • The weights stop summing to 1.00 (a re-tune forgets to rebalance) while the
//     doc still promises they do → scores silently rescale off the 0–100 range
//     the countdown bands assume.
//
// Why this is a NEW surface: no existing guard reads `DIMENSION_WEIGHTS` at all.
// The score-band-taxonomy guard (D-019) pins the score→BAND label/colour split
// across the two card renderers; the cache-key / countdown guards pin the
// score→YEARS band table. This one owns the upstream weight vector that produces
// the score in the first place — a distinct code↔doc↔prompt invariant.
//
// Why a text guard, not an import: the D-080 wall — `lib/scoring/index.ts`
// value-imports from `./types` and is consumed through `@/`-aliased paths the
// bare `.mjs` loader can't resolve, and the other two sources are Markdown — so
// this reads all three as TEXT and extracts the weight/key sequences with
// regexes.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CODE_FILE = "lib/scoring/index.ts";
const DOC_FILE = "docs/methodology.md";
const PROMPT_FILE = "prompts/role-analysis.md";

const codeSrc = readFileSync(join(REPO_ROOT, CODE_FILE), "utf8");
const docSrc = readFileSync(join(REPO_ROOT, DOC_FILE), "utf8");
const promptSrc = readFileSync(join(REPO_ROOT, PROMPT_FILE), "utf8");

const EXPECTED_COUNT = 6;

// Normalise a parsed weight to 4 decimals so `0.3` (code) and `0.30`
// (doc/prompt) — and any float-repr noise — compare equal.
const norm = (w) => Math.round(Number(w) * 10000) / 10000;

// --- Source 1: the `DIMENSION_WEIGHTS` object literal in index.ts ------------
// Slice the object body (no nested braces) and pull ordered `key: number` pairs.
function codeWeights() {
  const block = /DIMENSION_WEIGHTS\s*:[^=]*=\s*\{([^}]*)\}/.exec(codeSrc);
  assert.ok(block, `could not find the DIMENSION_WEIGHTS object in ${CODE_FILE}`);
  return [...block[1].matchAll(/([a-z_]+)\s*:\s*([\d.]+)\s*,/g)].map((m) => ({
    key: m[1],
    weight: norm(m[2]),
  }));
}

// --- Source 2: the six-dimension table in methodology.md ---------------------
// Each data row starts with `| <n> |` and ends with the Weight cell `| 0.NN |`.
// Anchoring the capture to end-of-line takes the TRAILING numeric cell, immune
// to any digits that might appear in the prose columns between. Rows of the
// unrelated countdown table (`| 0–19 | … |`) don't match — their first cell is
// `0–19`, not a bare digit followed by a pipe.
function docWeights() {
  return [...docSrc.matchAll(/^\|\s*(\d+)\s*\|.*\|\s*([\d.]+)\s*\|\s*$/gm)].map(
    (m) => ({ row: Number(m[1]), weight: norm(m[2]) }),
  );
}

// --- Source 3: the numbered rubric list in role-analysis.md ------------------
// `  1. task_automatability       (weight 0.30)`
function promptWeights() {
  return [
    ...promptSrc.matchAll(/^\s*\d+\.\s+([a-z_]+)\s+\(weight\s+([\d.]+)\)/gm),
  ].map((m) => ({ key: m[1], weight: norm(m[2]) }));
}

const code = codeWeights();
const doc = docWeights();
const prompt = promptWeights();

test("all three weight sources parsed to six entries (vacuous-scan guard)", () => {
  // If any extraction silently returned [] or a short list, the by-position
  // comparisons below would pass trivially (or compare mismatched lengths).
  // Anchor the count first.
  assert.equal(code.length, EXPECTED_COUNT, `${CODE_FILE}: expected ${EXPECTED_COUNT} weights, got ${code.length} (${JSON.stringify(code)})`);
  assert.equal(doc.length, EXPECTED_COUNT, `${DOC_FILE}: expected ${EXPECTED_COUNT} weight rows, got ${doc.length} (${JSON.stringify(doc)})`);
  assert.equal(prompt.length, EXPECTED_COUNT, `${PROMPT_FILE}: expected ${EXPECTED_COUNT} rubric weights, got ${prompt.length} (${JSON.stringify(prompt)})`);

  // The doc rows must be numbered 1..6 in order (so the by-position mapping is
  // actually positional, not scrambled by a reordered table).
  assert.deepEqual(
    doc.map((d) => d.row),
    [1, 2, 3, 4, 5, 6],
    `${DOC_FILE}: dimension table rows are not numbered 1..6 in order (got ${JSON.stringify(doc.map((d) => d.row))})`,
  );

  // Every parsed weight is a real number in (0, 1]; catches a regex that
  // captured garbage or an empty string that `norm` turned into 0/NaN.
  for (const [name, side] of [[CODE_FILE, code], [DOC_FILE, doc], [PROMPT_FILE, prompt]]) {
    for (const { weight } of side) {
      assert.ok(
        Number.isFinite(weight) && weight > 0 && weight <= 1,
        `${name}: parsed a weight outside (0, 1]: ${weight}`,
      );
    }
  }
});

test("the six dimension keys are identical and in order across code and prompt", () => {
  const codeKeys = code.map((c) => c.key);
  const promptKeys = prompt.map((p) => p.key);
  // Anchor: the load-bearing top dimension leads both lists. Guards against a
  // parser that returned six plausible-but-wrong tokens.
  assert.equal(codeKeys[0], "task_automatability", `${CODE_FILE}: first dimension key is ${codeKeys[0]}, expected task_automatability`);
  assert.equal(new Set(codeKeys).size, EXPECTED_COUNT, `${CODE_FILE}: dimension keys are not all distinct: ${JSON.stringify(codeKeys)}`);
  assert.deepEqual(
    promptKeys,
    codeKeys,
    `the prompt rubric's dimension keys (${JSON.stringify(promptKeys)}) must match, in order, the ` +
      `DIMENSION_WEIGHTS keys in ${CODE_FILE} (${JSON.stringify(codeKeys)}) — the rubric the model is ` +
      `given must name the same dimensions, in the same order, as the math that folds its answers.`,
  );
});

test("the six weights agree by position across code, doc, and prompt", () => {
  const codeW = code.map((c) => c.weight);
  const docW = doc.map((d) => d.weight);
  const promptW = prompt.map((p) => p.weight);
  assert.deepEqual(
    docW,
    codeW,
    `the methodology table's Weight column (${JSON.stringify(docW)}) must match the executable ` +
      `DIMENSION_WEIGHTS in ${CODE_FILE} (${JSON.stringify(codeW)}) — the published methodology must ` +
      `describe the weighting the code actually applies.`,
  );
  assert.deepEqual(
    promptW,
    codeW,
    `the prompt rubric's weights (${JSON.stringify(promptW)}) must match the executable ` +
      `DIMENSION_WEIGHTS in ${CODE_FILE} (${JSON.stringify(codeW)}) — the model must be rubric'd on the ` +
      `same weighting the code uses to fold its dimension scores.`,
  );
});

test("the weights sum to 1.00 and the doc still promises they do", () => {
  const sum = code.reduce((acc, c) => acc + c.weight, 0);
  assert.ok(
    Math.abs(sum - 1) < 1e-9,
    `${CODE_FILE}: DIMENSION_WEIGHTS sum to ${sum}, not 1.00 — scores would silently rescale off the ` +
      `0–100 range the countdown bands assume.`,
  );
  assert.match(
    docSrc,
    /Weights sum to 1\.00/,
    `${DOC_FILE}: the "Weights sum to 1.00" promise is missing — either the prose was dropped or the ` +
      `constraint was abandoned; both should be a deliberate, visible edit.`,
  );
});
