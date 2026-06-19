#!/usr/bin/env node
// L5.55 Zero-dependency tests for scripts/test-resolver.mjs (L5.54), the
// test-only module resolver that the `npm test` script loads via
// `--import ./scripts/test-resolver.mjs`. It registers a `module.registerHooks`
// resolve hook that retries a failed resolution with a `.ts` extension — but
// ONLY for a relative, extensionless specifier whose default resolution threw
// ERR_MODULE_NOT_FOUND. That hook is the keystone of the entire node test suite
// (it is what lets `lib/scoring/index.ts`'s extensionless `./types` value import
// resolve under native type-stripping), so a regression in its narrow guard
// would either silently break every `.ts` resolution OR mask a genuinely-missing
// module as a confusing `.ts`-not-found error — and until this leaf nothing
// covered the resolver itself.
//
// Strategy mirrors validators.test.mjs: spawn child `node` processes against
// fixtures written to a fresh temp dir and assert the observable contract, with
// and without the resolver `--import`ed, so each branch of the hook is exercised:
//   1. relative + extensionless + retry-succeeds  -> resolves (.ts found)
//   2. control: same import WITHOUT the resolver   -> ERR_MODULE_NOT_FOUND
//   3. relative + extensionless + retry-also-fails -> original error propagates
//      (the hook must NOT swallow a genuinely-missing module)
//   4. specifier already resolvable (./dep.ts)     -> passed straight through
//   5. non-relative bare specifier, missing        -> not retried, still throws
//
// Pure Node stdlib — node:test, node:assert, node:child_process, node:fs,
// node:os, node:path, node:url. No dependencies, no `npm install`, no network,
// so it runs identically on the routine laptop and the GitHub CI runner.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESOLVER = path.join(SCRIPTS_DIR, "test-resolver.mjs");

let TMP;
before(() => {
  TMP = mkdtempSync(path.join(tmpdir(), "halflife-resolver-"));

  // A genuine TypeScript value module: the `: number` annotation means it can
  // only run under native type-stripping, mirroring the real lib/scoring case.
  writeFileSync(path.join(TMP, "dep.ts"), "export const VALUE: number = 42;\n");

  // Imports the dep with NO extension — the exact case the hook exists to fix.
  writeFileSync(
    path.join(TMP, "entry-extensionless.mjs"),
    'import { VALUE } from "./dep";\nconsole.log("VALUE=" + VALUE);\n',
  );

  // Imports a relative, extensionless specifier that has no `.ts` (or any) file:
  // the hook's `.ts` retry must also fail and the original error must propagate.
  writeFileSync(
    path.join(TMP, "entry-missing.mjs"),
    'import "./does-not-exist";\nconsole.log("unreachable");\n',
  );

  // Imports the dep WITH its real extension: default resolution succeeds on the
  // first try, so the hook's catch block must never run for this one.
  writeFileSync(
    path.join(TMP, "entry-explicit.mjs"),
    'import { VALUE } from "./dep.ts";\nconsole.log("VALUE=" + VALUE);\n',
  );

  // A non-relative bare specifier that does not exist: the hook's `relative`
  // guard is false, so it must rethrow the original error, never retry `.ts`.
  writeFileSync(
    path.join(TMP, "entry-bare.mjs"),
    'import "totally-missing-package-xyz";\nconsole.log("unreachable");\n',
  );
});
after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// Spawn `node [--import RESOLVER] <fixture>` and return exit code + streams.
// spawnSync does not throw on a non-zero exit, so the code is assertable.
function run(fixture, { withResolver }) {
  const args = [];
  if (withResolver) args.push("--import", RESOLVER);
  args.push(path.join(TMP, fixture));
  const res = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(res.error, undefined, `spawning ${fixture} failed: ${res.error}`);
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

test("with the resolver, an extensionless relative .ts import resolves", () => {
  const { code, stdout } = run("entry-extensionless.mjs", { withResolver: true });
  assert.equal(code, 0);
  assert.match(stdout, /VALUE=42/);
});

test("control: WITHOUT the resolver the same import fails (proves the test bites)", () => {
  const { code, stderr } = run("entry-extensionless.mjs", { withResolver: false });
  assert.notEqual(code, 0);
  assert.match(stderr, /ERR_MODULE_NOT_FOUND/);
});

test("the resolver does NOT mask a genuinely-missing relative module", () => {
  // The `.ts` retry also fails, so the original ERR_MODULE_NOT_FOUND propagates
  // rather than the hook swallowing it or surfacing a misleading `.ts` path.
  const { code, stderr } = run("entry-missing.mjs", { withResolver: true });
  assert.notEqual(code, 0);
  assert.match(stderr, /ERR_MODULE_NOT_FOUND/);
});

test("an already-resolvable specifier (./dep.ts) is passed straight through", () => {
  const { code, stdout } = run("entry-explicit.mjs", { withResolver: true });
  assert.equal(code, 0);
  assert.match(stdout, /VALUE=42/);
});

test("a missing non-relative bare specifier is not retried as .ts and still throws", () => {
  const { code } = run("entry-bare.mjs", { withResolver: true });
  assert.notEqual(code, 0);
});
