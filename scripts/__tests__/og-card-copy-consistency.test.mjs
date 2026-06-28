// OG share-card rendered-copy consistency guard: the brand copy the share-card
// PNGs actually DRAW must stay in step with the canonical metadata strings in
// `app/layout.tsx` and with each other across the OG-image family.
//
// halflife renders share-card text in TWO next/og generators, and the words they
// draw are hand-copied marketing strings — NOT references to a shared constant
// (Satori reads only the literal JSX it is handed, so the copy is inlined):
//
//   1. `app/opengraph-image.tsx`     — the site-level default card (home, report).
//      Draws an eyebrow ("halflife"), a headline ("How many years until AI
//      replaces your role?"), a sub-line, and a tagline ("AI Job Obsolescence
//      Clock — countdown, score, pivot."). Also exports `alt`
//      ("halflife — How many years until AI replaces your role?"), the text
//      fallback a crawler/screen-reader reads in place of the image.
//   2. `app/api/og/[slug]/route.tsx` — the dynamic per-role card. Its `GenericCard`
//      (rendered for an unseen slug or unconfigured KV) draws the SAME eyebrow +
//      headline + tagline; its `RoleCard` draws the same "halflife" eyebrow.
//
// Those drawn words are the same brand strings `app/layout.tsx` advertises in
// metadata: the `TITLE` const "halflife — AI Job Obsolescence Clock" carries the
// brand WORDMARK ("halflife", before the em dash) and the PRODUCT NAME ("AI Job
// Obsolescence Clock", after it); the rendered eyebrow IS the wordmark and the
// rendered tagline LEADS WITH the product name. Nothing pinned the drawn copy to
// the metadata, or the two cards' drawn copy to each other, until now.
//
// The drift this pins is a silent split-brand share, invisible to every build step
// AND to every existing guard, because no other guard reads the JSX TEXT the OG
// images draw (they read metadata fields / manifest / json-ld, not image pixels):
//   (a) the human-gated L1.7b/L5.1 naming pick rewrites `TITLE` in `layout.tsx`
//       (and the manifest/json-ld guards force those metadata copies along) but the
//       words BAKED INTO the share-card PNGs are literals nobody updated — the tab
//       title and unfurl text say the new name while the share IMAGE still draws
//       the old one. `next build` / `tsc --noEmit` stay green (each literal is valid
//       alone); the split only shows as a stale-looking share preview in the wild.
//   (b) the headline/tagline is reworded in ONE card generator but not the other —
//       a fresh-slug role share and the homepage share now draw different words.
//   (c) the `opengraph-image.tsx` `alt` text drifts from the headline the same file
//       draws — the accessible/text-fallback description stops matching the image.
//
// Why this is a NEW surface, not an existing brand guard:
//   - og-card-frame (L5.66/D-096) pins the share-card FRAME the two generators share
//     (size, contentType, runtime, BG/FG/MUTED palette) — never the COPY they draw.
//   - score-band-taxonomy (L5.73/D-101) pins the per-score BAND on the RoleCard
//     (thresholds/labels/blurbs/colours) — never the generic-card marketing copy.
//   - manifest-brand (L5.68/D-099), share-text (L5.72/D-100) and json-ld-brand
//     (L5.69) pin metadata/manifest/json-ld brand FIELDS to `TITLE`/`DESCRIPTION`/
//     `siteName` — they read metadata strings, never the words rendered INTO the OG
//     image. This guard owns exactly that last hop: metadata `TITLE` ⇄ the copy the
//     share-card PNGs actually draw, and the two cards' drawn copy to each other.
//
// Source-of-truth, fully extractive (no hard-coded marketing copy): the wordmark +
// product name come from `layout.tsx`'s `TITLE` (split on the em dash); the headline
// comes from `opengraph-image.tsx`'s `alt` (split on the em dash). Each extracted
// string is then required to appear in the rendered TEXT of the card(s) that should
// draw it — so a reword in any single place breaks the parity.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.79 — the OG sources
// import `next/og` and `@/`-aliased modules (`@/lib/cache/role-cache`,
// `@/lib/scoring/types`) the bare `.mjs` loader can't resolve and that aren't
// installed for the runner — so this reads each source as TEXT, slices the relevant
// component bodies, and extracts the rendered text spans with a JSX-text regex.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const LAYOUT_FILE = "app/layout.tsx";
const OG_DEFAULT_FILE = "app/opengraph-image.tsx";
const OG_ROUTE_FILE = "app/api/og/[slug]/route.tsx";

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// The em dash the brand strings split on. `TITLE` ("wordmark — product name") and
// `alt` ("wordmark — headline") each contain exactly one; the tagline contains its
// own em dash too, but we only split TITLE/alt, never the tagline.
const EM_DASH = "—";

