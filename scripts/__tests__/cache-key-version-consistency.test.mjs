// Cache-correctness guard: the KV cache key must embed BOTH version constants,
// and the TTL must stay the documented 30 days.
//
// `lib/cache/role-cache.ts` keys every cached analysis under
//   `role:m${METHODOLOGY_VERSION}:p${PROMPT_VERSION}:${slug}`
// The two versions are *in the key on purpose* (D-008/D-009/D-012): a methodology
// weight tweak bumps `METHODOLOGY_VERSION`, a prompt edit bumps `PROMPT_VERSION`,
// and either bump changes every key so the next read misses and recomputes — there
// is no separate cache-purge step at deploy. The 30-day TTL is D-005.
//
// The drift this pins is a *silent correctness* failure, not a build break:
//   (a) a refactor "simplifies" `roleCacheKey` and drops `${PROMPT_VERSION}` (or
//       `${METHODOLOGY_VERSION}`) from the template. The module still compiles and
//       `npm run build`/`typecheck` stay green — the function just returns a
//       shorter string. But now a prompt/methodology edit no longer invalidates
//       KV: every cached entry survives the version bump and the site serves
//       stale analyses for up to 30 days, with nothing to signal it.
//   (b) the version constants get imported from somewhere other than the canonical
//       `@/lib/scoring/types`, so the key embeds a shadow copy that no longer
//       tracks the values shipped in the result JSON / methodology — the bump
//       lands in the response but not in the key.
//   (c) `TTL_SECONDS` drifts from 30 days while the D-005 ADR and the module
//       header still claim "30 days" — the documented freshness window and the
//       enforced one diverge.
//
// None of these can be caught by importing the module: `role-cache.ts` value-
// imports `createClient` from `@vercel/kv` (an uninstalled dep) and `slugify` +
// the version constants via the extensionless `@/` alias — the D-080 wall that
// keeps this module out of the `.mjs` test loader (same reason it has no unit
// suite). So this guard reads the source as TEXT and asserts the key's structure,
// exactly as L5.57 (env-doc), L5.58 (build-scripts), L5.59 (node-version),
// L5.61/L5.62 (doc cross-refs) read their surfaces as text. New consistency
// surface — the cache-key contract — not a continuation of the lib-unit-test arc.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

const cacheSrc = read("lib/cache/role-cache.ts");

// Extract the `roleCacheKey(slug): string { ... }` function body. The body has
// `}` chars inside `${...}` template interpolations, so we anchor the closing
// brace on its own line (`\n}`) rather than the first `}`.
function roleCacheKeyBody() {
  const m = /export function roleCacheKey\s*\([^)]*\)\s*:\s*string\s*\{([\s\S]*?)\n\}/.exec(
    cacheSrc,
  );
  assert.ok(
    m,
    "could not find `export function roleCacheKey(...): string { ... }` in lib/cache/role-cache.ts — " +
      "renamed or reshaped? update this guard with it.",
  );
  return m[1];
}

// Extract the single-line import list pulled from "@/lib/scoring/types".
function typesImportNames() {
  // `[^{}]*` can't cross a brace, so this binds to the import whose own `}`
  // directly precedes `from "@/lib/scoring/types"` — not an earlier import's.
  const m = /import\s*\{([^{}]*)\}\s*from\s*["']@\/lib\/scoring\/types["']/.exec(
    cacheSrc,
  );
  assert.ok(m, "lib/cache/role-cache.ts no longer imports from @/lib/scoring/types");
  return m[1]
    .split(",")
    .map((s) => s.replace(/\btype\b/, "").trim())
    .filter(Boolean);
}

