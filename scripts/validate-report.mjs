#!/usr/bin/env node
// L5.23 Pre-commit schema validator for data/report/most-at-risk-<YEAR>.json.
//
// app/report/2026/page.tsx (L4.2/D-031) does `JSON.parse(raw) as ReportPayload`
// with no runtime check, then maps over `parsed.roles` to render the survival
// bar chart, links, and aria-meter values. A field missing or the wrong type
// therefore lands as a silent 500 on /report/2026 — neither caught by
// `npm run build` (TS only checks the shape *we wrote*, not the shape of
// arbitrary JSON on disk) nor by scripts/validate-roles.mjs (L5.20) which
// covers the seed input, not the ranked artifact.
//
// This script walks data/report/most-at-risk-<YEAR>.json and verifies the
// payload matches the shape scripts/rank-at-risk.mjs (L4.1a) emits:
//   - meta.{report_year:int, title:string, generated_at:ISO-8601, total_seeded:int,
//          ranked:int, ranking_key:string[], source:string, note?:string}
//   - roles: array of { rank:int>=1, slug:string, title:string,
//                       score:[0,100], band ∈ Urgent|At-risk|Contested|Durable|Stable,
//                       countdown_years:number>=0,
//                       confidence ∈ low|medium|high|unknown }
// Plus the cross-checks the producer guarantees and the consumer assumes:
//   - meta.ranked === roles.length
//   - meta.total_seeded >= meta.ranked   (--top can drop rows, never add)
//   - ranks are 1..N contiguous (rank-at-risk.mjs emits .map((r,i) => ({rank:i+1,...})))
//   - band matches the 0-20-40-60-80 threshold for its score (duplicated
//     locally — same scope call as D-029: a stdlib script must not import
//     a "use client" React component)
//   - slugs are unique (a duplicate would silently overwrite the React key
//     in app/report/2026/page.tsx's <li key={r.slug}>)
//
// Self-maintaining like scripts/rank-at-risk.mjs (L4.1a) and
// scripts/validate-roles.mjs (L5.20) — a missing data/report/ or a missing
// most-at-risk-<YEAR>.json exits 0 with "0 file(s) validated", so a CI hook
// stays green through the pre-L4.1b period when no ranking artifact exists.
//
// Pure Node stdlib (node:fs, node:path) — no dependencies, respects the
// no-`npm install` routine rule. Node >= 18. Makes NO network calls.
//
// Usage:
//   node scripts/validate-report.mjs [--report DIR] [--year N] [--quiet]
//
//   --report DIR  report directory (default data/report)
//   --year N      report year (default 2026 — matches L4.1a REPORT_YEAR)
//   --quiet       suppress the per-file OK line; print only summary + errors
//
// Exit codes: 0 all valid (including the empty case), 1 invalid, 2 bad args.

import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_YEAR = 2026;
const BAND_VALUES = ["Urgent", "At-risk", "Contested", "Durable", "Stable"];
const CONFIDENCE_VALUES = new Set(["low", "medium", "high", "unknown"]);

function parseArgs(argv) {
  const opts = { report: "data/report", year: DEFAULT_YEAR, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--report") opts.report = argv[++i];
    else if (a === "--year") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1900 || n > 9999) {
        console.error(`--year expects a 4-digit integer, got: ${argv[i]}`);
        process.exit(2);
      }
      opts.year = n;
    } else if (a === "--quiet") opts.quiet = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonNegativeInteger(v) {
  return Number.isInteger(v) && v >= 0;
}

// Duplicated from scripts/rank-at-risk.mjs bandFor() — same deliberate scope
// control as D-029 (a stdlib validator must not import a "use client"
// React component, and the producer is itself a standalone stdlib script).
function bandFor(score) {
  if (score < 20) return "Urgent";
  if (score < 40) return "At-risk";
  if (score < 60) return "Contested";
  if (score < 80) return "Durable";
  return "Stable";
}

function validateMeta(meta, expectedYear, errs) {
  if (meta === null || typeof meta !== "object") {
    errs.push("meta missing or not an object");
    return;
  }
  if (meta.report_year !== expectedYear) {
    errs.push(`meta.report_year expected ${expectedYear}, got ${JSON.stringify(meta.report_year)}`);
  }
  if (!isNonEmptyString(meta.title)) errs.push("meta.title missing or empty");
  if (!isNonEmptyString(meta.generated_at)) {
    errs.push("meta.generated_at missing or empty");
  } else if (Number.isNaN(new Date(meta.generated_at).getTime())) {
    errs.push(`meta.generated_at is not a valid date: ${JSON.stringify(meta.generated_at)}`);
  }
  if (!isNonNegativeInteger(meta.total_seeded)) {
    errs.push(`meta.total_seeded missing or not a non-negative integer (got: ${JSON.stringify(meta.total_seeded)})`);
  }
  if (!isNonNegativeInteger(meta.ranked)) {
    errs.push(`meta.ranked missing or not a non-negative integer (got: ${JSON.stringify(meta.ranked)})`);
  }
  if (!Array.isArray(meta.ranking_key)) {
    errs.push("meta.ranking_key missing or not an array");
  } else if (meta.ranking_key.length === 0) {
    errs.push("meta.ranking_key is empty");
  } else {
    meta.ranking_key.forEach((s, i) => {
      if (!isNonEmptyString(s)) errs.push(`meta.ranking_key[${i}] not a non-empty string`);
    });
  }
  if (!isNonEmptyString(meta.source)) errs.push("meta.source missing or empty");
  if (meta.note !== undefined && !isNonEmptyString(meta.note)) {
    errs.push("meta.note present but not a non-empty string");
  }
}

