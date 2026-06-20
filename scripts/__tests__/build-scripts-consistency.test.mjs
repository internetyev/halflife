// Config-drift guard: every npm script invoked by CI and the Makefile must be
// defined in `package.json`.
//
// `.github/workflows/ci.yml` and the repo-root `Makefile` both drive the build
// by name — `npm run typecheck`, `npm run validate`, `npm test`, etc. — but
// nothing pins those references to the `scripts` block they call. Rename or
// remove a script in `package.json` (say `check:links` → `lint:links`) and the
// caller keeps the old name: the routine can't catch it (it never runs
// `npm install`, so it never executes the scripts locally), `npm run build`
// stays green, and the break only surfaces as a red CI step or a failed
// `make ci` on a human's laptop — exactly the silent doc/config-vs-code drift
// class L5.56 (methodology) and L5.57 (env vars) pinned, applied here to the
// build command surface.
//
// The guard is DIRECTIONAL: referenced ⊆ defined. We assert every script CI or
// the Makefile invokes exists in `package.json`, but NOT the reverse — a script
// can legitimately be defined and not wired into CI (`dev`, `start` are run by
// hand, not in the pipeline), so a defined-but-unreferenced script is fine while
// a referenced-but-undefined one is the footgun that fails.
//
// `npm install` / `npm ci` are not scripts (they're npm built-ins) and are
// excluded; `npm test` / `npm start` ARE script aliases (npm runs the matching
// `scripts` entry) and are included.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Files that drive the build by npm-script name, and so must only reference
// scripts that exist. Both are committed and always present on every checkout.
const CALLER_FILES = [".github/workflows/ci.yml", "Makefile"];

// Bare `npm <word>` subcommands that npm treats as a `run <word>` alias (they
// execute the matching `scripts` entry if defined). `install`/`ci`/`run`/etc.
// are npm built-ins, not scripts, and must NOT be collected as references.
const LIFECYCLE_ALIASES = new Set(["test", "start", "stop", "restart"]);

// `npm run <name>` (name may contain the `:`-namespacing npm allows, e.g.
// `check:links`) OR a bare lifecycle alias like `npm test`. The trailing
// boundary stops `npm run lint` from also swallowing a following word.
const NPM_INVOCATION = /\bnpm\s+(run\s+([a-zA-Z0-9:_-]+)|([a-zA-Z]+))\b/g;

function parseDefinedScripts() {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

// Collect script references from one caller file. Returns a Set of script names
// it invokes (run-by-name plus lifecycle aliases), ignoring npm built-ins.
function referencedScriptsIn(relPath) {
  const text = readFileSync(join(REPO_ROOT, relPath), "utf8");
  const out = new Set();
  let m;
  while ((m = NPM_INVOCATION.exec(text)) !== null) {
    if (m[2] !== undefined) {
      out.add(m[2]); // `npm run <name>`
    } else if (LIFECYCLE_ALIASES.has(m[3])) {
      out.add(m[3]); // `npm test` / `npm start` -> the matching script
    }
    // else: a built-in like `npm install` / `npm ci` — not a script.
  }
  return out;
}

const defined = parseDefinedScripts();

// script name -> Set(caller files that reference it)
const references = new Map();
for (const file of CALLER_FILES) {
  for (const name of referencedScriptsIn(file)) {
    if (!references.has(name)) references.set(name, new Set());
    references.get(name).add(file);
  }
}

test("package.json parses to a non-empty scripts set", () => {
  // A parser that silently matched nothing would make the guard below vacuous.
  assert.ok(defined.size > 0, "no scripts parsed out of package.json");
  for (const expected of ["typecheck", "lint", "build", "validate", "test"]) {
    assert.ok(defined.has(expected), `expected package.json to define ${expected}`);
  }
});

test("script references were actually discovered in CI and the Makefile", () => {
  // Guards against a regex/format change (or a renamed workflow) that quietly
  // turns the consistency assertion into a no-op (empty ⊆ defined is true).
  for (const file of CALLER_FILES) {
    assert.ok(
      referencedScriptsIn(file).size > 0,
      `found no npm-script references in ${file} — scan likely misconfigured`,
    );
  }
});

test("every npm script invoked by CI or the Makefile is defined in package.json", () => {
  const undefinedRefs = [...references.keys()].filter((n) => !defined.has(n)).sort();
  assert.deepEqual(
    undefinedRefs,
    [],
    `npm scripts invoked by a build caller but missing from package.json:\n` +
      undefinedRefs
        .map((n) => `  ${n}  (referenced in ${[...references.get(n)].sort().join(", ")})`)
        .join("\n"),
  );
});

test("the known build scripts are referenced by a caller (anchors the guard)", () => {
  // Pins today's wiring so the suite fails loudly if a future edit DROPS a step
  // from CI/Makefile — not only when one references a missing script. Each must
  // be both defined and actually invoked by the pipeline.
  const expected = ["typecheck", "lint", "build", "validate", "check:links", "test"];
  for (const name of expected) {
    assert.ok(defined.has(name), `expected package.json to define ${name}`);
    assert.ok(references.has(name), `expected CI or the Makefile to invoke ${name}`);
  }
});
