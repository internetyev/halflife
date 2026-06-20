// Config-drift guard: every env var the runtime reads must be documented in
// `.env.example`.
//
// `.env.example` is the operator contract — "Copy to `.env.local` before
// running `next dev`" — and it doubles as the deploy checklist for the
// human-gated L5.2/L5.4b Vercel wiring (docs/launch-checklist.md §2). Nothing
// pinned it to the code, though: a future feature could start reading a brand
// new `process.env.FOO`, ship green (an unset env var is just `undefined`, not
// a build error), and the operator would deploy without ever being told to set
// `FOO`. The feature then silently no-ops (or 503s) in production with no
// signal at deploy time. This is the same doc-vs-code drift class L5.56 pinned
// for the scoring methodology, applied to the env surface.
//
// The guard is DIRECTIONAL: code-read ⊆ documented. We assert every var read in
// the runtime surface appears in `.env.example`, but NOT the reverse — the
// template legitimately lists vars the code never touches by name
// (`KV_URL`, `KV_REST_API_READ_ONLY_TOKEN` are Vercel-injected when you link a
// KV store; only `KV_REST_API_URL` + `_TOKEN` are read in
// lib/cache/role-cache.ts). An undocumented read is an operator footgun; a
// documented-but-unread var is just a helpful note, so only the former fails.
//
// Scope is the RUNTIME surface — `app/`, `lib/`, `components/` — the code that
// runs on Vercel and whose env vars the operator must provision. `scripts/`
// (dev/routine tooling, run on a laptop with its own ad-hoc env) is out of
// scope on purpose: those reads aren't part of the deploy-time contract
// `.env.example` serves.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Runtime dirs whose env reads the operator must provision via `.env.example`.
const RUNTIME_DIRS = ["app", "lib", "components"];
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

// Recursively collect source files under `dir`, skipping test trees (their
// `process.env` reads are fixtures, not the runtime contract) and any
// build/dep output that might exist on the routine laptop.
function collectSourceFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // dir absent on this checkout — nothing to scan
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      if (entry.name === ".next" || entry.name === "dist") continue;
      out.push(...collectSourceFiles(full));
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Strip JS/TS comments before scanning so a documentary mention like the health
// route's `Boolean(process.env.X)` (a comment, not a real read) doesn't count.
// Block comments first (dotall), then line comments to end-of-line. This is the
// usual regex caveat — a `//` or `/* */` sequence inside a string/regex literal
// would also be stripped — but env-var reads never live inside such literals,
// so for THIS extraction the simplification is safe.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const ENV_READ = /process\.env\.([A-Z][A-Z0-9_]*)/g;

function readVarsIn(files) {
  const found = new Map(); // var -> Set(relative file paths)
  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf8"));
    const rel = file.slice(REPO_ROOT.length + 1);
    let m;
    while ((m = ENV_READ.exec(code)) !== null) {
      if (!found.has(m[1])) found.set(m[1], new Set());
      found.get(m[1]).add(rel);
    }
  }
  return found;
}

// `.env.example` lines that declare a var: `NAME=` (optionally with a value),
// not the `#`-prefixed prose blocks.
function parseDocumentedVars(envExample) {
  const out = new Set();
  for (const line of envExample.split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)\s*=/);
    if (m) out.add(m[1]);
  }
  return out;
}

const documented = parseDocumentedVars(
  readFileSync(join(REPO_ROOT, ".env.example"), "utf8"),
);
const reads = readVarsIn(
  RUNTIME_DIRS.flatMap((d) => collectSourceFiles(join(REPO_ROOT, d))),
);

test(".env.example parses to a non-empty var set", () => {
  // A parser that silently matched nothing would make the guard below vacuous.
  assert.ok(documented.size > 0, "no vars parsed out of .env.example");
  assert.ok(
    documented.has("ANTHROPIC_API_KEY"),
    "expected the required ANTHROPIC_API_KEY to be documented",
  );
});

test("env reads were actually discovered in the runtime surface", () => {
  // Guards against a refactor that moves/renames the runtime dirs and quietly
  // turns the consistency assertion into a no-op (empty ⊆ documented is true).
  assert.ok(
    reads.size > 0,
    "found no process.env reads under app/lib/components — scan likely misconfigured",
  );
});

test("every runtime env var read is documented in .env.example", () => {
  const undocumented = [...reads.keys()]
    .filter((v) => !documented.has(v))
    .sort();
  assert.deepEqual(
    undocumented,
    [],
    `process.env vars read in runtime code but missing from .env.example:\n` +
      undocumented
        .map((v) => `  ${v}  (read in ${[...reads.get(v)].sort().join(", ")})`)
        .join("\n"),
  );
});

test("the known runtime env vars are all present (anchors the guard)", () => {
  // Pins today's contract so the suite fails loudly if a future edit DROPS a
  // read the operator still needs to know about — not just when one is added.
  const expected = [
    "ANTHROPIC_API_KEY",
    "KV_REST_API_TOKEN",
    "KV_REST_API_URL",
    "NEXT_PUBLIC_PLAUSIBLE_DOMAIN",
    "NEXT_PUBLIC_SITE_URL",
    "PLUNK_API_KEY",
  ];
  for (const v of expected) {
    assert.ok(reads.has(v), `expected runtime code to read ${v}`);
    assert.ok(documented.has(v), `expected .env.example to document ${v}`);
  }
});
