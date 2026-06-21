// Canonical-origin consistency guard: the production base URL must be byte-for-
// byte identical everywhere it is hardcoded, and the deploy-time override knob
// must be the same env var everywhere.
//
// The site's canonical origin (`https://halflife.work`) is the source `next build`
// stamps into every absolute URL it emits. It lives in FIVE places, copied by
// hand on purpose (D-027/D-028: small reads beat a shared-helper refactor that
// churns shipped Phase-2 code — each of robots/sitemap/manifest/json-ld even
// says "the literal is duplicated ... deliberately"):
//
//   1. `app/layout.tsx`   — `metadataBase: new URL("https://halflife.work")`
//                           (the CANONICAL source; the other four say they
//                           "mirror `app/layout.tsx`'s `metadataBase` default")
//   2. `app/robots.ts`    — `process.env.NEXT_PUBLIC_SITE_URL ?? "<origin>"`
//                           (drives the `Sitemap:`/`host` lines)
//   3. `app/sitemap.ts`   — same fallback (absolute `/role/x` sitemap URLs)
//   4. `app/manifest.ts`  — same fallback (`id`/`start_url`)
//   5. `lib/seo/json-ld.ts` — same fallback (`@id`/`url` in the structured data)
//
// The drift this pins is a silent SEO-correctness failure, invisible to every
// build step:
//   (a) the domain changes at launch (the human-gated L1.7b/L5.1 naming pick) and
//       gets updated in `app/layout.tsx`'s `metadataBase` but not in one of the
//       four mirror files (or vice-versa). `next build`/`tsc --noEmit` stay green
//       — each file independently holds a valid string — but now the sitemap, or
//       robots `host`, or the JSON-LD `@id`, advertises a DIFFERENT origin than
//       the canonical `metadataBase`. Crawlers see two competing origins for the
//       same content: split canonical signals, a sitemap whose host the canonical
//       tag disowns, structured data whose `@id` doesn't match the page URL.
//   (b) one of the four mirror files typos the env var (`NEXT_PUBLIC_SITEURL`,
//       `NEXT_PUBLIC_SITE_URL_`). The `??` fallback still compiles, so the file
//       silently ignores the deploy-time override and pins the literal forever —
//       at deploy the overridden files move to the real domain and the typo'd one
//       stays on `halflife.work`, re-creating (a) only in production.
//   (c) a mirror file drops the trailing-slash strip (`.replace(/\/+$/, "")`), so
//       a `NEXT_PUBLIC_SITE_URL` set with a trailing slash yields `${SITE_URL}/x`
//       → `https://host//x` — a double-slashed URL that 404s or canonicalises
//       inconsistently. The four mirror comments all promise this strip.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.64 — `layout.tsx`
// and `json-ld.ts` pull `@/`-aliased modules the `.mjs` loader can't resolve and
// `next`/`react` types that aren't installed for the test runner, so resolving
// them for real is out of reach. So this reads the five sources as TEXT and
// compares the extracted origin literals + the override pattern, exactly the
// technique L5.57–L5.64 use on their surfaces. New consistency surface — the
// canonical-origin contract across the metadata-route family — not a continuation
// of the L5.57–L5.63 config/cache drift arc or the L5.64 internal-link arc.
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

// The four files that resolve the origin through the env-overridable fallback.
// `app/layout.tsx` is handled separately: its origin is the `metadataBase` the
// other four mirror, and it has no `?? "<origin>"` fallback to extract.
const MIRROR_FILES = [
  "app/robots.ts",
  "app/sitemap.ts",
  "app/manifest.ts",
  "lib/seo/json-ld.ts",
];

const CANONICAL_FILE = "app/layout.tsx";
const EXPECTED_ENV_VAR = "NEXT_PUBLIC_SITE_URL";

// Extract `metadataBase: new URL("<origin>")` from app/layout.tsx — the canonical
// origin every other file claims to mirror.
function canonicalOrigin() {
  const src = read(CANONICAL_FILE);
  const m = /metadataBase:\s*new URL\(\s*["']([^"']+)["']\s*\)/.exec(src);
  assert.ok(
    m,
    `could not find \`metadataBase: new URL("...")\` in ${CANONICAL_FILE} — ` +
      "renamed or reshaped? this is the canonical origin the guard compares against; update it here.",
  );
  return m[1];
}