// Extract the `TTL_SECONDS` initializer expression and reduce it to a number.
// Supports the documented product form (`60 * 60 * 24 * 30`) and a folded
// literal (`2592000`) so a harmless refactor doesn't trip the guard.
function ttlSeconds() {
  const m = /const\s+TTL_SECONDS\s*=\s*([^;]+);/.exec(cacheSrc);
  assert.ok(m, "could not find `const TTL_SECONDS = ...;` in lib/cache/role-cache.ts");
  const expr = m[1].trim();
  assert.match(
    expr,
    /^[\d*\s]+$/,
    `TTL_SECONDS is not a plain product of integers: ${JSON.stringify(expr)} ` +
      "(this guard only evaluates `*`-joined integer factors)",
  );
  const product = expr
    .split("*")
    .map((f) => Number(f.trim()))
    .reduce((acc, n) => {
      assert.ok(Number.isFinite(n), `TTL_SECONDS has a non-numeric factor in ${JSON.stringify(expr)}`);
      return acc * n;
    }, 1);
  return { expr, product };
}

const body = roleCacheKeyBody();
const importNames = typesImportNames();
const ttl = ttlSeconds();

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30; // 2_592_000

test("roleCacheKey embeds BOTH version constants (D-008/D-009 cache-busting)", () => {
  // The load-bearing invariant: drop either and a version bump no longer
  // invalidates KV, so the site serves stale analyses for up to the TTL.
  assert.match(
    body,
    /\$\{\s*METHODOLOGY_VERSION\s*\}/,
    "roleCacheKey no longer interpolates ${METHODOLOGY_VERSION} — a methodology " +
      "weight bump would stop invalidating the cache (D-008).",
  );
  assert.match(
    body,
    /\$\{\s*PROMPT_VERSION\s*\}/,
    "roleCacheKey no longer interpolates ${PROMPT_VERSION} — a prompt edit would " +
      "stop invalidating the cache (D-009).",
  );
});

test("roleCacheKey is per-role (embeds the slug)", () => {
  // Without the slug every role collapses onto one key — a global cache that
  // serves the first-analysed role for every input.
  assert.match(
    body,
    /\$\{\s*slug\s*\}/,
    "roleCacheKey no longer interpolates ${slug} — keys would no longer be per-role.",
  );
});

test("roleCacheKey keeps the documented `role:m<mv>:p<pv>:<slug>` shape (D-008/D-009)", () => {
  // The `m`/`p` markers and their order are the documented key format. Pin the
  // whole template structure so a reorder (`role:p…:m…`) or a dropped marker is
  // a deliberate edit here, not a silent change to the on-disk key namespace.
  assert.match(
    body,
    /`role:m\$\{\s*METHODOLOGY_VERSION\s*\}:p\$\{\s*PROMPT_VERSION\s*\}:\$\{\s*slug\s*\}`/,
    "the cache-key template drifted from `role:m${METHODOLOGY_VERSION}:p${PROMPT_VERSION}:${slug}` " +
      "(D-008/D-009) — if this is intentional, update the format here and in the module header.",
  );
});

test("both version constants come from the canonical @/lib/scoring/types", () => {
  // They must be THE versions shipped in the result JSON + methodology, not a
  // shadow copy that stops tracking them after a bump.
  for (const name of ["METHODOLOGY_VERSION", "PROMPT_VERSION"]) {
    assert.ok(
      importNames.includes(name),
      `${name} is not imported from "@/lib/scoring/types" (found: ${importNames.join(", ")}) — ` +
        "the cache key may be using a shadow constant.",
    );
  }
});

test("TTL_SECONDS is the documented 30 days (D-005)", () => {
  assert.equal(
    ttl.product,
    THIRTY_DAYS_SECONDS,
    `TTL_SECONDS evaluates to ${ttl.product}s from ${JSON.stringify(ttl.expr)}, ` +
      `but D-005 documents a 30-day (${THIRTY_DAYS_SECONDS}s) TTL.`,
  );
});

test("the 30-day TTL claim is coherent across the module header and the D-005 ADR", () => {
  // The constant is the enforcer; these are the two places a human reads the
  // freshness window. Keep all three saying the same thing.
  assert.match(
    cacheSrc,
    /30 days/,
    "lib/cache/role-cache.ts header no longer documents the 30-day TTL.",
  );
  const decisions = read("DECISIONS.md");
  assert.match(
    decisions,
    /\bD-005\b[\s\S]*?30-day TTL/,
    "DECISIONS.md D-005 no longer documents the 30-day TTL — it drifted from TTL_SECONDS.",
  );
});
