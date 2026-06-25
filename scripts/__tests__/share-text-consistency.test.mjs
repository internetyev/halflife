// Share-text parity guard: the page title and the OpenGraph + Twitter share-card
// titles in `app/layout.tsx` must all be ONE string, and likewise the page
// description and the OpenGraph + Twitter share-card descriptions must all be one
// string. A link to halflife rendered in a browser tab (`<title>`), unfurled on
// Facebook/LinkedIn (OpenGraph), and unfurled on X/Twitter (`twitter:` card)
// should read identically — same headline, same blurb.
//
// `app/layout.tsx` defines two module constants, `TITLE` and `DESCRIPTION`, then
// references them by identifier in three places each: `metadata.title.default`
// (the page `<title>` default), `metadata.openGraph.{title,description}`, and
// `metadata.twitter.{title,description}`. They are in sync TODAY only because all
// three reuse the same constant — nothing pins that. A future edit that hardcodes
// `twitter.title: "halflife"` (or drops a field back to a stale literal) drifts
// the X share card from the OG card and the tab title with `next build` /
// `tsc --noEmit` fully green: each string literal is valid alone, so the split is
// invisible to every build step and only shows up as mismatched unfurls in the
// wild.
//
// Why this is a NEW surface, not D-099's manifest guard: manifest-brand
// (L5.68/D-099) pins `manifest.name` ↔ `TITLE` and `manifest.description` ↔
// `DESCRIPTION` — it anchors the manifest to the constants but never looks at the
// OpenGraph / Twitter fields, so the in-`layout.tsx` parity between the page
// title, the OG title, and the Twitter title (and the three descriptions) is
// unpinned. This guard owns exactly that contract.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.71 — `app/layout.tsx`
// value-imports `@/`-aliased modules and `next` types the `.mjs` loader can't
// resolve and that aren't installed for the test runner — so it reads the source
// as TEXT, extracts each field's right-hand side, and resolves an identifier
// (`TITLE`/`DESCRIPTION`) to the constant's value or a `"..."` literal to itself,
// then asserts all three title surfaces resolve to one string and all three
// description surfaces resolve to one string.
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

const src = readFileSync(join(REPO_ROOT, LAYOUT_FILE), "utf8");

// The module-level brand constants the share metadata is supposed to reuse.
function constValue(name) {
  const m = new RegExp(`const ${name}\\s*=\\s*"([^"]*)"`).exec(src);
  return m ? m[1] : null;
}
const TITLE = constValue("TITLE");
const DESCRIPTION = constValue("DESCRIPTION");

// Resolve a captured right-hand side to a concrete string: a bare identifier
// `TITLE`/`DESCRIPTION` resolves to the constant's value; a `"..."` literal
// resolves to itself; anything else stays as the raw token so a mismatch is
// surfaced loudly rather than silently treated as equal.
function resolveToken(raw) {
  if (raw == null) return null;
  const t = raw.trim();
  const lit = /^"([^"]*)"$/.exec(t);
  if (lit) return lit[1];
  if (t === "TITLE") return TITLE;
  if (t === "DESCRIPTION") return DESCRIPTION;
  return t;
}

// An identifier (TITLE) or a double-quoted literal.
const RHS = `([A-Za-z_$][\\w$]*|"[^"]*")`;

const metaIdx = src.indexOf("export const metadata");
const ogIdx = src.indexOf("openGraph:", metaIdx);
const twIdx = src.indexOf("twitter:", ogIdx);

// metadata head: from `export const metadata` up to the `openGraph:` block —
// holds the page-title object (`title: { default: … }`) and the top-level
// `description:`.
const metaHead = metaIdx > -1 && ogIdx > -1 ? src.slice(metaIdx, ogIdx) : "";
const ogBlock = ogIdx > -1 && twIdx > -1 ? src.slice(ogIdx, twIdx) : "";
const twBlock = twIdx > -1 ? src.slice(twIdx) : "";

function grab(chunk, key) {
  const m = new RegExp(`${key}:\\s*${RHS}`).exec(chunk);
  return m ? m[1] : null;
}

const titleDefaultRaw = (() => {
  const m = new RegExp(`title:\\s*\\{[^}]*default:\\s*${RHS}`).exec(metaHead);
  return m ? m[1] : null;
})();

const fields = {
  pageTitle: titleDefaultRaw,
  ogTitle: grab(ogBlock, "title"),
  twTitle: grab(twBlock, "title"),
  pageDescription: grab(metaHead, "description"),
  ogDescription: grab(ogBlock, "description"),
  twDescription: grab(twBlock, "description"),
};

test("the brand constants and all six share fields were actually parsed (vacuous-scan guard)", () => {
  // If any extraction silently failed the equality checks below would compare
  // null === null and pass trivially. Anchor presence first.
  assert.ok(TITLE, `could not extract the TITLE constant from ${LAYOUT_FILE}`);
  assert.ok(DESCRIPTION, `could not extract the DESCRIPTION constant from ${LAYOUT_FILE}`);
  for (const [name, raw] of Object.entries(fields)) {
    assert.ok(raw, `could not extract the ${name} field from ${LAYOUT_FILE}`);
  }
});

test("the page <title> default resolves to the TITLE constant", () => {
  assert.equal(
    resolveToken(fields.pageTitle),
    TITLE,
    `metadata.title.default (${JSON.stringify(fields.pageTitle)}) must be the TITLE constant ` +
      `(${JSON.stringify(TITLE)}) — the browser-tab title is the anchor every share card mirrors.`,
  );
});

test("the OpenGraph and Twitter titles both equal the page title (one share headline)", () => {
  const page = resolveToken(fields.pageTitle);
  assert.equal(
    resolveToken(fields.ogTitle),
    page,
    `openGraph.title (${JSON.stringify(fields.ogTitle)}) must match the page title ` +
      `(${JSON.stringify(page)}) — a Facebook/LinkedIn unfurl should read like the tab.`,
  );
  assert.equal(
    resolveToken(fields.twTitle),
    page,
    `twitter.title (${JSON.stringify(fields.twTitle)}) must match the page title ` +
      `(${JSON.stringify(page)}) — an X unfurl should read like the tab and the OG card.`,
  );
});

test("the OpenGraph and Twitter descriptions both equal the page description (one share blurb)", () => {
  const page = resolveToken(fields.pageDescription);
  assert.equal(
    resolveToken(fields.ogDescription),
    page,
    `openGraph.description (${JSON.stringify(fields.ogDescription)}) must match the page ` +
      `description (${JSON.stringify(page)}).`,
  );
  assert.equal(
    resolveToken(fields.twDescription),
    page,
    `twitter.description (${JSON.stringify(fields.twDescription)}) must match the page ` +
      `description (${JSON.stringify(page)}).`,
  );
});

test("the share title and description are distinct, non-empty strings", () => {
  // Guards against the parity checks passing vacuously because every field
  // collapsed to "" or the same value (title === description).
  assert.ok(TITLE.length > 0, "TITLE is empty");
  assert.ok(DESCRIPTION.length > 0, "DESCRIPTION is empty");
  assert.notEqual(
    TITLE,
    DESCRIPTION,
    "TITLE and DESCRIPTION are identical — the title and blurb should differ.",
  );
});
