// Route ↔ runtime-declaration consistency guard (L5.78).
//
// Every App-Router endpoint that runs server-side picks ONE of Next's two
// execution runtimes with an `export const runtime = "nodejs" | "edge"`:
//   - API route handlers: `app/api/**/route.ts(x)`
//   - file-convention image generators: `app/{icon,apple-icon,opengraph-image,
//     twitter-image}.tsx`
// The choice is load-bearing and not interchangeable. `app/api/analyze/route.ts`
// — the ONE paid path — imports `@anthropic-ai/sdk` and Vercel KV via
// `@/lib/cache/role-cache`; the Anthropic SDK uses Node `http`/stream APIs that
// do not exist on the edge runtime, so the route MUST be `nodejs`. The OG/image
// surfaces render with `next/og`'s `ImageResponse` and are pinned to `edge`
// (D-042/L5.12): `runtime = "edge"`.
//
// **The drift this pins is a silent production-only break, invisible to every
// build step:** `"edge"` and `"nodejs"` are both valid runtime string literals,
// so a refactor that flips `app/api/analyze/route.ts` to `"edge"` (a copy-paste
// from the sibling OG route, or an "everything-to-edge" modernization sweep)
// type-checks and `next build`s perfectly green — then every analyze request
// 500s in production the first time it touches `@anthropic-ai/sdk`, because the
// SDK can't run on edge. The symmetric footgun: an image route flipped to
// `nodejs` loses the edge guarantees the OG surface was tuned for. A THIRD
// failure mode — a newly-added `route.ts` with NO `runtime` export at all —
// silently inherits whatever Next's default is, which is exactly the ambiguity
// the explicit-declaration convention exists to remove. None of the three is
// caught by `tsc --noEmit`, `next build`, or any other guard in the L5.57–L5.77
// arc (which are all about doc↔code prose drift or SEO literals, never the
// runtime export).
//
// **Why a NEW surface:** no existing guard reads the `runtime` export. This is a
// code↔code runtime-correctness invariant (declared runtime ⟺ what the file's
// imports REQUIRE), the same surface class as the L5.63 cache-key guard — not
// documentation drift. It binds two independent facts in the source: which
// Node/edge-only module a route imports, and which runtime it declares.
//
// **Why a text guard:** same D-080 wall as the whole arc — the sources import
// `next/og`, `@anthropic-ai/sdk`, `next/server`, and `@/`-aliased modules the
// bare `.mjs` loader can't resolve and that aren't installed for the runner — so
// it reads each source as TEXT: a regex pulls the `runtime` literal (resolving
// the one re-export, `twitter-image.tsx` → `opengraph-image.tsx`), and the
// import lines decide which runtime the file is REQUIRED to use.
//
// Pure Node built-ins (`fs` read + regex), no `node_modules`/`@/`-alias
// resolution, identical on the routine laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, resolve } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP_DIR = join(REPO_ROOT, "app");

// Next file-convention image generators (by basename, no extension). Each runs
// server-side and so must declare a runtime, exactly like a route handler.
const IMAGE_CONVENTION = new Set([
  "icon",
  "apple-icon",
  "opengraph-image",
  "twitter-image",
]);

const VALID_RUNTIMES = new Set(["nodejs", "edge"]);

function collectFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      if (entry.name === ".next" || entry.name === "dist") continue;
      out.push(...collectFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// A candidate is any route handler or image-convention file under app/.
function isCandidate(file) {
  const base = basename(file);
  if (base === "route.ts" || base === "route.tsx") return true;
  const stem = base.replace(/\.(ts|tsx|js|jsx|mjs)$/, "");
  return IMAGE_CONVENTION.has(stem);
}

const DIRECT_RUNTIME = /export\s+const\s+runtime\s*=\s*["']([a-z]+)["']/;
// `export { default, alt, size, contentType, runtime } from "./opengraph-image"`
const REEXPORT = /export\s*\{[^}]*\bruntime\b[^}]*\}\s*from\s*["']([^"']+)["']/;

// Resolve the declared runtime for a candidate, following the single re-export
// hop the codebase uses (twitter-image → opengraph-image). Returns the literal
// string, or null if none could be resolved.
function declaredRuntime(file, seen = new Set()) {
  if (seen.has(file)) return null; // re-export cycle guard
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const direct = src.match(DIRECT_RUNTIME);
  if (direct) return direct[1];
  const reexport = src.match(REEXPORT);
  if (reexport) {
    // Resolve the relative module specifier against the importing file's dir,
    // trying the known source extensions.
    const specifier = reexport[1];
    const baseTarget = resolve(dirname(file), specifier);
    for (const ext of [".tsx", ".ts", ".jsx", ".js", ".mjs", ""]) {
      try {
        const target = baseTarget + ext;
        readFileSync(target, "utf8"); // existence probe
        return declaredRuntime(target, seen);
      } catch {
        // try next extension
      }
    }
  }
  return null;
}

