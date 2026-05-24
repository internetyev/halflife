#!/usr/bin/env node
// L5.20 Pre-commit schema validator for data/roles/<slug>.json.
//
// app/role/[slug]/page.tsx (D-021) does `JSON.parse(raw) as RoleAnalysisResult`
// with no runtime check, then hands the result straight to ResultCard,
// serializeRoleJsonLd, and the metadata builder. A field missing or the wrong
// type therefore lands as a silent 500 on the role page or a corrupt JSON-LD
// graph in production — neither caught by `npm run build` (TS only checks the
// shape *we wrote*, not the shape of arbitrary JSON on disk).
//
// This script walks data/roles/*.json and verifies each one matches the
// RoleAnalysisResult contract in lib/scoring/types.ts (D-010): every required
// field present, every type right, score in [0,100], countdown_years >= 0,
// confidence in the enum, methodology_version + prompt_version pinned to 1.
// It also flags the seed-write invariant that file `<slug>.json` is the slug
// the URL/sitemap (D-021/D-027) would render — a renamed file that no longer
// matches its `input_title` is a silent /role/<slug>→404 trap.
//
// Self-maintaining like app/sitemap.ts (L3.3) and scripts/rank-at-risk.mjs
// (L4.1a) — an empty data/roles/ exits 0 with "0 file(s) validated", so a
// CI/pre-merge hook can run this from day one and stays green through the
// pre-L3.2b period when no seed JSON exists yet.
//
// Pure Node stdlib (node:fs, node:path) — no dependencies, respects the
// no-`npm install` routine rule. Node >= 18. Makes NO network calls.
//
// Usage:
//   node scripts/validate-roles.mjs [--roles DIR] [--quiet]
//
//   --roles DIR  seed directory (default data/roles)
//   --quiet      suppress per-file OK lines; print only the summary + errors
//
// Exit codes: 0 all valid (including the empty case), 1 one or more invalid,
// 2 bad args.

import { promises as fs } from "node:fs";
import path from "node:path";

const CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);
const METHODOLOGY_VERSION = 1;
const PROMPT_VERSION = 1;

function parseArgs(argv) {
  const opts = { roles: "data/roles", quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--roles") opts.roles = argv[++i];
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

function validateAiTool(t, idx, errs) {
  if (t === null || typeof t !== "object") {
    errs.push(`ai_tools[${idx}] is not an object`);
    return;
  }
  if (!isNonEmptyString(t.name)) errs.push(`ai_tools[${idx}].name missing or empty`);
  if (!isNonEmptyString(t.vendor)) errs.push(`ai_tools[${idx}].vendor missing or empty`);
  if (!isNonEmptyString(t.what_it_automates)) {
    errs.push(`ai_tools[${idx}].what_it_automates missing or empty`);
  }
}

// Validate one parsed JSON object against the RoleAnalysisResult contract.
// Returns an array of human-readable error strings (empty = valid).
function validateResult(r, fileSlug) {
  const errs = [];
  if (r === null || typeof r !== "object") {
    return ["root is not an object"];
  }

  if (!isNonEmptyString(r.input_title)) errs.push("input_title missing or empty");
  if (!isNonEmptyString(r.normalized_title)) errs.push("normalized_title missing or empty");

  if (!isFiniteNumber(r.score)) {
    errs.push("score missing or not a finite number");
  } else if (r.score < 0 || r.score > 100) {
    errs.push(`score=${r.score} out of [0,100]`);
  }

  if (!isFiniteNumber(r.countdown_years)) {
    errs.push("countdown_years missing or not a finite number");
  } else if (r.countdown_years < 0) {
    errs.push(`countdown_years=${r.countdown_years} is negative`);
  }

  if (!Array.isArray(r.ai_tools)) {
    errs.push("ai_tools missing or not an array");
  } else {
    r.ai_tools.forEach((t, i) => validateAiTool(t, i, errs));
  }

  if (!Array.isArray(r.pivot_steps)) {
    errs.push("pivot_steps missing or not an array");
  } else {
    if (r.pivot_steps.length === 0) errs.push("pivot_steps is empty");
    r.pivot_steps.forEach((s, i) => {
      if (!isNonEmptyString(s)) errs.push(`pivot_steps[${i}] not a non-empty string`);
    });
  }

  if (typeof r.confidence !== "string" || !CONFIDENCE_VALUES.has(r.confidence)) {
    errs.push(`confidence missing or not one of low|medium|high (got: ${JSON.stringify(r.confidence)})`);
  }

  if (!Array.isArray(r.sources_hint)) {
    errs.push("sources_hint missing or not an array");
  } else {
    r.sources_hint.forEach((s, i) => {
      if (!isNonEmptyString(s)) errs.push(`sources_hint[${i}] not a non-empty string`);
    });
  }

  if (r.methodology_version !== METHODOLOGY_VERSION) {
    errs.push(`methodology_version expected ${METHODOLOGY_VERSION}, got ${JSON.stringify(r.methodology_version)}`);
  }
  if (r.prompt_version !== PROMPT_VERSION) {
    errs.push(`prompt_version expected ${PROMPT_VERSION}, got ${JSON.stringify(r.prompt_version)}`);
  }

  return errs;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let names;
  try {
    names = await fs.readdir(opts.roles);
  } catch {
    // Legitimate pre-L3.2b state — directory does not exist yet.
    console.log(`[validate-roles] 0 file(s) validated (${opts.roles} does not exist)`);
    return;
  }

  const files = names.filter((n) => n.endsWith(".json")).sort();
  if (files.length === 0) {
    console.log(`[validate-roles] 0 file(s) validated (${opts.roles} has no JSON yet)`);
    return;
  }

  let okCount = 0;
  const failures = [];

  for (const name of files) {
    const slug = name.slice(0, -".json".length);
    const filePath = path.join(opts.roles, name);
    let raw;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (e) {
      failures.push({ file: filePath, errors: [`read failed: ${e.message}`] });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      failures.push({ file: filePath, errors: [`invalid JSON: ${e.message}`] });
      continue;
    }

    const errs = validateResult(parsed, slug);
    if (errs.length > 0) {
      failures.push({ file: filePath, errors: errs });
    } else {
      okCount += 1;
      if (!opts.quiet) console.log(`  ok  ${filePath}`);
    }
  }

  for (const f of failures) {
    console.error(`FAIL ${f.file}`);
    for (const e of f.errors) console.error(`     - ${e}`);
  }

  console.log(
    `[validate-roles] ${okCount} ok, ${failures.length} failed, ${files.length} total`,
  );
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
