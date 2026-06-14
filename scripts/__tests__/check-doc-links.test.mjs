#!/usr/bin/env node
// L5.48 Zero-dependency tests for scripts/check-doc-links.mjs (L5.48), the
// repo-wide relative-link checker for Markdown. Two layers, mirroring the
// rank-job-titles Python suite's unit+integration split:
//
//   unit         import the script's pure exports (stripCode, extractTargets,
//                classifyTarget) and assert the parsing contract directly.
//   integration  spawn the script (spawnSync, so a non-zero exit is assertable
//                not thrown) against a fixture tree written to a fresh temp dir
//                and assert the exit-code contract: 0 all links resolve
//                (INCLUDING the empty-tree self-maintaining case), 1 a broken
//                local link, 2 a bad CLI arg.
//
// Pure Node stdlib — node:test, node:assert, node:child_process, node:fs,
// node:os, node:path, node:url. No dependencies / network / `npm install`, so it
// runs identically on the routine laptop and the GitHub CI runner. Each fixture
// is rooted at an explicit --root temp dir, so the suite never touches the
// repo's real tree and is independent of the process CWD.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripCode, extractTargets, classifyTarget } from "../check-doc-links.mjs";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "check-doc-links.mjs",
);

function run(args = []) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  assert.equal(res.error, undefined, `spawning check-doc-links failed: ${res.error}`);
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

let TMP;
before(() => {
  TMP = mkdtempSync(path.join(tmpdir(), "halflife-doclinks-"));
});
after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// Write a fixture file under a named subdir of TMP and return that subdir as the
// --root, so each test gets an isolated tree.
function makeRoot(name, files) {
  const root = path.join(TMP, name);
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  mkdirSync(root, { recursive: true });
  return root;
}

// ---- unit: stripCode ---------------------------------------------------------

test("stripCode blanks fenced code blocks", () => {
  const md = ["before", "```", "[x](missing.md)", "```", "after"].join("\n");
  const out = stripCode(md);
  assert.ok(!out.includes("missing.md"), "fenced link should be stripped");
  assert.ok(out.includes("before") && out.includes("after"));
});

test("stripCode blanks tilde fences and leaves non-matching markers", () => {
  const md = ["~~~", "[x](missing.md)", "~~~"].join("\n");
  assert.ok(!stripCode(md).includes("missing.md"));
});

test("stripCode blanks inline code spans", () => {
  const md = "see `[x](missing.md)` for the syntax";
  assert.ok(!stripCode(md).includes("missing.md"));
});

test("stripCode preserves real links outside code", () => {
  const md = "[real](../DECISIONS.md)";
  assert.ok(stripCode(md).includes("../DECISIONS.md"));
});

// ---- unit: extractTargets ----------------------------------------------------

test("extractTargets pulls both link and image targets", () => {
  const md = "[a](one.md) and ![alt](img.png)";
  assert.deepEqual(extractTargets(md), ["one.md", "img.png"]);
});

test("extractTargets ignores a paren with a newline inside", () => {
  assert.deepEqual(extractTargets("](first\nsecond)"), []);
});

// ---- unit: classifyTarget ----------------------------------------------------

test("classifyTarget skips external schemes and anchors", () => {
  for (const ext of [
    "https://example.com",
    "http://x",
    "mailto:a@b.c",
    "tel:+1",
    "//cdn.example.com/x",
    "#section",
    "",
    "   ",
    "<https://auto.link>",
  ]) {
    assert.equal(classifyTarget(ext).kind, "skip", `${ext} should skip`);
  }
});

test("classifyTarget returns local path and strips fragment + query + title", () => {
  assert.deepEqual(classifyTarget("../DECISIONS.md"), { kind: "local", relPath: "../DECISIONS.md" });
  assert.deepEqual(classifyTarget("../README.md#local-setup"), {
    kind: "local",
    relPath: "../README.md",
  });
  assert.deepEqual(classifyTarget("data-schema.md?x=1"), {
    kind: "local",
    relPath: "data-schema.md",
  });
  assert.deepEqual(classifyTarget('img.png "a title"'), { kind: "local", relPath: "img.png" });
});

// ---- integration: exit codes -------------------------------------------------

test("exit 0 when every local link resolves", () => {
  const root = makeRoot("ok", {
    "README.md": "[plan](PLAN.md) and [adr](docs/adr.md) and [ext](https://x.com)",
    "PLAN.md": "# plan",
    "docs/adr.md": "back to [readme](../README.md#contributing)",
  });
  const r = run(["--root", root]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /3 ok, 0 failed, 3 total/);
});

test("exit 0 on an empty tree (self-maintaining)", () => {
  const root = makeRoot("empty", { "notes.txt": "not markdown" });
  const r = run(["--root", root]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /0 file\(s\) checked/);
});

test("exit 1 on a broken local link, naming the file and target", () => {
  const root = makeRoot("broken", {
    "README.md": "[gone](does-not-exist.md)",
  });
  const r = run(["--root", root]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /FAIL README\.md/);
  assert.match(r.stderr, /does-not-exist\.md/);
});

test("a broken link inside a code fence is NOT reported", () => {
  const root = makeRoot("fenced", {
    "README.md": ["text", "```", "[x](nope.md)", "```", "end"].join("\n"),
  });
  const r = run(["--root", root]);
  assert.equal(r.code, 0, r.stderr);
});

test("a fragment-only and external link never fail", () => {
  const root = makeRoot("skips", {
    "README.md": "[top](#top) and [site](https://example.com) and [mail](mailto:a@b.c)",
  });
  const r = run(["--root", root]);
  assert.equal(r.code, 0, r.stderr);
});

test("exit 2 on an unknown CLI argument", () => {
  const r = run(["--bogus"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /unknown argument/);
});
