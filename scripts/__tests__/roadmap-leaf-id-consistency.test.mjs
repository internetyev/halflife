// Doc-integrity guard: every roadmap leaf id (`L<phase>.<n>[a-z]?`) referenced in
// the planning docs must resolve to a leaf that actually exists in `ROADMAP.md`,
// and no leaf may be defined twice.
//
// `ROADMAP.md` is the single source of truth for the work breakdown; its leaves
// are the checkbox lines (`- [ ] L5.61 ...`). Both `ROADMAP.md` and
// `DECISIONS.md` cite leaf ids in prose ("same boundary as L1.5b", "depends on
// L3.2b", "the L5.39–L5.42 test arc"). Nothing pins a citation to a real
// checkbox, so a leaf can be renamed, dropped, or simply mistyped while the line
// that cites it merges anyway — a dangling reference that no build step catches
// because both files are prose. This is the leaf-id analogue of the L5.61
// decision-id (`D-###`) cross-reference guard, applied to the work-breakdown id
// surface.
//
// The one wrinkle a naive "referenced ⊆ defined" check gets wrong: a parent leaf
// is routinely SPLIT into lettered children when the routine cannot finish it in
// one run (L1.5 → L1.5a/L1.5b, L3.2 → L3.2a/L3.2b, L5.4 → L5.4a/L5.4b — see
// ROUTINE.md §2 "split it" and D-009/D-033). After a split the bare parent id
// (`L1.5`) lives on only in prose, while the checkboxes are the children. So a
// referenced id is "resolved" if it is defined directly OR at least one of its
// single-letter children (`<id>a`, `<id>b`, …) is defined. Anything else is a
// genuine dangling citation.
//
// Three assertions:
//   1. RESOLVABLE — every leaf id cited in ROADMAP.md or DECISIONS.md is defined
//      directly or via a split child.
//   2. UNIQUE — no leaf id is defined by two checkbox lines (a copy-paste that
//      would let one leaf silently shadow another, or double-count progress).
//   3. (sanity) the parsers find a non-empty set of definitions AND citations, so
//      a regex/format drift can't turn checks 1–2 into vacuous no-ops.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Files scanned for leaf-id citations. Both are committed and always present.
const CITING_FILES = ["ROADMAP.md", "DECISIONS.md"];

// A leaf id: phase + dotted index + optional single split letter. The full-token
// match means "L5.40" parses as one id, never as "L5.4" + "0".
const LEAF_ID = /\bL\d+\.\d+[a-z]?\b/g;
// A leaf DEFINITION: a top-level checkbox list item whose first token is the id.
// Marker is one of " " (todo), "x" (done), "~" (draft) — the markers ROUTINE.md
// §3 prescribes.
const LEAF_DEF = /^- \[[ x~]\] (L\d+\.\d+[a-z]?)\b/gm;

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// id -> count of defining checkbox lines
const defCounts = new Map();
{
  const text = read("ROADMAP.md");
  let m;
  while ((m = LEAF_DEF.exec(text)) !== null) {
    const id = m[1];
    defCounts.set(id, (defCounts.get(id) ?? 0) + 1);
  }
}
const defined = new Set(defCounts.keys());

// id -> Set(files citing it)
const citations = new Map();
for (const file of CITING_FILES) {
  const text = read(file);
  let m;
  while ((m = LEAF_ID.exec(text)) !== null) {
    const id = m[0];
    if (!citations.has(id)) citations.set(id, new Set());
    citations.get(id).add(file);
  }
}

// A cited id is resolved if defined directly, or split into ≥1 lettered child
// (e.g. "L1.5" resolved by "L1.5a"). The child test requires exactly one
// trailing lowercase letter so "L5.4" is NOT spuriously resolved by "L5.40".
function isResolved(id) {
  if (defined.has(id)) return true;
  for (const d of defined) {
    if (d.length === id.length + 1 && d.startsWith(id) && /^[a-z]$/.test(d.slice(id.length))) {
      return true;
    }
  }
  return false;
}

test("ROADMAP.md parses to a non-empty set of leaf definitions", () => {
  // A regex/format drift that matched nothing would make the checks below
  // vacuous (every citation would be "unresolved", or ∅ would trivially pass).
  assert.ok(defined.size > 0, "no `- [ ] L#.#` checkbox leaves parsed from ROADMAP.md");
  for (const anchor of ["L1.1", "L2.1", "L5.61"]) {
    assert.ok(defined.has(anchor), `expected ROADMAP.md to define leaf ${anchor}`);
  }
});

test("leaf-id citations were actually discovered in the planning docs", () => {
  // Guards against a regex change that quietly turns the resolution assertion
  // into a no-op (∅ is vacuously all-resolved).
  for (const file of CITING_FILES) {
    const text = read(file);
    LEAF_ID.lastIndex = 0;
    assert.ok(
      LEAF_ID.test(text),
      `found no L#.# leaf-id citations in ${file} — scan likely misconfigured`,
    );
  }
});

test("every leaf id cited in the planning docs resolves to a defined (or split) leaf", () => {
  const dangling = [...citations.keys()]
    .filter((id) => !isResolved(id))
    .sort();
  assert.deepEqual(
    dangling,
    [],
    "leaf ids cited but neither defined nor split into children in ROADMAP.md:\n" +
      dangling
        .map((id) => `  ${id}  (cited in ${[...citations.get(id)].sort().join(", ")})`)
        .join("\n"),
  );
});

test("no leaf id is defined twice", () => {
  const dupes = [...defCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => `${id} (×${count})`)
    .sort();
  assert.deepEqual(dupes, [], "duplicate leaf checkbox definitions in ROADMAP.md: " + dupes.join(", "));
});
