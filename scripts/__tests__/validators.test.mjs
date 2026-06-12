#!/usr/bin/env node
// L5.39 Zero-dependency integration tests for the three data validators:
//   scripts/validate-roles.mjs       (L5.20 — seed input  data/roles/<slug>.json)
//   scripts/validate-report.mjs      (L5.23 — ranking out  data/report/most-at-risk-<YEAR>.json)
//   scripts/validate-job-titles.mjs  (L5.29 — corpus in    data/job-titles/top-200.json)
//
// These three scripts are the only thing standing between a malformed committed
// JSON file and a silent 500 on the live role/report pages (D-021/D-031) — and
// until this leaf the repo had no tests at all, so a regression in a validator
// (the guard itself going wrong) would land unnoticed. This suite spawns each
// validator as a child process against fixtures written to a fresh temp dir and
// asserts the exit-code contract every caller relies on:
//   exit 0  all valid, INCLUDING the self-maintaining empty/missing case that
//           keeps CI green through the pre-L3.2b / pre-L4.1b period
//   exit 1  one or more files invalid (malformed JSON or schema violation)
//   exit 2  bad CLI arguments
//
// Pure Node stdlib — node:test, node:assert, node:child_process, node:fs,
// node:os, node:path, node:url. No dependencies, no `npm install`, no network,
// so it runs identically on the routine laptop and the GitHub CI runner.
// Run with: `npm test` (node --test scripts/__tests__/).
//
// Fixtures pass each validator an explicit --roles/--report/--file path pointing
// at the temp dir, so the test never reads or writes the repo's real data/ tree
// and is independent of the process CWD.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Spawn `node <scripts/NAME> ARGS...` and return its exit code + streams.
// spawnSync does not throw on a non-zero exit, so the code is assertable.
function runValidator(name, args = []) {
  const res = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, name), ...args], {
    encoding: "utf8",
  });
  assert.equal(res.error, undefined, `spawning ${name} failed: ${res.error}`);
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

// One temp dir per run, cleaned up after. Each helper writes a fixture file into
// it and returns the path to hand to the validator under test.
let TMP;
before(() => {
  TMP = mkdtempSync(path.join(tmpdir(), "halflife-validators-"));
});
after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function writeFixture(relPath, contents) {
  const full = path.join(TMP, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, typeof contents === "string" ? contents : JSON.stringify(contents, null, 2));
  return full;
}

// ---- canonical valid payloads (mirror the contracts in each validator) -------

const VALID_ROLE = {
  input_title: "paralegal",
  normalized_title: "Paralegal",
  score: 35,
  countdown_years: 6,
  ai_tools: [{ name: "Harvey", vendor: "Harvey AI", what_it_automates: "contract review" }],
  pivot_steps: ["Specialize in litigation support that needs human judgment"],
  confidence: "medium",
  sources_hint: ["BLS Occupational Outlook Handbook"],
  methodology_version: 1,
  prompt_version: 1,
};

const VALID_REPORT = {
  meta: {
    report_year: 2026,
    title: "Most At-Risk Roles 2026",
    generated_at: "2026-06-01T00:00:00.000Z",
    total_seeded: 2,
    ranked: 2,
    ranking_key: ["score", "countdown_years", "title"],
    source: "data/roles/*.json",
  },
  roles: [
    { rank: 1, slug: "data-entry-clerk", title: "data entry clerk", score: 10, band: "Urgent", countdown_years: 2, confidence: "high" },
    { rank: 2, slug: "paralegal", title: "paralegal", score: 35, band: "At-risk", countdown_years: 6, confidence: "medium" },
  ],
};

const VALID_CORPUS = {
  meta: { generated: "2026-05-15", candidate_count: 3, top_n: 2, volume_source: "curated-interim" },
  roles: [
    { title: "account executive", slug: "account-executive", volume: 0, difficulty: null, cpc: null, rank: 1 },
    { title: "account manager", slug: "account-manager", volume: 0, difficulty: null, cpc: null, rank: 2 },
  ],
};

// ---- validate-roles.mjs ------------------------------------------------------

test("validate-roles: a valid seed file exits 0", () => {
  const dir = path.join(TMP, "roles-valid");
  writeFixture("roles-valid/paralegal.json", VALID_ROLE);
  const { code } = runValidator("validate-roles.mjs", ["--roles", dir, "--quiet"]);
  assert.equal(code, 0);
});

test("validate-roles: a missing directory exits 0 (self-maintaining pre-seed)", () => {
  const { code, stdout } = runValidator("validate-roles.mjs", [
    "--roles", path.join(TMP, "roles-does-not-exist"),
  ]);
  assert.equal(code, 0);
  assert.match(stdout, /0 file\(s\) validated/);
});

test("validate-roles: an empty directory exits 0", () => {
  const dir = path.join(TMP, "roles-empty");
  mkdirSync(dir, { recursive: true });
  const { code } = runValidator("validate-roles.mjs", ["--roles", dir]);
  assert.equal(code, 0);
});

