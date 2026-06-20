// Doc-integrity guard: every `D-###` decision id referenced anywhere in the
// planning docs must be DEFINED in `DECISIONS.md`, and the definition log must
// be unique and gap-free.
//
// `DECISIONS.md` is the append-only ADR log; `ROADMAP.md` leaves cite the
// decisions that justify them ("... D-046", "D-081."). Nothing pins a citation
// to an actual entry, so a decision line can be dropped (or never written) while
// the leaf that cites it merges anyway — a dangling cross-reference that no
// build step catches because both files are prose. This is exactly how L5.51
// merged: its ROADMAP line and `#96` commit both cite `D-081`, but no
// `- **D-081**` line was ever added (the log jumped D-080 -> D-082). This guard
// is the doc-side analogue of the L5.56/L5.57/L5.58 code-vs-doc drift guards,
// applied to the decision-id surface; restoring D-081 (L5.61) is what makes the
// repo pass it.
//
// Three independent assertions:
//   1. DIRECTIONAL referenced ⊆ defined — every id cited in ROADMAP.md or in
//      DECISIONS.md prose has a matching `- **D-###**` definition. (A definition
//      line cites its own id, which is trivially in `defined`, so self-citation
//      never trips the check.)
//   2. UNIQUE — no id is defined by two `- **D-###**` lines (a copy-paste that
//      would let one entry silently shadow another).
//   3. GAP-FREE — the defined ids form a contiguous 1..N run. The log is
//      append-only and sequential by convention (D-001..D-NNN); a gap means an
//      entry was dropped (the D-081 failure mode) rather than appended.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Files scanned for `D-###` citations. Both are committed and always present.
const CITING_FILES = ["ROADMAP.md", "DECISIONS.md"];

// Any `D-` followed by digits, anywhere in prose.
const DECISION_ID = /\bD-(\d+)\b/g;
// A decision DEFINITION: a top-level list item whose first token is the bold id.
const DECISION_DEF = /^- \*\*D-(\d+)\*\*/gm;

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Normalise an id's digits to an integer so D-007 and D-7 compare equal, while
// keeping a zero-padded label for human-readable failure messages.
const asInt = (digits) => Number.parseInt(digits, 10);
const label = (n) => `D-${String(n).padStart(3, "0")}`;

// id (int) -> count of defining lines
const defCounts = new Map();
{
  const text = read("DECISIONS.md");
  let m;
  while ((m = DECISION_DEF.exec(text)) !== null) {
    const id = asInt(m[1]);
    defCounts.set(id, (defCounts.get(id) ?? 0) + 1);
  }
}
const defined = new Set(defCounts.keys());

// id (int) -> Set(files citing it)
const citations = new Map();
for (const file of CITING_FILES) {
  const text = read(file);
  let m;
  while ((m = DECISION_ID.exec(text)) !== null) {
    const id = asInt(m[1]);
    if (!citations.has(id)) citations.set(id, new Set());
    citations.get(id).add(file);
  }
}

test("DECISIONS.md parses to a non-empty set of definitions", () => {
  // A regex/format drift that matched nothing would make every check below
  // vacuous (referenced ⊆ ∅ is false only if referenced is non-empty, and the
  // gap check would pass on an empty run).
  assert.ok(defined.size > 0, "no `- **D-###**` definitions parsed from DECISIONS.md");
  for (const anchor of [1, 8, 46]) {
    assert.ok(defined.has(anchor), `expected DECISIONS.md to define ${label(anchor)}`);
  }
});

test("D-### citations were actually discovered in the planning docs", () => {
  // Guards against a regex change that quietly turns the ⊆ assertion into a
  // no-op (∅ ⊆ defined is always true).
  for (const file of CITING_FILES) {
    const text = read(file);
    DECISION_ID.lastIndex = 0;
    assert.ok(
      DECISION_ID.test(text),
      `found no D-### citations in ${file} — scan likely misconfigured`,
    );
  }
});

test("every D-### cited in the planning docs is defined in DECISIONS.md", () => {
  const dangling = [...citations.keys()]
    .filter((id) => !defined.has(id))
    .sort((a, b) => a - b);
  assert.deepEqual(
    dangling,
    [],
    "decision ids cited but never defined in DECISIONS.md:\n" +
      dangling
        .map((id) => `  ${label(id)}  (cited in ${[...citations.get(id)].sort().join(", ")})`)
        .join("\n"),
  );
});

test("no decision id is defined twice", () => {
  const dupes = [...defCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => `${label(id)} (×${count})`)
    .sort();
  assert.deepEqual(dupes, [], "duplicate `- **D-###**` definitions: " + dupes.join(", "));
});

test("defined decision ids form a contiguous 1..N run (no dropped entries)", () => {
  const ids = [...defined].sort((a, b) => a - b);
  const max = ids[ids.length - 1];
  const missing = [];
  for (let i = 1; i <= max; i++) {
    if (!defined.has(i)) missing.push(label(i));
  }
  assert.equal(ids[0], 1, `decision log should start at ${label(1)}, starts at ${label(ids[0])}`);
  assert.deepEqual(
    missing,
    [],
    `gaps in the append-only decision log (entry dropped, like the L5.51 D-081 omission): ${missing.join(", ")}`,
  );
});
