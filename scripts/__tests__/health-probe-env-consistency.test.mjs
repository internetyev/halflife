// Deploy-probe ↔ runtime-env consistency guard (L5.74).
//
// `app/api/health/route.ts` (L5.8) is the zero-cost readiness probe the human
// curls right after `vercel --prod`: GET returns `config`, a per-feature map of
// PRESENCE BOOLEANS for the env vars each feature needs, so "all true" means
// "production is wired and the paid analyze path is safe to exercise". Its
// header states the contract explicitly: it "reports presence booleans for
// every secret-bearing var", and "Detection mirrors each consumer's own env
// check verbatim so 'configured here' means 'that feature will actually work'",
// then prints a five-row table mapping each config key to its consumer file and
// env var(s).
//
// Nothing pinned that probe to the code it claims to mirror. **The drift it
// pins is the silent under-report — invisible to every build step and, worse,
// invisible at deploy time too, which is the one moment the probe exists to
// serve:** a future feature starts reading a new secret-bearing `process.env.*`
// in `app/`/`lib/`/`components/`, documents it in `.env.example` (so the L5.55
// env-doc guard stays green) and ships — but nobody adds it to the health
// route's `config`. `next build`/`tsc --noEmit` stay green (an unset env var is
// just `undefined`). The operator then curls `/api/health`, sees every key
// `true`, deploys with confidence — and the new feature 503s or silently
// no-ops in production because that var was never provisioned. The probe's
// whole reason for existing (catch missing env BEFORE the paid path) is
// defeated by a probe that doesn't know about the new var.
//
// **Why a NEW surface, not the L5.55 env-doc guard (D-090):** that guard pins
// `code-read ⊆ .env.example` — it makes sure every var the runtime reads is
// DOCUMENTED for the operator. It says nothing about the health PROBE: a var
// can be perfectly documented yet absent from `config`, so the operator is told
// to set it but the deploy-time probe never confirms they did. This guard owns
// the orthogonal probe contract — `config` must mirror the secret-bearing reads
// — so the two together close the loop: documented (env-doc) AND verified at
// deploy (this).
//
// **Why a text guard:** same D-080 wall as the L5.55–L5.73 arc — the sources
// import `next/server` and `@/`-aliased modules the bare `.mjs` loader can't
// resolve and that aren't installed for the test runner — so it reads each
// source as TEXT: brace-matches the `config = { … }` object literal, extracts
// its `process.env.X` reads, and compares against the runtime surface's reads
// (comment-stripped, mirroring env-doc's extractor verbatim so a documentary
// `Boolean(process.env.X)` mention in a comment never counts as a read).
//
// Pure Node built-ins (`fs` read + regex + brace-match), no `node_modules`/
// `@/`-alias resolution, identical on the routine laptop and CI. Run via
// `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HEALTH_ROUTE = join(REPO_ROOT, "app", "api", "health", "route.ts");

// Runtime surface whose env reads the operator must provision — identical scope
// to the L5.55 env-doc guard (`app`/`lib`/`components`; `scripts/` is dev-only
// tooling, out of the deploy-time contract).
const RUNTIME_DIRS = ["app", "lib", "components"];
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

// A `NEXT_PUBLIC_*` var is inlined into the client bundle and therefore public
// by definition — not a "secret-bearing var". The health header's strongest
// claim is about secret-bearing vars, so the load-bearing completeness check
// (runtime-secret ⊆ probe) filters these out; they are still allowed to appear
// in the probe (it echoes `siteUrl`, checks `plausible`), just not required by
// the secret-completeness direction.
const PUBLIC_PREFIX = /^NEXT_PUBLIC_/;

function stripComments(src) {
  // Block comments first (dotall), then line comments — mirrors the env-doc
  // guard so a documentary `Boolean(process.env.X)` inside a comment is not
  // mistaken for a real read.
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function collectSourceFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // dir absent on this checkout
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

const ENV_READ = /process\.env\.([A-Z][A-Z0-9_]*)/g;

function readVarsIn(files) {
  const found = new Set();
  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf8"));
    let m;
    while ((m = ENV_READ.exec(code)) !== null) found.add(m[1]);
  }
  return found;
}

// Brace-match the `const config = { … }` object literal in the health route and
// return its raw body text. Throws (failing the parser-integrity test loudly)
// if the anchor or its closing brace can't be found, so a refactor that renames
// `config` can never make this guard silently pass on an empty body.
function extractConfigBody(src) {
  const anchor = src.indexOf("const config = {");
  assert.notEqual(anchor, -1, "could not find `const config = {` in health route");
  const open = src.indexOf("{", anchor);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error("unbalanced braces in health route `config` object");
}

const healthSrc = readFileSync(HEALTH_ROUTE, "utf8");
const configBody = stripComments(extractConfigBody(healthSrc));

// Vars the probe actually reads inside `config` (the detection set).
const probeVars = new Set();
{
  let m;
  const re = new RegExp(ENV_READ.source, "g");
  while ((m = re.exec(configBody)) !== null) probeVars.add(m[1]);
}

// Every var read across the runtime surface (comment-stripped).
const runtimeVars = readVarsIn(
  RUNTIME_DIRS.flatMap((d) => collectSourceFiles(join(REPO_ROOT, d))),
);

