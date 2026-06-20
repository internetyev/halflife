// Config-drift guard: every `*.test.mjs` file in the repo must be matched by
// one of the globs the `package.json` `test` script passes to `node --test`.
//
// The drift it pins: `npm test` runs a FIXED set of globs —
//   node --import ./scripts/test-resolver.mjs --test \
//     "scripts/__tests__/*.test.mjs" "lib/**/__tests__/*.test.mjs"
// so a test file placed anywhere those two patterns don't reach (a new
// `app/**/__tests__/x.test.mjs`, a `components/__tests__/y.test.mjs`, or a
// stray `lib/foo.test.mjs` that isn't under a `__tests__/` dir) is silently
// NEVER RUN. Nothing else catches it: `npm run build`/`typecheck` ignore test
// files, the author sees a green `npm test` that simply skipped their file, and
// the missing coverage surfaces only as an undetected regression in prod. This
// is the meta-guard over the whole L5.39–L5.59 suite: it asserts the test
// runner's reach keeps pace with where tests actually live.
//
// Same config-vs-code class as the methodology (L5.56/D-086), env-var
// (L5.57/D-087), npm-script (L5.58/D-088) and Node-version (L5.59/D-089)
// guards, applied to the **test-discovery surface** (glob ⊇ test files).
//
// Directional, by design: asserts files ⊆ globs (every test file is reachable),
// NOT the reverse — a glob that currently matches nothing (e.g. an empty
// `lib/**/__tests__` before any lib test existed) is a harmless forward-looking
// pattern, while a test file no glob reaches is the footgun. (Test #4 still
// flags a glob that matches nothing as an informational anchor, not a failure
// of the core invariant.)
//
// Pure Node built-ins (`fs` walk + regex glob→RegExp), no `node_modules` /
// `@/`-alias resolution, so it runs identically on the routine laptop (which
// never `npm install`s) and the GitHub CI runner. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

// Dirs we never descend into when enumerating test files — build output,
// dependencies, VCS internals. Anything else (app/, lib/, components/,
// scripts/, …) is fair game so a misplaced test anywhere is caught.
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "coverage"]);

// The two globs the routine + CI both rely on. Kept as an explicit anchor so a
// future edit that NARROWS the test script (drops a pattern, scopes it tighter)
// trips test #5 rather than silently shrinking coverage.
const KNOWN_GLOBS = [
  "scripts/__tests__/*.test.mjs",
  "lib/**/__tests__/*.test.mjs",
];

// Extract the `--test` glob arguments from the package.json `test` script.
// Only the quoted tokens AFTER `--test` are globs; the `--import <resolver>`
// argument and the `node` binary are not. Tolerates single or double quotes.
function extractTestGlobs(testScript) {
  const marker = "--test";
  const idx = testScript.indexOf(marker);
  if (idx === -1) return [];
  const tail = testScript.slice(idx + marker.length);
  const globs = [];
  const re = /(['"])([^'"]*\.test\.mjs)\1/g;
  let m;
  while ((m = re.exec(tail)) !== null) {
    globs.push(m[2]);
  }
  return globs;
}

// Translate a shell glob into an anchored RegExp with the path semantics the
// shell/`node --test` use: `*` matches within one path segment (not `/`),
// `**/` matches zero-or-more whole directory segments, a trailing `**` matches
// the rest. All other regex metacharacters are escaped literally.
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:[^/]+/)*"; // `**/` → zero-or-more directories
          i += 2;
        } else {
          re += ".*"; // trailing `**`
          i += 1;
        }
      } else {
        re += "[^/]*"; // single `*` stays within a segment
      }
    } else if (/[.+?^${}()|[\]\\]/.test(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

// Recursively collect every `*.test.mjs` path under REPO_ROOT, returned as
// repo-relative POSIX paths (forward slashes) so they compare cleanly against
// the globs regardless of platform separator.
function collectTestFiles(dir = REPO_ROOT, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      collectTestFiles(resolve(dir, entry.name), acc);
    } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
      acc.push(relative(REPO_ROOT, resolve(dir, entry.name)).split(sep).join("/"));
    }
  }
  return acc;
}

const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
const testScript = pkg.scripts?.test ?? "";
const globs = extractTestGlobs(testScript);
const globRes = globs.map(globToRegExp);
const testFiles = collectTestFiles();

test("the package.json test script invokes node --test with at least one glob", () => {
  // Vacuous-guard: if extraction returns nothing (script reformatted, --test
  // removed) the coverage assertion below would pass trivially against an empty
  // glob set. Fail loudly instead.
  assert.ok(testScript.includes("--test"), "scripts.test must invoke `node --test`");
  assert.ok(globs.length > 0, `extracted no .test.mjs globs from: ${testScript}`);
});

test("at least one *.test.mjs file is discovered under the repo", () => {
  // Vacuous-guard: a broken walk (wrong REPO_ROOT, over-eager SKIP_DIRS) would
  // make the empty⊆globs coverage check pass while testing nothing.
  assert.ok(
    testFiles.length > 0,
    "no *.test.mjs files found — the enumerator is mis-rooted",
  );
});

test("every *.test.mjs file is matched by a package.json test glob", () => {
  const uncovered = testFiles.filter((f) => !globRes.some((re) => re.test(f)));
  assert.deepEqual(
    uncovered,
    [],
    `these test files match no glob in \`npm test\` and would never run:\n` +
      uncovered.map((f) => `  - ${f}`).join("\n") +
      `\nglobs: ${JSON.stringify(globs)}`,
  );
});

test("each declared test glob matches at least one real file (no dead pattern)", () => {
  const dead = globs.filter((g) => {
    const re = globToRegExp(g);
    return !testFiles.some((f) => re.test(f));
  });
  assert.deepEqual(
    dead,
    [],
    `these globs in \`npm test\` match no file (stale path?): ${JSON.stringify(dead)}`,
  );
});

test("the two known globs are still present (guards against silent narrowing)", () => {
  // Anchor: additions to the glob set are fine, but dropping/renaming either of
  // the two canonical patterns must be a deliberate edit to THIS test, not a
  // silent coverage shrink.
  for (const known of KNOWN_GLOBS) {
    assert.ok(
      globs.includes(known),
      `the test script no longer passes "${known}" — coverage narrowed; ` +
        `update KNOWN_GLOBS here if this was intentional. current globs: ${JSON.stringify(globs)}`,
    );
  }
});