const candidates = collectFiles(APP_DIR).filter(isCandidate);

// Per-file facts: relative path, declared runtime, and which runtime its imports
// REQUIRE (edge for next/og, nodejs for the Anthropic SDK).
const facts = candidates.map((file) => {
  const src = readFileSync(file, "utf8");
  const importsNextOg = /from\s+["']next\/og["']/.test(src);
  const importsAnthropic = /from\s+["']@anthropic-ai\/sdk["']/.test(src);
  return {
    rel: file.slice(REPO_ROOT.length + 1),
    runtime: declaredRuntime(file),
    importsNextOg,
    importsAnthropic,
  };
});

test("the candidate scan found the known route + image surfaces (vacuous-scan guard)", () => {
  // A glob that silently matched nothing would make every check below vacuously
  // pass. Anchor on the two endpoints whose runtime is load-bearing.
  assert.ok(candidates.length >= 6, `expected ≥6 candidate files, found ${candidates.length}`);
  const rels = new Set(facts.map((f) => f.rel));
  for (const anchor of [
    "app/api/analyze/route.ts",
    "app/opengraph-image.tsx",
    "app/api/og/[slug]/route.tsx",
  ]) {
    assert.ok(rels.has(anchor), `expected ${anchor} among the candidates`);
  }
});

test("every route/image surface declares an explicit runtime", () => {
  // The third failure mode: a server-side endpoint with no `runtime` export
  // silently inherits Next's default. Explicit declaration is the convention.
  const missing = facts.filter((f) => f.runtime === null).map((f) => f.rel);
  assert.deepEqual(
    missing,
    [],
    `route/image files with no resolvable runtime export: ${missing.join(", ")}`,
  );
});

test("every declared runtime is one of the two valid literals", () => {
  const invalid = facts
    .filter((f) => f.runtime !== null && !VALID_RUNTIMES.has(f.runtime))
    .map((f) => `${f.rel}=${f.runtime}`);
  assert.deepEqual(invalid, [], `unknown runtime literals: ${invalid.join(", ")}`);
});

test("every file importing next/og declares runtime = \"edge\"", () => {
  // ImageResponse / Satori OG rendering is pinned to edge (D-042). A next/og
  // surface flipped to nodejs loses that guarantee silently.
  const ogFiles = facts.filter((f) => f.importsNextOg);
  assert.ok(ogFiles.length >= 3, "expected ≥3 next/og image surfaces");
  const wrong = ogFiles
    .filter((f) => f.runtime !== "edge")
    .map((f) => `${f.rel}=${f.runtime}`);
  assert.deepEqual(wrong, [], `next/og files not on edge runtime: ${wrong.join(", ")}`);
});

test("every file importing @anthropic-ai/sdk declares runtime = \"nodejs\"", () => {
  // THE load-bearing invariant. The Anthropic SDK uses Node-only APIs; on edge
  // the paid analyze path 500s in production while the build stays green.
  const sdkFiles = facts.filter((f) => f.importsAnthropic);
  assert.ok(sdkFiles.length >= 1, "expected ≥1 Anthropic SDK consumer (the analyze route)");
  const wrong = sdkFiles
    .filter((f) => f.runtime !== "nodejs")
    .map((f) => `${f.rel}=${f.runtime}`);
  assert.deepEqual(
    wrong,
    [],
    `Anthropic SDK routes not on nodejs runtime: ${wrong.join(", ")}`,
  );
});

test("the two anchor endpoints hold their required runtimes", () => {
  // Belt-and-suspenders: even if the import-based rules above were ever weakened
  // (e.g. the SDK import moved behind a helper), these two literals must hold so
  // a flip of either fails LOUDLY rather than slipping through a softened rule.
  const byRel = new Map(facts.map((f) => [f.rel, f]));
  assert.equal(
    byRel.get("app/api/analyze/route.ts")?.runtime,
    "nodejs",
    "analyze route must run on the nodejs runtime (Anthropic SDK + KV)",
  );
  assert.equal(
    byRel.get("app/opengraph-image.tsx")?.runtime,
    "edge",
    "opengraph-image must run on the edge runtime (next/og)",
  );
});

test("the twitter-image re-export resolves to the opengraph-image runtime", () => {
  // twitter-image.tsx declares no runtime of its own — it re-exports from
  // opengraph-image. The resolver must follow that hop; if the re-export is
  // ever broken, this catches the regression (it would surface as a null
  // runtime in the "explicit runtime" test, but pin the resolved value here).
  const tw = facts.find((f) => f.rel === "app/twitter-image.tsx");
  if (tw) {
    assert.equal(
      tw.runtime,
      "edge",
      "twitter-image should inherit opengraph-image's edge runtime via re-export",
    );
  }
});
