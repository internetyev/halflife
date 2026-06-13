#!/usr/bin/env node
// L5.40 Zero-dependency integration tests for the ranking producer:
//   scripts/rank-at-risk.mjs  (L4.1a — reads data/roles/<slug>.json seed files,
//                              writes data/report/most-at-risk-<YEAR>.{json,csv})
//
// L5.39 tested the three data validators (the guards). This tests the producer
// whose output one of those guards (validate-report.mjs, L5.23) checks: the
// rank-at-risk driver that turns the human-gated seed corpus (L3.2b) into the
// annual ranking the report page reads (L4.2/D-031). Until this leaf the
// producer's ranking math — the sort key, the 5-band threshold table duplicated
// from components/result-card.tsx (D-031), the --top slice, the CSV escaping,
// the contiguous 1..N rank numbering, and the self-maintaining zero-seed case —
// had no test, so a regression in the ranking logic (e.g. a flipped sort
// comparator that put the *least* at-risk role first, or a band label drifting
// out of sync with the role page) would land in the launch report unnoticed.
//
// The suite spawns rank-at-risk.mjs as a child process against seed fixtures
// written to a fresh temp dir, points --roles/--out-dir at that dir, and asserts
// both the exit code and the actual written JSON/CSV. spawnSync does not throw on
// a non-zero exit, so exit codes are assertable. Pure Node stdlib — node:test,
// node:assert, node:child_process, node:fs, node:os, node:path, node:url. No
// dependencies, no `npm install`, no network, so it runs identically on the
// routine laptop and the GitHub CI runner. Run with: `npm test`.
//
// Every test passes an explicit --roles/--out-dir into the temp dir, so the
// suite never reads or writes the repo's real data/ tree and is independent of
// the process CWD.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_YEAR = 2026; // mirrors the REPORT_YEAR const in rank-at-risk.mjs

// Spawn `node scripts/rank-at-risk.mjs ARGS...` and return its exit code + streams.
function runRank(args = []) {
  const res = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, "rank-at-risk.mjs"), ...args], {
    encoding: "utf8",
  });
  assert.equal(res.error, undefined, `spawning rank-at-risk.mjs failed: ${res.error}`);
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

// One temp dir per run, cleaned up after.
let TMP;
before(() => {
  TMP = mkdtempSync(path.join(tmpdir(), "halflife-rank-"));
});
after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// Write a minimal seed file (a RoleAnalysisResult — only the fields readSeed()
// reads matter for ranking) into a fresh roles dir; returns { roles, out }.
function seedDir(name, files) {
  const roles = path.join(TMP, name, "roles");
  const out = path.join(TMP, name, "report");
  mkdirSync(roles, { recursive: true });
  for (const [slug, fields] of Object.entries(files)) {
    writeFileSync(path.join(roles, `${slug}.json`), JSON.stringify(fields, null, 2));
  }
  return { roles, out };
}

function seed(normalized_title, score, countdown_years, confidence = "medium") {
  return { normalized_title, score, countdown_years, confidence };
}

function readReportJson(out) {
  return JSON.parse(readFileSync(path.join(out, `most-at-risk-${REPORT_YEAR}.json`), "utf8"));
}
function readReportCsv(out) {
  return readFileSync(path.join(out, `most-at-risk-${REPORT_YEAR}.csv`), "utf8");
}

// ---- the self-maintaining zero-seed case (pre-L3.2b) -------------------------

test("a missing roles directory exits 0 and writes an empty-but-correct ranking", () => {
  const out = path.join(TMP, "missing", "report");
  const { code, stdout } = runRank(["--roles", path.join(TMP, "missing", "roles-absent"), "--out-dir", out]);
  assert.equal(code, 0);
  assert.match(stdout, /seeded=0 ranked=0/);
  const report = readReportJson(out);
  assert.equal(report.meta.total_seeded, 0);
  assert.equal(report.meta.ranked, 0);
  assert.deepEqual(report.roles, []);
  assert.match(report.meta.note, /No seed data yet/);
});

test("a populated ranking has no note field", () => {
  const { roles, out } = seedDir("hasnote", { paralegal: seed("Paralegal", 35, 6) });
  const { code } = runRank(["--roles", roles, "--out-dir", out]);
  assert.equal(code, 0);
  assert.equal(readReportJson(out).meta.note, undefined);
});

// ---- ranking order: score asc, then countdown asc, then title asc ------------

test("roles are ranked most-at-risk first (lowest score first)", () => {
  const { roles, out } = seedDir("order", {
    "durable-role": seed("Durable Role", 75, 11),
    "urgent-role": seed("Urgent Role", 12, 1),
    "midrange-role": seed("Midrange Role", 45, 5),
  });
  const { code, stdout } = runRank(["--roles", roles, "--out-dir", out]);
  assert.equal(code, 0);
  const report = readReportJson(out);
  assert.deepEqual(
    report.roles.map((r) => r.title),
    ["Urgent Role", "Midrange Role", "Durable Role"],
  );
  // ranks are contiguous 1..N in emitted order
  assert.deepEqual(report.roles.map((r) => r.rank), [1, 2, 3]);
  assert.match(stdout, /most-at-risk=Urgent Role \(12\)/);
});

test("countdown_years breaks a score tie, then title breaks a countdown tie", () => {
  const { roles, out } = seedDir("ties", {
    "zebra-role": seed("Zebra Role", 50, 5), // same score+countdown as alpha → title tiebreak
    "alpha-role": seed("Alpha Role", 50, 5),
    "sooner-role": seed("Sooner Role", 50, 3), // same score, sooner countdown → ranks first
  });
  const { code } = runRank(["--roles", roles, "--out-dir", out]);
  assert.equal(code, 0);
  assert.deepEqual(
    readReportJson(out).roles.map((r) => r.title),
    ["Sooner Role", "Alpha Role", "Zebra Role"],
  );
});

