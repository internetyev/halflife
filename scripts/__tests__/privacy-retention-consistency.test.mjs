// Privacy-retention consistency guard: the data-retention window the PUBLIC
// privacy notice PROMISES a visitor must equal the cache TTL the code actually
// ENFORCES. Nothing pinned these together until now.
//
// The two surfaces this hop relates:
//
//   1. `lib/cache/role-cache.ts` — `const TTL_SECONDS = 60 * 60 * 24 * 30;` is the
//      real freshness window: every cached analysis is written to Vercel KV with
//      `{ ex: TTL_SECONDS }`, so a role result physically disappears from the store
//      exactly this many seconds after it is cached. This is the ONE number that
//      governs how long any per-role data is retained.
//   2. `app/privacy/page.tsx` — the user-facing, legally-meaningful privacy notice
//      states that retention window in plain English to a visitor: "cached for
//      30 days in Vercel KV", "expire on their own after 30 days as part of the
//      normal cache lifecycle", and in the page's `metadata.description` SEO/social
//      string "Vercel KV (30-day role cache)". These are a PROMISE about how long
//      data is kept — the kind of statement a data-protection review, a GDPR
//      inquiry, or a suspicious user actually reads and holds the site to.
//
// The drift this pins is invisible to every build step — neither `next build` nor
// `tsc --noEmit` relates the `TTL_SECONDS` product-of-integers in one module to the
// English "30 days" prose in a `.tsx` string in another; each file is independently
// valid:
//   (a) the TTL is retuned — a cost or freshness change bumps `TTL_SECONDS` to
//       `60 * 60 * 24 * 7` (7 days) or `* 90` (90 days) — but the privacy page still
//       tells every visitor "30 days". The site now retains data for a different
//       period than it publicly commits to: either it silently keeps analyses
//       longer than promised (a retention-overrun a privacy review would flag) or
//       purges them sooner than a user was told to expect. `tsc` is green — the
//       constant is an unrelated arithmetic expression and the prose is a plain
//       string literal.
//   (b) a partial prose edit — one of the three "30 days" mentions is updated to a
//       new window while another is missed (or a typo drops it to "3 days") — so the
//       page contradicts itself on the retention window. No compiler relates two
//       string literals in the same file.
//
// Why a NEW surface, not the existing cache guard: the L5.63 cache-key-version guard
// (`cache-key-version-consistency.test.mjs`) DOES assert `TTL_SECONDS` evaluates to
// 30 days — but it pins that only to the module's OWN header comment and to the
// `D-005` ADR line in `DECISIONS.md` (both internal, developer-facing docs). It
// never opens `app/privacy/page.tsx`, so the retention window the PUBLIC notice
// promises a user was wholly unguarded: the internal ADR and the user-facing page
// could disagree and every existing test would stay green. This guard owns exactly
// that one hop — enforced TTL ⟺ publicly-promised retention window.
//
// Fully extractive where it can be: the canonical window is READ from `TTL_SECONDS`
// (converted to whole days), not hard-coded per-side, and every retention-context
// day-count in the privacy page must equal it. The retention claims are isolated
// from the page's UNRELATED "respond within 14 days" support-SLA by requiring a
// cache/KV/expire/lifecycle keyword in the immediate context of a day-count before
// it is treated as a retention promise — so the guard discriminates the two rather
// than asserting every number on the page equals the TTL. A single 30-day literal
// anchor pins the current source of truth so a coordinated change of BOTH the TTL
// and the prose is still a deliberate, test-visible edit here (the CANONICAL_* /
// drop-detector play from the L5.86 / L5.89 guards).
//
// Why a text guard: the same D-080 wall as the L5.57–L5.90 arc — `role-cache.ts`
// value-imports `@vercel/kv` / `@/`-aliased modules the bare `.mjs` loader can't
// resolve and that aren't installed for the runner, and `page.tsx` imports `next`
// types + `next/link`; so it reads each source as TEXT and regex-extracts the
// fields. Comments are stripped from the privacy page first so the "30 days" its
// OWN header comment documents (and this test header's prose) is never scanned as a
// user-facing claim. Pure Node built-ins, no npm install — identical on the routine
// laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The retention window pinned across every surface, in days. Named here as the
// drop-detector anchor: a coordinated change of both `TTL_SECONDS` and every "30
// days" in the privacy page would keep the enforced⟺promised equality green, so
// this literal forces such a change to be a deliberate, reviewed edit here too.
const CANONICAL_TTL_DAYS = 30;
const SECONDS_PER_DAY = 60 * 60 * 24;

