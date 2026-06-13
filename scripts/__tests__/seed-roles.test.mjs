#!/usr/bin/env node
// L5.41 Zero-dependency integration tests for the seed driver:
//   scripts/seed-roles.mjs  (L3.2a — reads data/job-titles/top-200.json, POSTs
//                            each title to /api/analyze, writes the returned
//                            RoleAnalysisResult to data/roles/<slug>.json)
//
// Completes the routine-shipped-.mjs test arc: L5.39 covered the three data
// validators (the guards), L5.40 covered the ranking producer (rank-at-risk),
// and this covers the seed driver — the harness a human runs once against a
// live key (L3.2b) to produce the seed corpus the producer then ranks. It was
// the only routine-shipped .mjs script with no test.
//
// The suite never makes a live Claude call: it exercises the no-network surface
// — the argument contract (exit 2), the corpus-missing / empty-corpus guards
// (exit 1), and the --dry-run planning logic (partition into to-fetch vs.
// already-seeded, --force, --limit), which all run before the first fetch and
// return early. The driver's --corpus/--out-dir overrides (added by this leaf
// so the script matches the testability posture validate-*.mjs and
// rank-at-risk.mjs already had) point every spawn at a fresh temp dir, so the
// suite never reads or writes the repo's real data/ tree and is CWD-independent.
//
// Pure Node stdlib — node:test, node:assert, node:child_process (spawnSync, so a
// non-zero exit is assertable rather than thrown), node:fs, node:os, node:path,
// node:url. No dependencies, no `npm install`, no network, so it runs identically
// on the routine laptop and the GitHub CI runner. Run with: `npm test`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Spawn `node scripts/seed-roles.mjs ARGS...` and return its exit code + streams.
function runSeed(args = []) {
  const res = spawnSync(
    process.execPath,
    [path.join(SCRIPTS_DIR, "seed-roles.mjs"), ...args],
    { encoding: "utf8" },
  );
  assert.equal(res.error, undefined, `spawning seed-roles.mjs failed: ${res.error}`);
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

// One temp dir per run, cleaned up after.
let TMP;
before(() => {
  TMP = mkdtempSync(path.join(tmpdir(), "halflife-seed-"));
});
after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

let counter = 0;
// Write a corpus JSON ({ meta, roles }) into a fresh subdir and return its path
// plus a fresh (uncreated) out-dir path. Each call gets a unique subdir so tests
// don't collide.
function corpusFixture(roles, meta = {}) {
  const dir = path.join(TMP, `case-${counter++}`);
  mkdirSync(dir, { recursive: true });
  const corpus = path.join(dir, "corpus.json");
  const out = path.join(dir, "roles");
  writeFileSync(
    corpus,
    JSON.stringify({ meta: { generated: "2026-01-01", ...meta }, roles }, null, 2),
  );
  return { corpus, out, dir };
}

// A couple of corpus rows in the shape seed-roles reads (title + slug; the
// other top-200.json fields are ignored by the driver's planning path).
const ROWS = [
  { title: "paralegal", slug: "paralegal", rank: 1 },
  { title: "data entry clerk", slug: "data-entry-clerk", rank: 2 },
  { title: "bookkeeper", slug: "bookkeeper", rank: 3 },
];

// --- argument contract (exit 2) -------------------------------------------

test("unknown flag exits 2", () => {
  const { code, stderr } = runSeed(["--nope"]);
  assert.equal(code, 2);
  assert.match(stderr, /Unknown argument/);
});

test("--concurrency 0 exits 2", () => {
  const { code, stderr } = runSeed(["--concurrency", "0"]);
  assert.equal(code, 2);
  assert.match(stderr, /positive integer/);
});

test("--concurrency abc (non-numeric) exits 2", () => {
  const { code, stderr } = runSeed(["--concurrency", "abc"]);
  assert.equal(code, 2);
  assert.match(stderr, /positive integer/);
});

// --- corpus guards (exit 1) ------------------------------------------------

test("missing corpus exits 1 with a pointer to L3.1", () => {
  const missing = path.join(TMP, "does-not-exist.json");
  const { code, stderr } = runSeed(["--corpus", missing, "--dry-run"]);
  assert.equal(code, 1);
  assert.match(stderr, /Corpus not found/);
});

test("empty-roles corpus exits 1", () => {
  const { corpus, out } = corpusFixture([]);
  const { code, stderr } = runSeed([
    "--corpus",
    corpus,
    "--out-dir",
    out,
    "--dry-run",
  ]);
  assert.equal(code, 1);
  assert.match(stderr, /no roles/i);
});

// --- dry-run planning (exit 0, no network, no files written) ---------------

test("dry run plans every role and writes no seed files", () => {
  const { corpus, out } = corpusFixture(ROWS);
  const { code, stdout } = runSeed([
    "--corpus",
    corpus,
    "--out-dir",
    out,
    "--dry-run",
  ]);
  assert.equal(code, 0);
  assert.match(stdout, /to fetch: 3/);
  for (const r of ROWS) {
    assert.ok(
      stdout.includes(`would fetch: ${r.slug}`),
      `expected plan to include ${r.slug}`,
    );
  }
  assert.match(stdout, /Dry run — no requests made\./);
  // The out-dir is created (mkdir) but no <slug>.json is written in a dry run.
  const written = existsSync(out) ? readdirSync(out) : [];
  assert.deepEqual(written, [], `dry run must not write seed files, got ${written}`);
});

test("dry run skips already-seeded slugs and excludes them from the plan", () => {
  const { corpus, out } = corpusFixture(ROWS);
  mkdirSync(out, { recursive: true });
  // Pre-seed the first role so it counts as already done.
  writeFileSync(path.join(out, "paralegal.json"), "{}\n");

  const { code, stdout } = runSeed([
    "--corpus",
    corpus,
    "--out-dir",
    out,
    "--dry-run",
  ]);
  assert.equal(code, 0);
  assert.match(stdout, /skip\): 1/);
  assert.match(stdout, /to fetch: 2/);
  assert.ok(
    !stdout.includes("would fetch: paralegal"),
    "already-seeded slug must not appear in the fetch plan",
  );
  assert.ok(stdout.includes("would fetch: data-entry-clerk"));
});