// Extract the `process.env.<VAR> ?? "<origin>"` override from a mirror file, plus
// whether it strips a trailing slash. Returns { envVar, origin, stripsSlash }.
function mirrorSiteUrl(relPath) {
  const src = read(relPath);
  const m = /process\.env\.(\w+)\s*\?\?\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    m,
    `could not find \`process.env.<VAR> ?? "<origin>"\` in ${relPath} — ` +
      "the env-overridable SITE_URL fallback was renamed or removed; update this guard with it.",
  );
  // The literal `.replace(/\/+$/, "")` that strips any trailing slash so
  // `${SITE_URL}/x` never doubles up. Tolerant of inner whitespace.
  const stripsSlash = /\.replace\(\s*\/\\?\/\+\$\/\s*,\s*["']["']\s*\)/.test(src);
  return { envVar: m[1], origin: m[2], stripsSlash };
}

const expectedOrigin = canonicalOrigin();
const mirrors = MIRROR_FILES.map((f) => ({ file: f, ...mirrorSiteUrl(f) }));

test("the canonical metadataBase origin parses to a non-empty absolute https URL", () => {
  // Vacuous-parser guard: if the extraction silently failed, every comparison
  // below would trivially pass against an empty/garbage string. Anchor the value
  // so a reshaped `metadataBase` (or a regex drift) fails loudly here first.
  assert.ok(
    expectedOrigin.length > 0,
    `extracted canonical origin from ${CANONICAL_FILE} is empty`,
  );
  let url;
  assert.doesNotThrow(() => {
    url = new URL(expectedOrigin);
  }, `metadataBase origin ${JSON.stringify(expectedOrigin)} is not a valid absolute URL`);
  assert.equal(
    url.protocol,
    "https:",
    `canonical origin should be https — got ${JSON.stringify(expectedOrigin)}`,
  );
});

test("all four mirror files were actually parsed (vacuous-scan guard)", () => {
  // Guard the scan itself: a file rename or a regex drift that quietly dropped a
  // file from `mirrors` must fail here, not silently shrink the consistency check
  // below into a no-op over fewer files.
  assert.equal(
    mirrors.length,
    MIRROR_FILES.length,
    `expected ${MIRROR_FILES.length} mirror files, parsed ${mirrors.length}`,
  );
  for (const m of mirrors) {
    assert.ok(m.origin.length > 0, `extracted origin from ${m.file} is empty`);
  }
});

test("every mirror file embeds the SAME origin as app/layout.tsx's metadataBase", () => {
  // The load-bearing invariant: a domain change updated in one place but not the
  // others ships a split canonical origin (sitemap/robots/json-ld disagree with
  // the metadata's canonical host) — green build, broken SEO signals.
  const mismatches = mirrors
    .filter((m) => m.origin !== expectedOrigin)
    .map((m) => `${m.file}: ${JSON.stringify(m.origin)}`);
  assert.deepEqual(
    mismatches,
    [],
    `these files disagree with ${CANONICAL_FILE}'s metadataBase (${JSON.stringify(expectedOrigin)}): ` +
      `${mismatches.join("; ")}. The canonical origin must be byte-identical across all five copies ` +
      "(app/layout.tsx + robots/sitemap/manifest/json-ld) — update them together or wire a shared constant.",
  );
});

test("every mirror file uses the SAME deploy-time override env var (NEXT_PUBLIC_SITE_URL)", () => {
  // A typo'd env name (`NEXT_PUBLIC_SITEURL`) still compiles via the `??` fallback
  // but silently ignores the deploy override, so that one file stays on the literal
  // origin while the others move to the real domain at launch — drift that only
  // appears in production.
  const wrong = mirrors
    .filter((m) => m.envVar !== EXPECTED_ENV_VAR)
    .map((m) => `${m.file}: process.env.${m.envVar}`);
  assert.deepEqual(
    wrong,
    [],
    `these files read a different env var than ${EXPECTED_ENV_VAR}: ${wrong.join("; ")}. ` +
      "All four must read the same override knob or the domain pick won't propagate uniformly.",
  );
});

test("every mirror file strips a trailing slash so `${SITE_URL}/x` never doubles up", () => {
  // The four mirror comments all promise this strip; without it a
  // `NEXT_PUBLIC_SITE_URL` set with a trailing slash yields `https://host//x`.
  const missing = mirrors.filter((m) => !m.stripsSlash).map((m) => m.file);
  assert.deepEqual(
    missing,
    [],
    `these files no longer strip a trailing slash (\`.replace(/\\/+$/, "")\`): ${missing.join("; ")}. ` +
      "Restore it or a trailing-slashed override produces double-slashed URLs.",
  );
});

test("the canonical origin literal has no trailing slash or path (composes cleanly)", () => {
  // The mirrors all build URLs as `${SITE_URL}/...`; the literal must be a bare
  // origin (scheme + host[:port]) so that composition is exactly one slash deep.
  const url = new URL(expectedOrigin);
  assert.equal(
    expectedOrigin,
    url.origin,
    `canonical origin ${JSON.stringify(expectedOrigin)} carries a path/slash/query — ` +
      `it should be the bare origin ${JSON.stringify(url.origin)} so \`${"${SITE_URL}"}/x\` composes cleanly.`,
  );
});
