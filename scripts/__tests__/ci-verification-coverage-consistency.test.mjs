// Config-drift guard: every verification script the project defines must
// actually be RUN by `.github/workflows/ci.yml`, and the Python test suite must
// be discovered there too.
//
// This is the load-bearing REVERSE of the L5.58 build-scripts guard. That guard
// pins referenced ⊆ defined (every `npm run X` a caller names exists in
// package.json) and deliberately collapses CI and the Makefile into one caller
// set — so it is silent about the inverse footgun: a verification script that is
// DEFINED in package.json and still listed in the Makefile but has been DROPPED
// from `ci.yml`. build-scripts' final "anchor" test only checks each known
// script is referenced by CI *or* the Makefile, so a step deleted from CI yet
// kept in `make ci` still passes there. Nothing pins per-file CI coverage.
//
// The drift this pins is the silent un-wiring of CI's verification surface —
// invisible to every local build step and to the routine (which never runs
// `npm install` or CI):
//   (a) someone edits `ci.yml` and removes the `- name: test / run: npm test`
//       step (a merge slip, a "temporarily disable the slow step" that never got
//       reverted). `next build` is green, the Makefile still has `make test`, so
//       build-scripts stays green — but the entire L5.57–L5.76 consistency-guard
//       arc (200+ node tests whose ONLY execution path is CI) stops running, and
//       the pipeline still shows a green check. The guards exist to catch drift
//       in CI; a CI that no longer runs them is the worst silent failure.
//   (b) the `python3 -m unittest discover` step is dropped: `test_rank_job_titles.py`
//       (and any future `test_*.py`) silently stops running. The Python suite is
//       NOT an npm script, so neither build-scripts nor the L5.60 test-glob guard
//       (which only matches `*.test.mjs` against package.json globs) ever sees it.
//
// DIRECTION — defined-verification ⊆ CI-invoked, scoped to `ci.yml` ALONE (not
// the Makefile). "Verification scripts" = every package.json script EXCEPT the
// run-by-hand allowlist {dev, start} (long-running/interactive servers a human
// starts, never a non-interactive CI step). Every other defined script is a
// non-interactive check that the pipeline must run, so each must appear as an
// `npm run <name>` / `npm <alias>` invocation in `ci.yml`. NOT the reverse: CI
// may also run things that aren't package.json scripts (the Python discovery,
// `npm install`), which is fine.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CI_FILE = ".github/workflows/ci.yml";
const PY_TEST_DIR = "scripts/__tests__";

// Package.json scripts that a human runs by hand (interactive / long-running
// servers), never as a non-interactive CI step. Everything else is a
// verification script CI must run. Keep this list TIGHT — adding a script here
// is opting it out of the CI-coverage requirement, so it should only ever hold
// genuinely un-CI-able commands.
const RUN_BY_HAND = new Set(["dev", "start"]);

// Bare `npm <word>` subcommands npm treats as a `run <word>` alias. Mirrors the
// L5.58 build-scripts scanner so `npm test` counts as invoking the `test`
// script while `npm install` / `npm ci` (built-ins) do not.
const LIFECYCLE_ALIASES = new Set(["test", "start", "stop", "restart"]);
const NPM_INVOCATION = /\bnpm\s+(run\s+([a-zA-Z0-9:_-]+)|([a-zA-Z]+))\b/g;

function parseDefinedScripts() {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

// Scripts `ci.yml` invokes by name (run-by-name + lifecycle aliases), ignoring
// npm built-ins like `npm install`.
function ciInvokedScripts() {
  const text = readFileSync(join(REPO_ROOT, CI_FILE), "utf8");
  const out = new Set();
  let m;
  while ((m = NPM_INVOCATION.exec(text)) !== null) {
    if (m[2] !== undefined) out.add(m[2]); // `npm run <name>`
    else if (LIFECYCLE_ALIASES.has(m[3])) out.add(m[3]); // `npm test` etc.
  }
  return out;
}

function pythonTestFiles() {
  return readdirSync(join(REPO_ROOT, PY_TEST_DIR))
    .filter((f) => f.startsWith("test_") && f.endsWith(".py"))
    .sort();
}

const ciText = readFileSync(join(REPO_ROOT, CI_FILE), "utf8");
const defined = parseDefinedScripts();
const verification = [...defined].filter((s) => !RUN_BY_HAND.has(s)).sort();
const ciInvoked = ciInvokedScripts();

test("package.json parses to a non-empty scripts set", () => {
  // A parser that matched nothing would make every assertion below vacuous.
  assert.ok(defined.size > 0, "no scripts parsed out of package.json");
  for (const expected of ["typecheck", "lint", "build", "validate", "test"]) {
    assert.ok(defined.has(expected), `expected package.json to define ${expected}`);
  }
});

test("npm-script invocations were actually discovered in ci.yml", () => {
  // Guards against a regex/format change (or a renamed workflow file) that turns
  // the coverage assertion into a vacuous empty ⊆ check.
  assert.ok(
    ciInvoked.size > 0,
    `found no npm-script invocations in ${CI_FILE} — scan likely misconfigured`,
  );
});

test("every verification script is run by ci.yml (defined-verification ⊆ CI)", () => {
  const missing = verification.filter((s) => !ciInvoked.has(s));
  assert.deepEqual(
    missing,
    [],
    `package.json defines these non-hand-run scripts but ci.yml never invokes them ` +
      `(a check that silently stopped running in CI):\n` +
      missing.map((s) => `  ${s}`).join("\n"),
  );
});

test("the known verification scripts are both defined and run by CI (anchors the guard)", () => {
  // Pins today's wiring so a future edit that DROPS a step from ci.yml fails
  // loudly — not only an edit that adds a new uncovered script.
  const expected = ["typecheck", "lint", "build", "validate", "check:links", "test"];
  for (const name of expected) {
    assert.ok(defined.has(name), `expected package.json to define ${name}`);
    assert.ok(ciInvoked.has(name), `expected ci.yml to invoke ${name}`);
  }
});

test("ci.yml runs the Python test suite whenever test_*.py files exist", () => {
  // The Python suite is not an npm script, so the L5.58 build-scripts and L5.60
  // test-glob guards never see it; if `python3 -m unittest discover` is dropped
  // from CI, test_rank_job_titles.py silently stops running with a green check.
  const pyFiles = pythonTestFiles();
  if (pyFiles.length === 0) return; // nothing to run — nothing to pin
  assert.match(
    ciText,
    /python3?\s+-m\s+unittest\s+discover/,
    `${PY_TEST_DIR} has Python tests (${pyFiles.join(", ")}) but ${CI_FILE} has no ` +
      `\`unittest discover\` step — they would silently stop running in CI`,
  );
  assert.ok(
    ciText.includes(PY_TEST_DIR),
    `${CI_FILE}'s Python step does not point its discovery at ${PY_TEST_DIR}`,
  );
  assert.match(
    ciText,
    /test_\*\.py/,
    `${CI_FILE}'s \`unittest discover\` step does not use the test_*.py pattern that ` +
      `matches the committed Python tests`,
  );
});
