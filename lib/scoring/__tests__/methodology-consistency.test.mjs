// Doc-vs-code consistency test for the scoring model.
//
// The six dimension weights and the five score-to-countdown bands are
// HAND-MIRRORED across three artifacts (D-009): the runtime constants in
// `lib/scoring/index.ts`, the tool/prompt definition (pinned doc↔schema by the
// L5.53 role-analysis suite), and the human-readable tables in
// `docs/methodology.md`. Nothing pinned the doc↔code half: an editor could
// change a weight in `index.ts` (re-banding every role's score) without
// touching the published methodology, or "fix" a number in the doc the code
// never adopted — and `npm run build` would stay green because both sides are
// independently well-typed prose/data. This suite parses the two Markdown
// tables out of `docs/methodology.md` and asserts they equal the exported
// `DIMENSION_WEIGHTS` / `COUNTDOWN_BANDS` (the latter exported in L5.56 for
// exactly this check), so a drift in either direction fails CI loudly.
//
// The doc table uses human-readable dimension names ("Human-in-the-loop
// necessity") that don't snake_case to the code keys, so the mapping is spelled
// out explicitly below — that map is itself part of the contract being pinned.
//
// Pure Node built-ins; index.ts loads via the L5.54 test resolver. Run with
// `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DIMENSION_WEIGHTS, COUNTDOWN_BANDS } from "../index.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const METHODOLOGY = readFileSync(
  join(REPO_ROOT, "docs", "methodology.md"),
  "utf8",
);

// The doc's bold dimension names → the snake_case keys in DIMENSION_WEIGHTS.
// This mapping is part of the hand-mirror being pinned: if a future doc edit
// renames a dimension, this map (and the assertion below) must move with it.
const DOC_NAME_TO_KEY = {
  "Task automatability": "task_automatability",
  "Tool maturity": "tool_maturity",
  "Adoption velocity": "adoption_velocity",
  "Human-in-the-loop necessity": "hitl_necessity",
  "Differentiation moat": "differentiation_moat",
  "Labor-market elasticity": "labor_market_elasticity",
};

// Weights-table rows: `| N | **Name** — … | … | … | 0.NN |`. The `**bold**`
// name + trailing `0.NN` cell uniquely identify these six rows — the version
// log's `| 1 | 2026-05-09 | … |` rows match neither, so they're skipped.
function parseDocWeights(md) {
  const out = {};
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*[1-6]\s*\|.*?\*\*(.+?)\*\*.*\|\s*(0\.\d+)\s*\|\s*$/);
    if (!m) continue;
    const [, name, weight] = m;
    out[name.trim()] = parseFloat(weight);
  }
  return out;
}

// Band-table rows: `| lo–hi | yMin – yMax |` (en-dash or hyphen). The header /
// separator / every other table row fails this two-cell numeric shape.
function parseDocBands(md) {
  const out = [];
  for (const line of md.split("\n")) {
    const m = line.match(
      /^\|\s*(\d+)\s*[–-]\s*(\d+)\s*\|\s*([\d.]+)\s*[–-]\s*([\d.]+)\s*\|\s*$/,
    );
    if (!m) continue;
    out.push({
      scoreMin: Number(m[1]),
      scoreMax: Number(m[2]),
      yearsMin: Number(m[3]),
      yearsMax: Number(m[4]),
    });
  }
  return out;
}

test("methodology.md weights table parses to exactly six dimensions", () => {
  const doc = parseDocWeights(METHODOLOGY);
  assert.equal(
    Object.keys(doc).length,
    6,
    "expected to parse 6 weight rows from docs/methodology.md — parser drifted from the table format",
  );
});

test("every doc dimension name maps to a known code key", () => {
  const doc = parseDocWeights(METHODOLOGY);
  for (const name of Object.keys(doc)) {
    assert.ok(
      name in DOC_NAME_TO_KEY,
      `methodology.md dimension "${name}" has no entry in DOC_NAME_TO_KEY`,
    );
  }
  // …and the map covers every code key, so a new dimension can't slip in
  // documented-but-unmapped or mapped-but-undocumented.
  assert.deepEqual(
    Object.values(DOC_NAME_TO_KEY).sort(),
    Object.keys(DIMENSION_WEIGHTS).sort(),
  );
});

test("doc weights match DIMENSION_WEIGHTS exactly", () => {
  const doc = parseDocWeights(METHODOLOGY);
  const docByKey = {};
  for (const [name, weight] of Object.entries(doc)) {
    docByKey[DOC_NAME_TO_KEY[name]] = weight;
  }
  assert.deepEqual(docByKey, { ...DIMENSION_WEIGHTS });
});

test("doc's 'weights sum to 1.00' claim holds for both doc and code", () => {
  const doc = parseDocWeights(METHODOLOGY);
  const docSum = Object.values(doc).reduce((a, b) => a + b, 0);
  const codeSum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
  // Float-tolerant: 0.3+0.2+0.15+0.15+0.1+0.1 isn't exactly 1 in IEEE-754.
  assert.ok(Math.abs(docSum - 1) < 1e-9, `doc weights sum to ${docSum}, not 1.0`);
  assert.ok(Math.abs(codeSum - 1) < 1e-9, `code weights sum to ${codeSum}, not 1.0`);
});

test("methodology.md countdown table parses to exactly five bands", () => {
  const bands = parseDocBands(METHODOLOGY);
  assert.equal(
    bands.length,
    5,
    "expected to parse 5 countdown bands from docs/methodology.md — parser drifted from the table format",
  );
});

test("doc countdown bands match COUNTDOWN_BANDS exactly", () => {
  const docBands = parseDocBands(METHODOLOGY);
  const codeBands = COUNTDOWN_BANDS.map((b) => ({
    scoreMin: b.scoreMin,
    scoreMax: b.scoreMax,
    yearsMin: b.yearsMin,
    yearsMax: b.yearsMax,
  }));
  assert.deepEqual(docBands, codeBands);
});

test("countdown bands are contiguous and cover 0–100", () => {
  // Guards the doc and code together: a gap or overlap would mean some score
  // falls into no band (or two), which bandedCountdown's `.find` resolves
  // silently. The doc table and code constant must both tile [0,100].
  const bands = parseDocBands(METHODOLOGY);
  assert.equal(bands[0].scoreMin, 0);
  assert.equal(bands[bands.length - 1].scoreMax, 100);
  for (let i = 1; i < bands.length; i++) {
    assert.equal(
      bands[i].scoreMin,
      bands[i - 1].scoreMax + 1,
      `band ${i} starts at ${bands[i].scoreMin} but previous ends at ${bands[i - 1].scoreMax}`,
    );
  }
});
