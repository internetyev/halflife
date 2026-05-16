#!/usr/bin/env node
// L4.1 "Most At-Risk Roles 2026" ranking driver.
//
// Reads every data/roles/<slug>.json (each a RoleAnalysisResult written by
// scripts/seed-roles.mjs in the L3.2b seed pass) and emits a ranking, most
// at-risk first, to data/report/most-at-risk-2026.json and .csv.
//
// Ranking key (all ascending — see components/result-card.tsx bandFor):
//   1. score            — lower survival score = more at-risk (primary)
//   2. countdown_years  — sooner the AI tipping point = more at-risk
//   3. normalized_title — stable, deterministic tiebreak
// The 5-band label (Urgent <20, At-risk <40, Contested <60, Durable <80,
// Stable >=80) is computed identically to result-card.tsx so the report and
// the role page agree; the literal thresholds are duplicated deliberately
// (same scope-control call as D-027/D-028 — one stdlib script must not import
// a "use client" React component).
//
// WHY this is L4.1a and not the whole of L4.1: the seed pass that creates
// data/roles/*.json (L3.2b) is human-gated and has not run, so there is no
// data to rank yet. This script is the harness; like app/sitemap.ts (L3.3)
// it is self-maintaining — it produces an empty-but-correct ranking today
// and the real ranking the moment the human commits the seed JSON (L4.1b),
// with no code change. Same a/b split as L3.1a/L3.1b and L3.2a/L3.2b.
//
// Pure Node stdlib (node:fs, node:path) — no dependencies, respects the
// no-`npm install` routine rule. Node >= 18. Makes NO network/Claude calls.
//
// Usage:
//   node scripts/rank-at-risk.mjs [--roles DIR] [--out-dir DIR]
//                                 [--top N] [--dry-run]
//
//   --roles DIR    seed directory (default data/roles)
//   --out-dir DIR  output directory (default data/report)
//   --top N        keep only the N most at-risk roles (default: all)
//   --dry-run      print the ranking summary; write no files
//
// Exit codes: 0 ok (including the legitimate zero-seed case), 2 bad args.

import { promises as fs } from "node:fs";
import path from "node:path";

const REPORT_YEAR = 2026;

function parseArgs(argv) {
  const opts = {
    roles: "data/roles",
    outDir: "data/report",
    top: Infinity,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--roles") opts.roles = argv[++i];
    else if (a === "--out-dir") opts.outDir = argv[++i];
    else if (a === "--top") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        console.error(`--top expects a positive integer, got: ${argv[i]}`);
        process.exit(2);
      }
      opts.top = n;
    } else if (a === "--dry-run") opts.dryRun = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

// Mirrors components/result-card.tsx bandFor() exactly.
function bandFor(score) {
  if (score < 20) return "Urgent";
  if (score < 40) return "At-risk";
  if (score < 60) return "Contested";
  if (score < 80) return "Durable";
  return "Stable";
}

async function readSeed(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return []; // no data/roles/ yet — legitimate empty case (pre-L3.2b)
  }
  const roles = [];
  for (const name of entries.filter((n) => n.endsWith(".json")).sort()) {
    const slug = name.slice(0, -".json".length);
    const raw = await fs.readFile(path.join(dir, name), "utf8");
    let r;
    try {
      r = JSON.parse(raw);
    } catch {
      console.error(`skip: ${name} is not valid JSON`);
      continue;
    }
    if (typeof r.score !== "number" || typeof r.countdown_years !== "number") {
      console.error(`skip: ${name} missing numeric score/countdown_years`);
      continue;
    }
    roles.push({
      slug,
      title: r.normalized_title ?? slug,
      score: r.score,
      countdown_years: r.countdown_years,
      confidence: r.confidence ?? "unknown",
      band: bandFor(r.score),
    });
  }
  return roles;
}

function rank(roles) {
  return [...roles]
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.countdown_years - b.countdown_years ||
        a.title.localeCompare(b.title),
    )
    .map((r, i) => ({ rank: i + 1, ...r }));
}

function toCsv(rows) {
  const cols = [
    "rank",
    "slug",
    "title",
    "score",
    "band",
    "countdown_years",
    "confidence",
  ];
  const esc = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => esc(row[c])).join(","));
  return lines.join("\r\n") + "\r\n"; // CRLF — Excel-friendly, matches SEODB
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const all = rank(await readSeed(opts.roles));
  const rows = Number.isFinite(opts.top) ? all.slice(0, opts.top) : all;

  const generated = new Date().toISOString();
  const payload = {
    meta: {
      report_year: REPORT_YEAR,
      title: `Most At-Risk Roles ${REPORT_YEAR}`,
      generated_at: generated,
      total_seeded: all.length,
      ranked: rows.length,
      ranking_key: ["score asc", "countdown_years asc", "title asc"],
      source: opts.roles,
      note:
        all.length === 0
          ? "No seed data yet — run scripts/seed-roles.mjs (L3.2b), then re-run this (L4.1b)."
          : undefined,
    },
    roles: rows,
  };

  console.log(
    `[rank-at-risk] seeded=${all.length} ranked=${rows.length}` +
      (all.length ? ` most-at-risk=${all[0].title} (${all[0].score})` : ""),
  );
  if (opts.dryRun) {
    console.log("[rank-at-risk] --dry-run: no files written");
    return;
  }

  await fs.mkdir(opts.outDir, { recursive: true });
  const base = path.join(opts.outDir, `most-at-risk-${REPORT_YEAR}`);
  await fs.writeFile(`${base}.json`, JSON.stringify(payload, null, 2) + "\n");
  await fs.writeFile(`${base}.csv`, toCsv(rows));
  console.log(`[rank-at-risk] wrote ${base}.json and ${base}.csv`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