// ---- band labels mirror components/result-card.tsx bandFor() (D-031) ----------

test("each score maps to the band threshold table (Urgent/At-risk/Contested/Durable/Stable)", () => {
  const { roles, out } = seedDir("bands", {
    "a-urgent": seed("A Urgent", 0, 1),
    "b-urgent-edge": seed("B Urgent Edge", 19, 1),
    "c-atrisk-edge": seed("C Atrisk Edge", 20, 2),
    "d-contested-edge": seed("D Contested Edge", 40, 4),
    "e-durable-edge": seed("E Durable Edge", 60, 7),
    "f-stable-edge": seed("F Stable Edge", 80, 12),
    "g-stable-max": seed("G Stable Max", 100, 20),
  });
  const { code } = runRank(["--roles", roles, "--out-dir", out]);
  assert.equal(code, 0);
  const bandBySlug = Object.fromEntries(readReportJson(out).roles.map((r) => [r.slug, r.band]));
  assert.equal(bandBySlug["a-urgent"], "Urgent");
  assert.equal(bandBySlug["b-urgent-edge"], "Urgent");
  assert.equal(bandBySlug["c-atrisk-edge"], "At-risk");
  assert.equal(bandBySlug["d-contested-edge"], "Contested");
  assert.equal(bandBySlug["e-durable-edge"], "Durable");
  assert.equal(bandBySlug["f-stable-edge"], "Stable");
  assert.equal(bandBySlug["g-stable-max"], "Stable");
});

// ---- --top slicing keeps the N most at-risk, total_seeded stays the full count

test("--top N keeps only the N most at-risk rows but reports the full seeded count", () => {
  const { roles, out } = seedDir("top", {
    "role-a": seed("Role A", 10, 1),
    "role-b": seed("Role B", 30, 3),
    "role-c": seed("Role C", 50, 5),
    "role-d": seed("Role D", 70, 9),
  });
  const { code } = runRank(["--roles", roles, "--out-dir", out, "--top", "2"]);
  assert.equal(code, 0);
  const report = readReportJson(out);
  assert.equal(report.meta.total_seeded, 4);
  assert.equal(report.meta.ranked, 2);
  assert.equal(report.roles.length, 2);
  assert.deepEqual(report.roles.map((r) => r.title), ["Role A", "Role B"]);
});

// ---- CSV output: header, CRLF, escaping --------------------------------------

test("CSV output has the fixed header, CRLF line endings, and one row per ranked role", () => {
  const { roles, out } = seedDir("csv", {
    "role-x": seed("Role X", 22, 3, "high"),
    "role-y": seed("Role Y", 44, 5, "low"),
  });
  const { code } = runRank(["--roles", roles, "--out-dir", out]);
  assert.equal(code, 0);
  const csv = readReportCsv(out);
  assert.ok(csv.includes("\r\n"), "CSV uses CRLF");
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines[0], "rank,slug,title,score,band,countdown_years,confidence");
  assert.equal(lines.length, 3); // header + 2 rows
  assert.match(lines[1], /^1,role-x,Role X,22,At-risk,3,high$/);
});

test("a title containing a comma is double-quoted in the CSV", () => {
  const { roles, out } = seedDir("csvquote", {
    "compliance-officer": seed("Compliance Officer, Senior", 33, 4),
  });
  const { code } = runRank(["--roles", roles, "--out-dir", out]);
  assert.equal(code, 0);
  assert.match(readReportCsv(out), /"Compliance Officer, Senior"/);
});

// ---- skip-on-bad-input: malformed / non-numeric seed files are dropped --------

test("a malformed or non-numeric seed file is skipped, valid siblings still rank", () => {
  const { roles, out } = seedDir("skip", {
    "good-role": seed("Good Role", 25, 3),
    "missing-score": { normalized_title: "Missing Score" }, // no numeric score → skipped
  });
  writeFileSync(path.join(roles, "broken.json"), "{ not valid json "); // → skipped
  const { code, stderr } = runRank(["--roles", roles, "--out-dir", out]);
  assert.equal(code, 0);
  const report = readReportJson(out);
  assert.equal(report.meta.total_seeded, 1);
  assert.deepEqual(report.roles.map((r) => r.title), ["Good Role"]);
  assert.match(stderr, /skip: broken\.json is not valid JSON/);
  assert.match(stderr, /skip: missing-score\.json missing numeric/);
});

// ---- --dry-run writes nothing ------------------------------------------------

test("--dry-run prints the summary but writes no files", () => {
  const { roles, out } = seedDir("dry", { paralegal: seed("Paralegal", 35, 6) });
  const { code, stdout } = runRank(["--roles", roles, "--out-dir", out, "--dry-run"]);
  assert.equal(code, 0);
  assert.match(stdout, /--dry-run: no files written/);
  assert.equal(existsSync(path.join(out, `most-at-risk-${REPORT_YEAR}.json`)), false);
  assert.equal(existsSync(path.join(out, `most-at-risk-${REPORT_YEAR}.csv`)), false);
});

// ---- argument contract -------------------------------------------------------

test("an unknown flag exits 2", () => {
  const { code } = runRank(["--bogus"]);
  assert.equal(code, 2);
});

test("--top with a non-positive-integer value exits 2", () => {
  assert.equal(runRank(["--top", "0"]).code, 2);
  assert.equal(runRank(["--top", "-3"]).code, 2);
  assert.equal(runRank(["--top", "abc"]).code, 2);
});