function validateRoleRow(row, idx, errs) {
  if (row === null || typeof row !== "object") {
    errs.push(`roles[${idx}] is not an object`);
    return;
  }
  if (!isNonNegativeInteger(row.rank) || row.rank < 1) {
    errs.push(`roles[${idx}].rank not a positive integer (got: ${JSON.stringify(row.rank)})`);
  }
  if (!isNonEmptyString(row.slug)) errs.push(`roles[${idx}].slug missing or empty`);
  if (!isNonEmptyString(row.title)) errs.push(`roles[${idx}].title missing or empty`);

  let scoreOk = false;
  if (!isFiniteNumber(row.score)) {
    errs.push(`roles[${idx}].score missing or not a finite number`);
  } else if (row.score < 0 || row.score > 100) {
    errs.push(`roles[${idx}].score=${row.score} out of [0,100]`);
  } else {
    scoreOk = true;
  }

  if (!isFiniteNumber(row.countdown_years)) {
    errs.push(`roles[${idx}].countdown_years missing or not a finite number`);
  } else if (row.countdown_years < 0) {
    errs.push(`roles[${idx}].countdown_years=${row.countdown_years} is negative`);
  }

  if (typeof row.confidence !== "string" || !CONFIDENCE_VALUES.has(row.confidence)) {
    errs.push(`roles[${idx}].confidence not one of low|medium|high|unknown (got: ${JSON.stringify(row.confidence)})`);
  }

  if (!isNonEmptyString(row.band) || !BAND_VALUES.includes(row.band)) {
    errs.push(`roles[${idx}].band not one of ${BAND_VALUES.join("|")} (got: ${JSON.stringify(row.band)})`);
  } else if (scoreOk) {
    const expectedBand = bandFor(row.score);
    if (row.band !== expectedBand) {
      errs.push(`roles[${idx}].band=${row.band} does not match score=${row.score} (expected ${expectedBand})`);
    }
  }
}

// Validate one parsed report payload. Returns an array of error strings
// (empty = valid).
function validatePayload(payload, expectedYear) {
  const errs = [];
  if (payload === null || typeof payload !== "object") {
    return ["root is not an object"];
  }

  validateMeta(payload.meta, expectedYear, errs);

  if (!Array.isArray(payload.roles)) {
    errs.push("roles missing or not an array");
    return errs;
  }

  payload.roles.forEach((row, i) => validateRoleRow(row, i, errs));

  // Cross-checks (only meaningful if individual rows parsed clean enough).
  if (payload.meta && typeof payload.meta === "object") {
    if (
      isNonNegativeInteger(payload.meta.ranked) &&
      payload.meta.ranked !== payload.roles.length
    ) {
      errs.push(
        `meta.ranked=${payload.meta.ranked} != roles.length=${payload.roles.length}`,
      );
    }
    if (
      isNonNegativeInteger(payload.meta.total_seeded) &&
      isNonNegativeInteger(payload.meta.ranked) &&
      payload.meta.total_seeded < payload.meta.ranked
    ) {
      errs.push(
        `meta.total_seeded=${payload.meta.total_seeded} < meta.ranked=${payload.meta.ranked}`,
      );
    }
  }

  // Ranks 1..N contiguous (rank-at-risk.mjs guarantees this; consumer doesn't
  // re-sort, so a gap would render as a numbering jump in the UI).
  const ranks = payload.roles
    .map((r) => (Number.isInteger(r?.rank) ? r.rank : null))
    .filter((n) => n !== null)
    .sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) {
      errs.push(`ranks are not 1..${payload.roles.length} contiguous (saw ${ranks[i]} at position ${i + 1})`);
      break;
    }
  }

  // Unique slugs (React key on <li key={r.slug}> in app/report/2026/page.tsx).
  const seenSlugs = new Set();
  for (const row of payload.roles) {
    if (!isNonEmptyString(row?.slug)) continue;
    if (seenSlugs.has(row.slug)) {
      errs.push(`duplicate slug: ${row.slug}`);
    } else {
      seenSlugs.add(row.slug);
    }
  }

  return errs;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const fileName = `most-at-risk-${opts.year}.json`;
  const filePath = path.join(opts.report, fileName);

  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    // Legitimate pre-L4.1b state — the artifact does not exist yet because
    // the human-gated seed pass (L3.2b) and the post-seed ranking (L4.1b)
    // have not run. Self-maintaining: stays green until the file lands.
    console.log(`[validate-report] 0 file(s) validated (${filePath} does not exist)`);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`FAIL ${filePath}`);
    console.error(`     - invalid JSON: ${e.message}`);
    console.log(`[validate-report] 0 ok, 1 failed, 1 total`);
    process.exit(1);
  }

  const errs = validatePayload(parsed, opts.year);
  if (errs.length === 0) {
    if (!opts.quiet) console.log(`  ok  ${filePath}`);
    console.log(`[validate-report] 1 ok, 0 failed, 1 total`);
    return;
  }

  console.error(`FAIL ${filePath}`);
  for (const e of errs) console.error(`     - ${e}`);
  console.log(`[validate-report] 0 ok, 1 failed, 1 total`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