// Documented operator contract — same parse as the env-doc guard.
const documented = new Set();
for (const line of readFileSync(join(REPO_ROOT, ".env.example"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)\s*=/);
  if (m) documented.add(m[1]);
}

test("health route parses to a non-empty probe var set with the known anchors", () => {
  // A brace-match or regex that silently matched nothing would make every
  // subset check below vacuously pass.
  assert.ok(probeVars.size > 0, "no env vars extracted from the health `config` object");
  for (const anchor of ["ANTHROPIC_API_KEY", "PLUNK_API_KEY"]) {
    assert.ok(
      probeVars.has(anchor),
      `expected the probe to check ${anchor} (a secret-bearing feature gate)`,
    );
  }
});

test("runtime env reads were actually discovered (vacuous-scan guard)", () => {
  assert.ok(runtimeVars.size > 0, "no process.env reads found in the runtime surface");
  assert.ok(
    runtimeVars.has("ANTHROPIC_API_KEY"),
    "expected ANTHROPIC_API_KEY among the runtime reads",
  );
});

test("every var the probe checks is documented in .env.example", () => {
  // The probe must never report on a var the operator was never told to set —
  // a `true`/`false` for an undocumented var is a readiness signal with no
  // provisioning instruction behind it.
  const undocumented = [...probeVars].filter((v) => !documented.has(v));
  assert.deepEqual(
    undocumented,
    [],
    `health probe checks vars absent from .env.example: ${undocumented.join(", ")}`,
  );
});

test("every var the probe checks is actually read by a runtime consumer", () => {
  // "Detection mirrors each consumer's own env check" — a probe key whose var
  // no consumer reads is a dead check: its `true`/`false` no longer tracks any
  // real feature, so "configured here" stops meaning "works here".
  const dead = [...probeVars].filter((v) => !runtimeVars.has(v));
  assert.deepEqual(
    dead,
    [],
    `health probe checks vars no runtime file reads: ${dead.join(", ")}`,
  );
});

test("every secret-bearing var the runtime reads is covered by the probe", () => {
  // THE load-bearing invariant: the silent under-report. A new non-public
  // (secret-bearing) env read in app/lib/components that the probe forgot means
  // the operator can curl /api/health, see all-green, and still deploy with a
  // missing secret. Public NEXT_PUBLIC_* vars are exempt — they ship in the
  // bundle, not provisioned as deploy secrets.
  const secretReads = [...runtimeVars].filter((v) => !PUBLIC_PREFIX.test(v));
  const uncovered = secretReads.filter((v) => !probeVars.has(v));
  assert.deepEqual(
    uncovered,
    [],
    `secret-bearing runtime vars missing from the health probe: ${uncovered.join(", ")}`,
  );
});

test("every source file the health header references exists on disk", () => {
  // The header's detection table names each consumer file ("app/api/analyze/
  // route.ts", "lib/cache/role-cache.ts", …). A renamed/moved consumer leaves
  // those references dangling — the documented "configured here ≡ works here"
  // mapping now points at a file that no longer exists. Scan the comment region
  // for runtime path tokens and assert each resolves to a real source file
  // (extension-less paths like `components/plausible-analytics` are resolved
  // against the known source extensions).
  const comments = healthSrc.match(/\/\/[^\n]*/g)?.join("\n") ?? "";
  const PATH_TOKEN = /\b(?:app|lib|components)\/[A-Za-z0-9_./-]+/g;
  const paths = [...new Set(comments.match(PATH_TOKEN) ?? [])];
  assert.ok(paths.length >= 4, "expected the header to reference its consumer files");
  const missing = paths.filter((p) => {
    if (existsSync(join(REPO_ROOT, p))) return false;
    if (SOURCE_EXT.test(p)) return true; // had an extension, doesn't exist
    // extension-less reference — try the known source extensions
    return ![".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"].some((ext) =>
      existsSync(join(REPO_ROOT, p + ext)),
    );
  });
  assert.deepEqual(
    missing,
    [],
    `health header references files that don't exist: ${missing.join(", ")}`,
  );
});

test("every env var named in the header detection table is one the probe checks", () => {
  // The header's `//   - <key>  <file>  <VAR>` rows document which var each
  // feature gates on. If a row names a var the `config` object doesn't actually
  // read, the documentation lies about what the probe verifies. (Abbreviated
  // continuations like `+ _TOKEN` start with `_` and are intentionally skipped
  // by the leading-[A-Z] anchor — they aren't standalone var claims.)
  const tableRows = healthSrc
    .split("\n")
    .filter((l) => /^\s*\/\/\s*-\s+\w+\s+/.test(l));
  assert.ok(tableRows.length >= 4, "expected the header detection table rows");
  const VAR_TOKEN = /\b[A-Z][A-Z0-9_]{3,}\b/g;
  const claimed = new Set();
  for (const row of tableRows) {
    let m;
    while ((m = VAR_TOKEN.exec(row)) !== null) claimed.add(m[0]);
  }
  assert.ok(claimed.size > 0, "no env-var tokens parsed out of the detection table");
  const phantom = [...claimed].filter((v) => !probeVars.has(v));
  assert.deepEqual(
    phantom,
    [],
    `header table names vars the config never checks: ${phantom.join(", ")}`,
  );
});