test("--force re-plans an already-seeded slug", () => {
  const { corpus, out } = corpusFixture(ROWS);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "paralegal.json"), "{}\n");

  const { code, stdout } = runSeed([
    "--corpus",
    corpus,
    "--out-dir",
    out,
    "--force",
    "--dry-run",
  ]);
  assert.equal(code, 0);
  assert.match(stdout, /to fetch: 3/);
  assert.match(stdout, /FORCE/);
  assert.ok(
    stdout.includes("would fetch: paralegal"),
    "--force must re-plan a seeded slug",
  );
});

test("--limit N only considers the first N roles", () => {
  const { corpus, out } = corpusFixture(ROWS);
  const { code, stdout } = runSeed([
    "--corpus",
    corpus,
    "--out-dir",
    out,
    "--limit",
    "1",
    "--dry-run",
  ]);
  assert.equal(code, 0);
  assert.match(stdout, /Corpus: 1 roles/);
  assert.match(stdout, /to fetch: 1/);
  assert.ok(stdout.includes("would fetch: paralegal"));
  assert.ok(
    !stdout.includes("would fetch: data-entry-clerk"),
    "--limit 1 must not plan the second role",
  );
});

test("dry run with a fully-seeded corpus plans zero fetches", () => {
  const { corpus, out } = corpusFixture(ROWS);
  mkdirSync(out, { recursive: true });
  for (const r of ROWS) writeFileSync(path.join(out, `${r.slug}.json`), "{}\n");

  const { code, stdout } = runSeed([
    "--corpus",
    corpus,
    "--out-dir",
    out,
    "--dry-run",
  ]);
  assert.equal(code, 0);
  assert.match(stdout, /skip\): 3/);
  assert.match(stdout, /to fetch: 0/);
  assert.ok(!stdout.includes("would fetch:"), "nothing should be planned");
});