const CACHE_MODULE = "lib/cache/role-cache.ts";
const PRIVACY_PAGE = "app/privacy/page.tsx";

// Keywords that mark a day-count as a data-RETENTION claim (as opposed to the
// page's unrelated "respond within 14 days" support SLA). A day-count is treated as
// a retention promise only when one of these appears in its immediate context.
const RETENTION_CONTEXT = /vercel kv|\bkv\b|cache|cached|expire|lifecycle/i;

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Strip `//` line comments and `/* … */` block comments so a "30 days" written in
// the privacy page's own header comment (it documents this very invariant in prose)
// is never scanned as a user-facing retention claim. Note this also strips the tail
// of any line containing `//` (e.g. an `https://` href), which is harmless here — no
// retention day-count is ever written on a line that also carries a `//`.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// Reduce the `TTL_SECONDS` initializer (`60 * 60 * 24 * 30`) to a number. Supports
// the documented product-of-integers form and a pre-folded literal. Independent
// re-parse (the L5.63 cache-key guard extracts the same constant) so this guard
// stands alone.
function ttlSeconds(src) {
  const m = /const\s+TTL_SECONDS\s*=\s*([^;]+);/.exec(stripComments(src));
  if (!m) return null;
  const expr = m[1].trim();
  if (!/^[\d\s*]+$/.test(expr)) return null; // only integers and `*`
  const factors = expr.split("*").map((f) => Number(f.trim()));
  if (factors.some((n) => !Number.isInteger(n))) return null;
  return factors.reduce((a, b) => a * b, 1);
}

// Every day-count mention in the privacy page (comments stripped), tagged with
// whether its immediate context marks it as a retention claim. Matches both
// "30 days" (space) and "30-day" (hyphen, as in "30-day role cache").
function dayCountMentions(src) {
  const clean = stripComments(src);
  const re = /(\d+)[-\s]days?\b/gi;
  const out = [];
  let m;
  while ((m = re.exec(clean)) !== null) {
    const from = Math.max(0, m.index - 80);
    const context = clean.slice(from, m.index + m[0].length + 80);
    out.push({
      days: Number(m[1]),
      text: m[0],
      context,
      isRetention: RETENTION_CONTEXT.test(context),
    });
  }
  return out;
}

const cacheSrc = read(CACHE_MODULE);
const privacySrc = read(PRIVACY_PAGE);

const ttlSecs = ttlSeconds(cacheSrc);
const mentions = dayCountMentions(privacySrc);
const retentionMentions = mentions.filter((d) => d.isRetention);

test("TTL_SECONDS parses to a positive whole number of days (parse floor)", () => {
  // If the extraction silently returned null, or the TTL were not a whole number of
  // days, "N days" would not even be expressible and every check below would be
  // meaningless. Assert the real enforced window is present and day-granular.
  assert.ok(
    ttlSecs && ttlSecs > 0,
    `could not extract a positive \`TTL_SECONDS\` from ${CACHE_MODULE}`,
  );
  assert.equal(
    ttlSecs % SECONDS_PER_DAY,
    0,
    `TTL_SECONDS (${ttlSecs}s) is not a whole number of days — the privacy page ` +
      `states retention in "N days", so a sub-day TTL cannot be truthfully promised`,
  );
});

