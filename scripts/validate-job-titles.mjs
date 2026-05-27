#!/usr/bin/env node
// L5.29 Pre-commit schema validator for data/job-titles/top-200.json — the
// L3.1a curated corpus (and the L3.1b post-rerank target) that
// scripts/seed-roles.mjs reads to drive the human-gated L3.2b seed pass.
// Parallel to scripts/validate-roles.mjs (L5.20, seed input) and
// scripts/validate-report.mjs (L5.23, ranking output); this is the
// pre-seed corpus validator that closes the third edge of the
// input → seed → ranking triangle.
//
// Pure Node stdlib (node:fs, node:path), no deps/network/`npm install`.
// Self-maintaining: a missing file exits 0 (same pre-L3.2b posture as the
// sibling validators). Exit 0 ok, 1 invalid, 2 bad args.

import { promises as fs } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const opts = { file: "data/job-titles/top-200.json", quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") opts.file = argv[++i];
    else if (a === "--quiet") opts.quiet = true;
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

// scripts/seed-roles.mjs slugifies each title with this exact pattern (kebab,
// alnum-only, no leading/trailing dash); a row whose committed slug does not
// match this derivation is a silent /role/<slug> mismatch waiting to happen.
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateRole(r, idx, expectedRank, slugSeen, errs) {
  if (r === null || typeof r !== "object") {
    errs.push(`roles[${idx}] is not an object`);
    return;
  }
  if (!isNonEmptyString(r.title)) errs.push(`roles[${idx}].title missing or empty`);
  if (!isNonEmptyString(r.slug)) {
    errs.push(`roles[${idx}].slug missing or empty`);
  } else {
    if (isNonEmptyString(r.title) && slugify(r.title) !== r.slug) {
      errs.push(`roles[${idx}].slug=${JSON.stringify(r.slug)} does not match slugify(title)=${JSON.stringify(slugify(r.title))}`);
    }
    if (slugSeen.has(r.slug)) {
      errs.push(`roles[${idx}].slug=${JSON.stringify(r.slug)} duplicated`);
    } else {
      slugSeen.add(r.slug);
    }
  }
  if (!isFiniteNumber(r.volume) || r.volume < 0) {
    errs.push(`roles[${idx}].volume missing or negative (got: ${JSON.stringify(r.volume)})`);
  }
  // difficulty/cpc are nullable: corgi-keywords returns null in stub mode and
  // for keywords the API has no signal on; both are optional ranking inputs.
  if (r.difficulty !== null && !isFiniteNumber(r.difficulty)) {
    errs.push(`roles[${idx}].difficulty must be null or a finite number (got: ${JSON.stringify(r.difficulty)})`);
  }
  if (r.cpc !== null && !isFiniteNumber(r.cpc)) {
    errs.push(`roles[${idx}].cpc must be null or a finite number (got: ${JSON.stringify(r.cpc)})`);
  }
  if (!isFiniteNumber(r.rank) || r.rank !== expectedRank) {
    errs.push(`roles[${idx}].rank expected ${expectedRank}, got ${JSON.stringify(r.rank)}`);
  }
}

function validateCorpus(payload) {
  const errs = [];
  if (payload === null || typeof payload !== "object") {
    return ["root is not an object"];
  }
  const m = payload.meta;
  if (m === null || typeof m !== "object") {
    errs.push("meta missing or not an object");
  } else {
    if (!isNonEmptyString(m.generated)) errs.push("meta.generated missing or empty");
    if (!isFiniteNumber(m.candidate_count) || m.candidate_count < 0) {
      errs.push("meta.candidate_count missing or negative");
    }
    if (!isFiniteNumber(m.top_n) || m.top_n < 0) {
      errs.push("meta.top_n missing or negative");
    }
    if (!isNonEmptyString(m.volume_source)) errs.push("meta.volume_source missing or empty");
  }

  if (!Array.isArray(payload.roles)) {
    errs.push("roles missing or not an array");
    return errs;
  }
  const slugSeen = new Set();
  payload.roles.forEach((r, i) => validateRole(r, i, i + 1, slugSeen, errs));

  // Producer-guaranteed cross-check: meta.top_n === roles.length (the
  // file's whole purpose is the top-N slice; a mismatch means the writer
  // and the consumer disagree on N).
  if (m && isFiniteNumber(m.top_n) && Array.isArray(payload.roles) && m.top_n !== payload.roles.length) {
    errs.push(`meta.top_n=${m.top_n} != roles.length=${payload.roles.length}`);
  }
  if (m && isFiniteNumber(m.candidate_count) && Array.isArray(payload.roles) && m.candidate_count < payload.roles.length) {
    errs.push(`meta.candidate_count=${m.candidate_count} < roles.length=${payload.roles.length} (candidate pool cannot be smaller than the ranked slice)`);
  }
  return errs;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let raw;
  try {
    raw = await fs.readFile(opts.file, "utf8");
  } catch {
    console.log(`[validate-job-titles] 0 file(s) validated (${opts.file} does not exist)`);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`FAIL ${opts.file}`);
    console.error(`     - invalid JSON: ${e.message}`);
    process.exit(1);
  }

  const errs = validateCorpus(parsed);
  if (errs.length > 0) {
    console.error(`FAIL ${opts.file}`);
    for (const e of errs) console.error(`     - ${e}`);
    console.log(`[validate-job-titles] 0 ok, 1 failed, 1 total`);
    process.exit(1);
  }

  if (!opts.quiet) console.log(`  ok  ${opts.file}`);
  console.log(`[validate-job-titles] 1 ok, 0 failed, 1 total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