test("validate-roles: a schema-invalid file exits 1", () => {
  const dir = path.join(TMP, "roles-badscore");
  writeFixture("roles-badscore/paralegal.json", { ...VALID_ROLE, score: 150 });
  const { code, stderr } = runValidator("validate-roles.mjs", ["--roles", dir]);
  assert.equal(code, 1);
  assert.match(stderr, /score=150 out of \[0,100\]/);
});

test("validate-roles: malformed JSON exits 1", () => {
  const dir = path.join(TMP, "roles-malformed");
  writeFixture("roles-malformed/paralegal.json", "{ not valid json ");
  const { code, stderr } = runValidator("validate-roles.mjs", ["--roles", dir]);
  assert.equal(code, 1);
  assert.match(stderr, /invalid JSON/);
});

test("validate-roles: a missing required field exits 1", () => {
  const dir = path.join(TMP, "roles-missing");
  const broken = { ...VALID_ROLE };
  delete broken.pivot_steps;
  writeFixture("roles-missing/paralegal.json", broken);
  const { code, stderr } = runValidator("validate-roles.mjs", ["--roles", dir]);
  assert.equal(code, 1);
  assert.match(stderr, /pivot_steps/);
});

test("validate-roles: an unknown flag exits 2", () => {
  const { code } = runValidator("validate-roles.mjs", ["--bogus"]);
  assert.equal(code, 2);
});

// ---- validate-report.mjs -----------------------------------------------------

test("validate-report: a valid ranking artifact exits 0", () => {
  const dir = path.join(TMP, "report-valid");
  writeFixture("report-valid/most-at-risk-2026.json", VALID_REPORT);
  const { code } = runValidator("validate-report.mjs", ["--report", dir, "--year", "2026", "--quiet"]);
  assert.equal(code, 0);
});

test("validate-report: a missing artifact exits 0 (self-maintaining pre-L4.1b)", () => {
  const { code, stdout } = runValidator("validate-report.mjs", [
    "--report", path.join(TMP, "report-missing"), "--year", "2026",
  ]);
  assert.equal(code, 0);
  assert.match(stdout, /0 file\(s\) validated/);
});

test("validate-report: a band that disagrees with its score exits 1", () => {
  const dir = path.join(TMP, "report-badband");
  const broken = structuredClone(VALID_REPORT);
  broken.roles[0].band = "Stable"; // score 10 must be Urgent
  writeFixture("report-badband/most-at-risk-2026.json", broken);
  const { code, stderr } = runValidator("validate-report.mjs", ["--report", dir, "--year", "2026"]);
  assert.equal(code, 1);
  assert.match(stderr, /band=Stable does not match score=10/);
});

test("validate-report: meta.ranked != roles.length exits 1", () => {
  const dir = path.join(TMP, "report-count");
  const broken = structuredClone(VALID_REPORT);
  broken.meta.ranked = 5;
  writeFixture("report-count/most-at-risk-2026.json", broken);
  const { code, stderr } = runValidator("validate-report.mjs", ["--report", dir, "--year", "2026"]);
  assert.equal(code, 1);
  assert.match(stderr, /meta\.ranked=5 != roles\.length=2/);
});

test("validate-report: a non-integer --year exits 2", () => {
  const { code } = runValidator("validate-report.mjs", ["--year", "not-a-year"]);
  assert.equal(code, 2);
});

// ---- validate-job-titles.mjs -------------------------------------------------

test("validate-job-titles: a valid corpus exits 0", () => {
  const file = writeFixture("corpus-valid/top-200.json", VALID_CORPUS);
  const { code } = runValidator("validate-job-titles.mjs", ["--file", file, "--quiet"]);
  assert.equal(code, 0);
});

test("validate-job-titles: a missing file exits 0 (self-maintaining)", () => {
  const { code, stdout } = runValidator("validate-job-titles.mjs", [
    "--file", path.join(TMP, "corpus-missing", "top-200.json"),
  ]);
  assert.equal(code, 0);
  assert.match(stdout, /0 file\(s\) validated/);
});

test("validate-job-titles: a slug that does not match slugify(title) exits 1", () => {
  const broken = structuredClone(VALID_CORPUS);
  broken.roles[0].slug = "account-exec"; // != slugify("account executive")
  const file = writeFixture("corpus-badslug/top-200.json", broken);
  const { code, stderr } = runValidator("validate-job-titles.mjs", ["--file", file]);
  assert.equal(code, 1);
  assert.match(stderr, /does not match slugify\(title\)/);
});

test("validate-job-titles: meta.top_n != roles.length exits 1", () => {
  const broken = structuredClone(VALID_CORPUS);
  broken.meta.top_n = 99;
  const file = writeFixture("corpus-topn/top-200.json", broken);
  const { code, stderr } = runValidator("validate-job-titles.mjs", ["--file", file]);
  assert.equal(code, 1);
  assert.match(stderr, /meta\.top_n=99 != roles\.length=2/);
});

test("validate-job-titles: an unknown flag exits 2", () => {
  const { code } = runValidator("validate-job-titles.mjs", ["--bogus"]);
  assert.equal(code, 2);
});