test("the privacy page states at least two retention-context day-counts (vacuous-scan floor)", () => {
  // Anti-vacuous floor: a regex/context filter that matched nothing would make the
  // equality check below pass for the wrong reason. The page carries the window in
  // the metadata description and in ≥1 body sentence.
  assert.ok(
    retentionMentions.length >= 2,
    `expected ≥2 retention-context "N days" mentions in ${PRIVACY_PAGE}, found ` +
      `${retentionMentions.length} (of ${mentions.length} day-count mentions total)`,
  );
});

test("every retention-context day-count in the privacy page equals the enforced TTL (the load-bearing invariant)", () => {
  // The real check: the window the public notice PROMISES must equal the window the
  // cache ENFORCES. A TTL bump that leaves the prose stale (case (a)) or a partial /
  // typo'd prose edit (case (b)) fails here.
  const ttlDays = ttlSecs / SECONDS_PER_DAY;
  for (const d of retentionMentions) {
    assert.equal(
      d.days,
      ttlDays,
      `${PRIVACY_PAGE} promises a "${d.text}" retention window, but ` +
        `${CACHE_MODULE} enforces ${ttlDays} days (TTL_SECONDS = ${ttlSecs}s)`,
    );
  }
});

test("the enforced TTL is the canonical 30-day window (drop-detector anchor)", () => {
  // Pins the current source of truth literally so a coordinated change of both
  // TTL_SECONDS and every "30 days" in the privacy page — which the enforced⟺promised
  // equality alone would let through — is still a deliberate, test-visible edit here.
  const ttlDays = ttlSecs / SECONDS_PER_DAY;
  assert.equal(
    ttlDays,
    CANONICAL_TTL_DAYS,
    `the retention window drifted from the canonical ${CANONICAL_TTL_DAYS} days to ` +
      `${ttlDays} days — if this is intentional, update CANONICAL_TTL_DAYS here and ` +
      `re-confirm every "N days" in ${PRIVACY_PAGE}`,
  );
});

test("the privacy page metadata.description states the retention window (the SEO/social surface)", () => {
  // The `metadata.description` is what a search engine and a social-card unfurl show
  // BEFORE a user opens the page — a distinct surface from the body prose. Pin its
  // "30-day role cache" claim to the enforced TTL so the summary can't advertise a
  // stale window.
  const ttlDays = ttlSecs / SECONDS_PER_DAY;
  const clean = stripComments(privacySrc);
  const descMatch = /description:\s*[`"']([\s\S]*?)[`"']\s*,/.exec(clean);
  assert.ok(descMatch, `could not find a metadata \`description\` in ${PRIVACY_PAGE}`);
  const descMentions = dayCountMentions(descMatch[1]).filter((d) => d.isRetention);
  assert.ok(
    descMentions.length >= 1,
    `the metadata.description in ${PRIVACY_PAGE} states no retention-context day-count ` +
      `— it should advertise the ${ttlDays}-day cache window`,
  );
  for (const d of descMentions) {
    assert.equal(
      d.days,
      ttlDays,
      `metadata.description advertises a "${d.text}" cache window, but the enforced ` +
        `TTL is ${ttlDays} days`,
    );
  }
});

test("the support-SLA day-count is not misread as a retention window (the guard discriminates)", () => {
  // The page also says "We aim to respond within 14 days" — a support-response SLA,
  // NOT a retention window. Confirm the context filter drops it: the day-count in the
  // "respond within" sentence must exist and must NOT be counted as retention. This
  // proves the retention scoping actually discriminates rather than matching every
  // number on the page.
  const sla = mentions.find((d) => /respond/i.test(d.context));
  assert.ok(
    sla,
    `expected a "respond within N days" support-SLA day-count in ${PRIVACY_PAGE} ` +
      `to prove the retention filter discriminates — none found`,
  );
  assert.equal(
    sla.isRetention,
    false,
    `the support-response SLA "${sla.text}" in ${PRIVACY_PAGE} was misread as a ` +
      `retention window — the context filter is too loose`,
  );
});