// Pull a `const NAME = "..."` / `export const NAME = "..."` string literal.
function constString(src, name, file) {
  const m = new RegExp(
    `(?:export\\s+)?const\\s+${name}\\s*=\\s*"([^"]+)"`,
  ).exec(src);
  assert.ok(
    m,
    `could not find \`const ${name} = "..."\` in ${file} — renamed or reshaped? ` +
      "update this guard with it.",
  );
  return m[1];
}

// Split a "<left> — <right>" brand string on its single em dash into two trimmed
// halves; assert it really had exactly one so a reformat fails loudly here.
function splitOnEmDash(value, label) {
  const parts = value.split(EM_DASH).map((s) => s.trim());
  assert.equal(
    parts.length,
    2,
    `${label} ("${value}") did not split into exactly two halves on an em dash — ` +
      "the brand-string format changed; update this guard.",
  );
  assert.ok(parts[0] && parts[1], `${label} ("${value}") has an empty half`);
  return parts;
}

// Brace-match a `function NAME(...) { ... }` body, returned inclusive of braces.
// The parameter list is paren-matched FIRST so a destructured/typed signature
// (`function GenericCard({ slug }: { slug: string })`) doesn't trip us into
// returning the destructuring brace `{ slug }` instead of the real body — the
// body's opening `{` is the first `{` AFTER the param list's closing `)`.
function functionBody(src, name, file) {
  const sig = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(sig, `could not find function ${name} in ${file}`);
  const parenOpen = src.indexOf("(", sig.index);
  assert.ok(parenOpen !== -1, `function ${name} in ${file} has no param list`);
  let pdepth = 0;
  let paramEnd = -1;
  for (let i = parenOpen; i < src.length; i++) {
    if (src[i] === "(") pdepth++;
    else if (src[i] === ")") {
      pdepth--;
      if (pdepth === 0) {
        paramEnd = i;
        break;
      }
    }
  }
  assert.ok(paramEnd !== -1, `function ${name} in ${file} has an unbalanced param list`);
  const open = src.indexOf("{", paramEnd);
  assert.ok(open !== -1, `function ${name} in ${file} has no body brace`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  assert.fail(`unbalanced braces in function ${name} of ${file}`);
}

// Extract the rendered JSX text spans from a block: the letter-bearing text nodes
// between `>` and `<` that contain no `{}` (so interpolated expressions are
// excluded — a `{prettySlug}` span contributes only its static surrounding text).
function renderedTextSpans(block) {
  const spans = [];
  for (const m of block.matchAll(/>\s*([^<>{}]*?)\s*</g)) {
    const t = m[1].trim();
    if (t && /[A-Za-z]/.test(t)) spans.push(t);
  }
  return spans;
}

// --- extract the canonical brand strings (source of truth) --------------------

const layoutSrc = read(LAYOUT_FILE);
const ogDefaultSrc = read(OG_DEFAULT_FILE);
const ogRouteSrc = read(OG_ROUTE_FILE);

const TITLE = constString(layoutSrc, "TITLE", LAYOUT_FILE);
const [WORDMARK, PRODUCT_NAME] = splitOnEmDash(TITLE, `${LAYOUT_FILE} TITLE`);

const ALT = constString(ogDefaultSrc, "alt", OG_DEFAULT_FILE);
const [ALT_WORDMARK, HEADLINE] = splitOnEmDash(ALT, `${OG_DEFAULT_FILE} alt`);

// --- slice the card component bodies & their rendered text --------------------

// `opengraph-image.tsx`'s default export IS the generic card, so its whole source
// is the block. The OG route has two cards we slice by name.
const genericCardBody = functionBody(ogRouteSrc, "GenericCard", OG_ROUTE_FILE);
const roleCardBody = functionBody(ogRouteSrc, "RoleCard", OG_ROUTE_FILE);

const defaultSpans = renderedTextSpans(ogDefaultSrc);
const genericSpans = renderedTextSpans(genericCardBody);
const roleSpans = renderedTextSpans(roleCardBody);

const includesSpan = (spans, s) => spans.includes(s);
const someSpanContains = (spans, s) => spans.some((span) => span.includes(s));

test("brand strings parsed from metadata + alt (vacuous-parse guard)", () => {
  // If any extraction silently produced "" the membership checks below could pass
  // trivially (an empty needle is "in" everything). Anchor that every extracted
  // string is non-empty and that the three are pairwise distinct so the parity
  // checks can't collapse onto one string.
  for (const [name, v] of [
    ["WORDMARK", WORDMARK],
    ["PRODUCT_NAME", PRODUCT_NAME],
    ["HEADLINE", HEADLINE],
  ]) {
    assert.ok(v && v.length > 0, `${name} extracted empty`);
  }
  assert.notEqual(WORDMARK, PRODUCT_NAME, "wordmark and product name are identical");
  assert.notEqual(WORDMARK, HEADLINE, "wordmark and headline are identical");
  assert.notEqual(PRODUCT_NAME, HEADLINE, "product name and headline are identical");

  // The card slices must be real, non-empty, and strictly smaller than the full OG
  // route source — otherwise a failed brace-match grabbed the whole file and the
  // span checks would pass for the wrong reason.
  assert.ok(
    genericCardBody.length > 0 && genericCardBody.length < ogRouteSrc.length,
    "GenericCard slice did not isolate a sub-region of the OG route",
  );
  assert.ok(
    roleCardBody.length > 0 && roleCardBody.length < ogRouteSrc.length,
    "RoleCard slice did not isolate a sub-region of the OG route",
  );
  // And the span extraction found real copy on each surface.
  assert.ok(defaultSpans.length > 0, "no rendered text spans in opengraph-image.tsx");
  assert.ok(genericSpans.length > 0, "no rendered text spans in the OG GenericCard");
  assert.ok(roleSpans.length > 0, "no rendered text spans in the OG RoleCard");
});

test("the wordmark is identical in the metadata TITLE and the OG card alt", () => {
  // `TITLE` ("halflife — …") and `alt` ("halflife — …") both lead with the brand
  // wordmark; the page-title brand and the share-image text fallback must agree.
  assert.equal(
    ALT_WORDMARK,
    WORDMARK,
    `${OG_DEFAULT_FILE} alt leads with "${ALT_WORDMARK}" but ${LAYOUT_FILE} TITLE leads ` +
      `with "${WORDMARK}" — the wordmark in the page title and the share-image alt must match.`,
  );
});

test("the wordmark (from TITLE) is the eyebrow drawn on every share card", () => {
  // The rendered eyebrow on each card must be the same brand wordmark the page
  // title advertises — drift it in one PNG and that share is off-brand.
  assert.ok(
    includesSpan(defaultSpans, WORDMARK),
    `${OG_DEFAULT_FILE} does not draw the wordmark "${WORDMARK}" as a text span ` +
      `(spans: ${JSON.stringify(defaultSpans)}).`,
  );
  assert.ok(
    includesSpan(genericSpans, WORDMARK),
    `the OG GenericCard does not draw the wordmark "${WORDMARK}" (spans: ${JSON.stringify(genericSpans)}).`,
  );
  assert.ok(
    includesSpan(roleSpans, WORDMARK),
    `the OG RoleCard does not draw the wordmark "${WORDMARK}" (spans: ${JSON.stringify(roleSpans)}).`,
  );
});

test("the product name (from TITLE) leads the tagline drawn on both generic cards", () => {
  // `TITLE`'s second half ("AI Job Obsolescence Clock") is the product name; both
  // generic cards draw a tagline that begins with it ("… — countdown, score, pivot.").
  assert.ok(
    someSpanContains(defaultSpans, PRODUCT_NAME),
    `${OG_DEFAULT_FILE} draws no tagline containing the product name "${PRODUCT_NAME}" ` +
      `(spans: ${JSON.stringify(defaultSpans)}).`,
  );
  assert.ok(
    someSpanContains(genericSpans, PRODUCT_NAME),
    `the OG GenericCard draws no tagline containing the product name "${PRODUCT_NAME}" ` +
      `(spans: ${JSON.stringify(genericSpans)}).`,
  );
});

test("the headline (from the OG alt) is drawn as text on both generic cards", () => {
  // The headline the `alt` text fallback promises must be the headline the image
  // actually draws — on the default card (so alt ⇄ pixels agree) and on the OG
  // GenericCard (so the homepage share and a fresh-slug share tell one story).
  assert.ok(
    includesSpan(defaultSpans, HEADLINE),
    `${OG_DEFAULT_FILE} alt promises headline "${HEADLINE}" but the card draws no matching ` +
      `text span (spans: ${JSON.stringify(defaultSpans)}).`,
  );
  assert.ok(
    includesSpan(genericSpans, HEADLINE),
    `the OG GenericCard does not draw the headline "${HEADLINE}" (spans: ${JSON.stringify(genericSpans)}) — ` +
      "the homepage default card and the fresh-slug role card must draw the same headline.",
  );
});

test("the drawn copy is distinct, non-trivial text (no vacuous all-match pass)", () => {
  // Guards against the parity checks passing because a slice collapsed to a single
  // repeated token: the generic card must draw the wordmark AND a longer headline
  // (so it isn't just three copies of "halflife"), and the headline must be a
  // multi-word phrase, not a stray letter the JSX-text regex happened to catch.
  assert.ok(
    HEADLINE.split(/\s+/).length >= 3,
    `HEADLINE "${HEADLINE}" is not a multi-word phrase — extraction likely went wrong.`,
  );
  assert.ok(
    genericSpans.some((s) => s !== WORDMARK && s.length > WORDMARK.length),
    "the OG GenericCard draws nothing longer than the wordmark — slice/extraction is degenerate.",
  );
});
