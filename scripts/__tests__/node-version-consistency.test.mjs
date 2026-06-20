// Config-drift guard: the three Node-version sources must agree.
//
// The repo pins a Node version in three places, each for a different consumer:
//   1. `.nvmrc` (`22`)            — the recommended dev runtime; `nvm use` /
//                                    `fnm use` / Volta read it, and CI reads it
//                                    too via `node-version-file` (L5.27/D-057).
//   2. `package.json` `engines.node` (`>=20.0.0`) — the *contract* floor that
//                                    npm/Vercel enforce on install/build.
//   3. `.github/workflows/ci.yml` `node-version-file: ".nvmrc"` — how CI picks
//                                    its runtime. L5.27 deliberately replaced a
//                                    hardcoded `node-version: "22"` literal with
//                                    this file reference so there is ONE source.
//
// Two drifts can land silently — the routine never runs `npm install` or CI
// locally, so neither shows up in `npm run build`, only as a red CI step or a
// confusing peer-version failure on a human's clone:
//   (a) `.nvmrc` is bumped/edited below the `engines.node` floor (e.g. someone
//       sets it to `18`): the pinned dev runtime no longer satisfies the
//       contract the app declares — `nvm use` then `npm install` warns/fails.
//   (b) `ci.yml` reintroduces a hardcoded `node-version:` literal (the exact
//       duplicated-literal drift L5.27/D-057 collapsed): the literal and
//       `.nvmrc` then diverge with nothing pinning them together.
//
// Same config-vs-code drift class as L5.56 (methodology doc↔code), L5.57 (env
// vars doc↔code), L5.58 (npm scripts CI/Makefile↔package.json) — applied here
// to the Node-version surface.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// `.nvmrc` is a bare version line, optionally `v`-prefixed (`22`, `v22`,
// `22.1.0`, `lts/*`). We only support a concrete numeric major here — that is
// what the repo commits and what a floor comparison needs.
function parseNvmrcMajor() {
  const raw = read(".nvmrc").trim();
  const m = /^v?(\d+)(?:\.\d+){0,2}$/.exec(raw);
  assert.ok(m, `.nvmrc is not a concrete numeric version: ${JSON.stringify(raw)}`);
  return Number(m[1]);
}

// `engines.node` is a semver range; the repo uses a simple `>=N.0.0` floor.
// Pull the lowest major the range admits.
function parseEnginesFloorMajor() {
  const pkg = JSON.parse(read("package.json"));
  const range = pkg.engines?.node;
  assert.ok(typeof range === "string" && range.length > 0, "package.json has no engines.node");
  const m = />=\s*(\d+)/.exec(range);
  assert.ok(m, `engines.node is not a '>=N' floor range: ${JSON.stringify(range)}`);
  return { major: Number(m[1]), range };
}

const ciYml = read(".github/workflows/ci.yml");
const nvmrcMajor = parseNvmrcMajor();
const engines = parseEnginesFloorMajor();

test(".nvmrc pins a concrete Node major", () => {
  assert.ok(Number.isInteger(nvmrcMajor) && nvmrcMajor > 0, ".nvmrc major must be a positive integer");
});

test("package.json engines.node declares a >=N floor", () => {
  assert.ok(Number.isInteger(engines.major) && engines.major > 0, "engines floor must be a positive integer");
});

test(".nvmrc major satisfies the engines.node floor", () => {
  // The recommended dev runtime must meet the contract the app ships. If this
  // fails, `nvm use` gives a Node the project's own `engines` rejects.
  assert.ok(
    nvmrcMajor >= engines.major,
    `.nvmrc pins Node ${nvmrcMajor} but engines.node requires ${engines.range} ` +
      `(floor major ${engines.major}) — the dev runtime is below the contract floor`,
  );
});

test("CI reads its Node version from .nvmrc (no reintroduced hardcoded literal)", () => {
  // L5.27/D-057 replaced `node-version: "22"` with `node-version-file: ".nvmrc"`
  // so the literal lives in exactly one place. Assert the file reference is
  // present AND no sibling `node-version:` literal crept back in.
  assert.match(
    ciYml,
    /node-version-file:\s*["']?\.nvmrc["']?/,
    "ci.yml must select Node via node-version-file: \".nvmrc\"",
  );
  assert.ok(
    !/\bnode-version:\s*["']?\d/.test(ciYml),
    "ci.yml reintroduced a hardcoded node-version: literal — it should read .nvmrc instead",
  );
});
