// Content-language consistency guard: the site declares its content language in
// TWO independent places that a crawler and a screen reader BOTH read, and they
// must name the same BCP-47 language tag — nothing pins them together until now.
//
// The two declaration sites:
//
//   1. `app/layout.tsx` — the root `<html lang="en">` attribute. This is the DOM
//      language every browser, screen reader, and crawler reads first to decide
//      pronunciation, hyphenation, "translate this page?" prompts, and which
//      language a search engine files the page under. It is set ONCE, in the root
//      layout, so every route inherits it.
//   2. `lib/seo/json-ld.ts` — `buildSiteJsonLd()`'s `WebSite` node carries
//      `inLanguage: "en"`, the schema.org structured-data statement of the site's
//      language. This graph is injected from `app/layout.tsx` on every non-role
//      route (home, `/report/2026`, `/privacy`, `/not-found`), so the structured
//      data Google reads advertises the site language in parallel with the DOM.
//
// The drift this pins is a silent language split-brain, invisible to every build
// step (neither `next build` nor `tsc --noEmit` relates a JSX attribute to a
// string literal in a different module — each is a valid literal on its own):
//   (a) the site is localized (or the primary market changes) and `<html lang>` is
//       updated to a new tag — `"en-US"`, `"uk"`, `"es"` — but the JSON-LD
//       `inLanguage` keeps the stale `"en"` (or vice-versa): the DOM tells a
//       screen reader / the "translate?" heuristic one language while the
//       structured data tells Google another. Both files still parse and build
//       green; the split shows only as a mis-filed page or a wrong-language a11y
//       read in the wild.
//   (b) a region subtag is added on one side only (`"en"` → `"en-US"` in the HTML
//       to hint US spelling, but `inLanguage` stays bare `"en"`): the two
//       declarations disagree on specificity, the exact kind of near-miss no
//       compiler flags.
//
// Why a NEW surface, not an existing brand/json-ld guard: the L5.69 json-ld-brand
// guard pins the schema.org brand ENTITY (Organization/WebSite `name`/`@id`/`url`)
// across both `@graph` builders — it never reads the `inLanguage` FIELD, and it
// never reads `app/layout.tsx`'s `<html lang>` attribute at all. The theme-color /
// palette guards (L5.71/L5.81/L5.88) read `<html>`-adjacent chrome but never its
// `lang`. So the DOM-language ↔ structured-data-language contract was wholly
// unguarded; this guard owns exactly that one hop.
//
// Fully extractive: the canonical tag is not hard-coded per-site — it is read from
// `<html lang>` and every `inLanguage` must equal it (case-insensitively; BCP-47
// primary/region subtags are case-insensitive, so `"en"` and `"EN"` are the same
// language, but a region drift like `"en"` vs `"en-US"` is a real mismatch and is
// caught). A single `"en"` anchor pins the current source of truth so a
// coordinated both-sides change is still a deliberate, test-visible edit here too
// (the same drop-detector role CANONICAL_SLUG plays in the L5.86 repo-url guard).
//
// Why a text guard: the same D-080 wall as the L5.57–L5.88 arc — `app/layout.tsx`
// imports `next` types and `@/`-aliased modules the bare `.mjs` loader can't
// resolve and that aren't installed for the runner, and executing
// `buildSiteJsonLd()` would need those same aliases — so it reads each source as
// TEXT and regex-extracts the tags. Comments are stripped first so a `lang="…"` /
// `inLanguage: "…"` mentioned in prose (each file's own header documents this
// invariant) is never mistaken for a declaration. Pure Node built-ins, no npm
// install — identical on the routine laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical source-of-truth language tag. Named here as the drop-detector
// anchor: a coordinated change across both sites would keep the agreement check
// green, so this literal forces the change to be a deliberate, reviewed edit here
// too (the CANONICAL_SLUG play in the L5.86 repo-url guard).
const CANONICAL_LANG = "en";

const LAYOUT = "app/layout.tsx";
const JSON_LD = "lib/seo/json-ld.ts";

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Strip `//` line comments and `/* … */` block comments so a `lang="…"` or
// `inLanguage: "…"` written in a header comment (both files document this
// invariant in prose) is never scanned as a real declaration. Deliberately
// simple — the source has no string literals containing `//` or `/*` that would
// be corrupted, and the extraction regexes below anchor on JSX/object syntax that
// only appears in real code, not prose.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// The `lang` value on the root `<html …>` element in `app/layout.tsx`. `<html\b`
// then any attributes up to the `lang="…"`; `[^>]*?` is non-greedy so it stops at
// the first `lang` inside the same tag.
function htmlLang(src) {
  const m = /<html\b[^>]*?\blang=["']([^"']+)["']/.exec(stripComments(src));
  return m ? m[1] : null;
}

// Every `inLanguage: "…"` value in `lib/seo/json-ld.ts` (schema.org field on the
// WebSite node). Returned as an array so the anti-vacuous floor can assert ≥1 and
// a future second graph carrying its own `inLanguage` is checked too.
function inLanguageValues(src) {
  const re = /\binLanguage\s*:\s*["']([^"']+)["']/g;
  const out = [];
  let m;
  while ((m = re.exec(stripComments(src))) !== null) out.push(m[1]);
  return out;
}

const layoutLang = htmlLang(read(LAYOUT));
const jsonLdLangs = inLanguageValues(read(JSON_LD));

test("app/layout.tsx declares a root <html lang> (vacuous-scan guard)", () => {
  // If the extraction silently returned null, every agreement check below would
  // pass for the wrong reason. Assert the DOM-language declaration is present.
  assert.ok(
    layoutLang,
    `could not find a <html … lang="…"> attribute in ${LAYOUT}`,
  );
});

test("lib/seo/json-ld.ts declares at least one inLanguage (vacuous-scan guard)", () => {
  // Same anti-vacuous floor for the structured-data side: a regex that matched
  // nothing would make the cross-file check meaningless.
  assert.ok(
    jsonLdLangs.length >= 1,
    `expected ≥1 inLanguage: "…" in ${JSON_LD}, found ${jsonLdLangs.length}`,
  );
});

test("the DOM <html lang> matches the canonical language tag (drop-detector anchor)", () => {
  // Pins the current source of truth literally so a coordinated both-sides change
  // — which the agreement check alone would let through — is still a deliberate,
  // test-visible edit here.
  assert.equal(
    layoutLang.toLowerCase(),
    CANONICAL_LANG,
    `${LAYOUT} <html lang="${layoutLang}"> must be the canonical "${CANONICAL_LANG}"`,
  );
});

test("every JSON-LD inLanguage matches the canonical language tag", () => {
  for (const lang of jsonLdLangs) {
    assert.equal(
      lang.toLowerCase(),
      CANONICAL_LANG,
      `${JSON_LD} inLanguage: "${lang}" must be the canonical "${CANONICAL_LANG}"`,
    );
  }
});

test("the DOM language and the structured-data language agree (the load-bearing invariant)", () => {
  // The real check: `<html lang>` (what a screen reader / crawler reads from the
  // DOM) and every schema.org `inLanguage` (what Google reads from the structured
  // data) must name the same language — case-insensitively, so `"en"`/`"EN"` are
  // the same, but a region-subtag drift (`"en"` vs `"en-US"`) is a real mismatch
  // and fails here.
  const normalizedHtml = layoutLang.toLowerCase();
  for (const lang of jsonLdLangs) {
    assert.equal(
      lang.toLowerCase(),
      normalizedHtml,
      `DOM <html lang="${layoutLang}"> and JSON-LD inLanguage: "${lang}" must name ` +
        `the same language; they disagree`,
    );
  }
});
