#!/usr/bin/env node
// L3.2 programmatic-SEO seed driver.
//
// Walks data/job-titles/top-200.json and, for each role, POSTs the title to a
// running /api/analyze endpoint, then writes the returned RoleAnalysisResult
// to data/roles/<slug>.json — the exact file app/role/[slug]/page.tsx reads
// first (D-021). The slug is taken verbatim from top-200.json so the seeded
// file path round-trips with /role/<slug>.
//
// WHY hit the HTTP route instead of importing lib/anthropic + lib/scoring:
// the route IS the contract. Going through /api/analyze reuses the pinned
// model, the v1 prompt/tool schema, buildResult(), the KV dual-key write
// (D-017) and the x-halflife-cache header (route.ts:11-13 was written for
// exactly this script) with zero duplicated logic — a model/prompt bump never
// needs a matching edit here. It also means re-running the seed warms KV for
// free, and a second run is all cache HITs (no re-billing).
//
// WHY this is L3.2a and not the whole of L3.2: the autonomous routine must
// not make live Claude calls (ROUTINE.md cost discipline; same boundary as
// the human-gated L1.5b eval run). This script is the harness; a human runs
// it once against a live key (L3.2b — see data/roles/README.md) and commits
// the resulting data/roles/*.json.
//
// Pure Node stdlib (global fetch, node:fs, node:path) — no dependencies, so
// it respects the no-`npm install` routine rule. Node >= 18.
//
// Usage:
//   node scripts/seed-roles.mjs [--base URL] [--concurrency N]
//                               [--limit N] [--force] [--dry-run]
//
//   --base URL        analyze endpoint origin (default http://localhost:3000)
//   --concurrency N   parallel in-flight requests (default 2)
//   --limit N         only process the first N roles (smoke test)
//   --force           re-fetch + overwrite slugs that already have a file
//   --dry-run         list what would be fetched/skipped; make no requests
//   --corpus PATH     corpus JSON to read (default data/job-titles/top-200.json)
//   --out-dir PATH    where seed files are written (default data/roles)
//
// --corpus / --out-dir default to the repo paths the human-run seed pass uses,
// so a plain `node scripts/seed-roles.mjs` is unchanged; they exist so the
// test suite (scripts/__tests__/seed-roles.test.mjs) can point the driver at a
// temp fixture and never touch the real data/ tree — the same testability
// posture validate-*.mjs (--roles/--report/--file) and rank-at-risk.mjs
// (--roles/--out-dir) already have.
//
// Idempotent: a slug whose data/roles/<slug>.json already exists is skipped
// (no POST → no Claude call) unless --force. Safe to Ctrl-C and re-run; it
// resumes from the first missing slug. Exit code is non-zero if any role
// failed, so a CI / human run can detect a partial seed.

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORPUS = path.join(ROOT, "data", "job-titles", "top-200.json");
const OUT_DIR = path.join(ROOT, "data", "roles");

function parseArgs(argv) {
  const args = {
    base: "http://localhost:3000",
    concurrency: 2,
    limit: Infinity,
    force: false,
    dryRun: false,
    corpus: CORPUS,
    outDir: OUT_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--corpus") args.corpus = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) {
    console.error("--concurrency must be a positive integer");
    process.exit(2);
  }
  return args;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Minimal shape guard — the route owns validation, this only catches a
// mis-pointed --base (e.g. a 200 from some other server) before we persist
// junk into the seed.
function looksLikeResult(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.normalized_title === "string" &&
    typeof obj.score === "number" &&
    typeof obj.countdown_years === "number" &&
    Array.isArray(obj.ai_tools) &&
    Array.isArray(obj.pivot_steps)
  );
}

async function analyzeOne(base, title) {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const cache = res.headers.get("x-halflife-cache") ?? "n/a";
  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const msg =
      payload && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!looksLikeResult(payload)) {
    throw new Error(
      "200 response is not a RoleAnalysisResult — is --base pointing at the app?",
    );
  }
  return { result: payload, cache };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const corpusRaw = await fs.readFile(args.corpus, "utf8").catch(() => null);
  if (corpusRaw === null) {
    console.error(
      `Corpus not found at ${args.corpus}. Run L3.1 (rank-job-titles) first.`,
    );
    process.exit(1);
  }
  const corpus = JSON.parse(corpusRaw);
  const roles = (corpus.roles ?? []).slice(0, args.limit);
  if (roles.length === 0) {
    console.error("Corpus has no roles.");
    process.exit(1);
  }

  await fs.mkdir(args.outDir, { recursive: true });

  // Partition into to-fetch vs. already-seeded so the plan is visible before
  // a single paid call goes out.
  const todo = [];
  let skipped = 0;
  for (const role of roles) {
    const outPath = path.join(args.outDir, `${role.slug}.json`);
    if (!args.force && (await fileExists(outPath))) {
      skipped++;
      continue;
    }
    todo.push({ ...role, outPath });
  }

  console.log(
    `Corpus: ${roles.length} roles | already seeded (skip): ${skipped} | ` +
      `to fetch: ${todo.length} | base: ${args.base} | ` +
      `concurrency: ${args.concurrency}${args.force ? " | FORCE" : ""}`,
  );
  if (args.dryRun) {
    for (const r of todo) console.log(`  would fetch: ${r.slug}  (${r.title})`);
    console.log(`Dry run — no requests made.`);
    return;
  }
  if (todo.length === 0) {
    console.log("Nothing to do — seed is complete.");
    return;
  }

  const stats = { written: 0, hit: 0, miss: 0, failed: 0 };
  const failures = [];
  let cursor = 0;

  async function worker() {
    while (cursor < todo.length) {
      const role = todo[cursor++];
      const n = cursor;
      try {
        const { result, cache } = await analyzeOne(args.base, role.title);
        await fs.writeFile(
          role.outPath,
          JSON.stringify(result, null, 2) + "\n",
          "utf8",
        );
        stats.written++;
        if (cache === "HIT") stats.hit++;
        else if (cache === "MISS") stats.miss++;
        console.log(
          `[${n}/${todo.length}] ${role.slug} ` +
            `score=${result.score} cache=${cache}`,
        );
      } catch (err) {
        stats.failed++;
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ slug: role.slug, title: role.title, message });
        console.error(`[${n}/${todo.length}] ${role.slug} FAILED: ${message}`);
      }
    }
  }

  const pool = Array.from(
    { length: Math.min(args.concurrency, todo.length) },
    worker,
  );
  await Promise.all(pool);

  console.log(
    `\nDone. written=${stats.written} ` +
      `(cache MISS/Claude-call=${stats.miss}, HIT/cached=${stats.hit}) ` +
      `skipped=${skipped} failed=${stats.failed}`,
  );
  if (failures.length > 0) {
    console.error(
      `\n${failures.length} role(s) failed — re-run to retry just these ` +
        `(seeded files are skipped automatically):`,
    );
    for (const f of failures) console.error(`  ${f.slug}: ${f.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
