// Score-band taxonomy consistency guard: the five-band score taxonomy (D-019)
// is implemented TWICE — once in `components/result-card.tsx` (the on-page
// result card, as a `bandFor(score)` returning Tailwind class strings) and once
// in `app/api/og/[slug]/route.tsx` (the 1200×630 share card, as a `bandFor(score)`
// returning inline hex because Satori only reads inline styles). The OG route's
// header literally promises the two "use identical band labels + colours"; this
// test pins that promise.
//
// What's pinned: both `bandFor` functions must agree on (a) the four score
// thresholds that split the five bands (20/40/60/80, strictly ascending),
// (b) the five band labels in order (Urgent / At risk / Contested / Durable /
// Stable), (c) the five band blurbs in order (the one-line explanations), and
// (d) the five band colours — compared across representations by mapping the
// card's Tailwind `bg-<hue>-500` fill class to the Tailwind v3 hex the OG route
// inlines (e.g. `bg-red-500` ⇄ `#ef4444`).
//
// The drift it pins is invisible to every build step: a future edit that
// renames a band ("At risk" → "Exposed"), moves a threshold (`< 40` → `< 45`),
// rewords a blurb, or recolours one band in ONE file leaves `next build` /
// `tsc --noEmit` fully green — each literal is valid alone — but the on-page card
// and the share card now disagree: a role shown as "Contested" amber on the page
// unfurls as "At risk" orange on LinkedIn, or the gauge fill no longer matches
// the share card's bar. The split only shows up as a mismatched share preview in
// the wild, long after the commit that caused it.
//
// Why this is a NEW surface, not the OG-card-frame guard (L5.66/D-096): that
// guard pins the share-card FRAME the two card generators share (size,
// contentType, runtime, BG/FG/MUTED palette) and that twitter-image re-exports
// the OG card — it never inspects the per-score BAND taxonomy (thresholds,
// labels, blurbs, band colours), which lives in `result-card.tsx` (not a card
// generator) and the OG route's `bandFor`. This guard owns exactly the
// score→band contract across those two files.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.72 — both sources
// value-import `@/`-aliased modules (`@/lib/scoring/types`, `@/lib/cache/...`)
// and `next/og` types the `.mjs` loader can't resolve and that aren't installed
// for the test runner — so it reads each source as TEXT, slices the `bandFor`
// function body, and extracts the ordered threshold / label / blurb / colour
// sequences with regexes, then compares the two sequences.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CARD_FILE = "components/result-card.tsx";
const OG_FILE = "app/api/og/[slug]/route.tsx";

const cardSrc = readFileSync(join(REPO_ROOT, CARD_FILE), "utf8");
const ogSrc = readFileSync(join(REPO_ROOT, OG_FILE), "utf8");

// Tailwind v3 hue → 500-shade hex, for the five hues the card's gauge fill uses.
// This is the bridge between the card's class strings (`bg-red-500`) and the OG
// route's inline hex (`#ef4444`). If the card ever picks a hue outside this map,
// `tailwindFillToHex` returns null and the vacuous-scan guard fails loudly.
const TAILWIND_500 = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  emerald: "#10b981",
  sky: "#0ea5e9",
};

// Slice the body of `function bandFor(...) { ... }` from `return { ... };` (the
// `score >= 80` fall-through) inclusive. We brace-match from the `{` after the
// signature to keep the slice self-contained and immune to later helpers.
function bandForBody(src, file) {
  const sig = /function bandFor\s*\([^)]*\)\s*:\s*\w+\s*\{/.exec(src);
  assert.ok(sig, `could not find a bandFor(score) function in ${file}`);
  let depth = 0;
  const start = sig.index + sig[0].length - 1; // at the opening `{`
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail(`unbalanced braces in bandFor of ${file}`);
}

// Ordered list of the `score < N` thresholds, in source order.
function thresholds(body) {
  return [...body.matchAll(/score\s*<\s*(\d+)/g)].map((m) => Number(m[1]));
}

// Ordered list of every `<key>: "<value>"` for a given key, in source order.
function stringField(body, key) {
  return [...body.matchAll(new RegExp(`${key}:\\s*"([^"]*)"`, "g"))].map((m) => m[1]);
}

// The card encodes band colour as a Tailwind `fill: "bg-<hue>-500"` class; map
// each to the shared hex vocabulary so it can be compared with the OG hex.
function cardColors(body) {
  return [...body.matchAll(/fill:\s*"bg-([a-z]+)-500"/g)].map(
    (m) => TAILWIND_500[m[1]] ?? null,
  );
}

// The OG route encodes band colour as `color: "#rrggbb"` inline hex.
function ogColors(body) {
  return [...body.matchAll(/color:\s*"(#[0-9a-fA-F]{6})"/g)].map((m) =>
    m[1].toLowerCase(),
  );
}

const cardBody = bandForBody(cardSrc, CARD_FILE);
const ogBody = bandForBody(ogSrc, OG_FILE);

const card = {
  thresholds: thresholds(cardBody),
  labels: stringField(cardBody, "label"),
  blurbs: stringField(cardBody, "blurb"),
  colors: cardColors(cardBody),
};
const og = {
  thresholds: thresholds(ogBody),
  labels: stringField(ogBody, "label"),
  blurbs: stringField(ogBody, "blurb"),
  colors: ogColors(ogBody),
};

test("both bandFor functions parsed into the expected shape (vacuous-scan guard)", () => {
  // If an extraction silently returned [] the equality checks below would
  // compare [] vs [] (or all-equal) and pass trivially. Anchor counts first:
  // five bands ⇒ four thresholds, five labels, five blurbs, five colours.
  for (const [name, side] of [["card", card], ["og", og]]) {
    assert.equal(side.thresholds.length, 4, `${name}: expected 4 thresholds, got ${side.thresholds.length}`);
    assert.equal(side.labels.length, 5, `${name}: expected 5 labels, got ${side.labels.length}`);
    assert.equal(side.blurbs.length, 5, `${name}: expected 5 blurbs, got ${side.blurbs.length}`);
    assert.equal(side.colors.length, 5, `${name}: expected 5 colours, got ${side.colors.length}`);
  }
  // No colour failed to resolve through the Tailwind map / hex regex.
  assert.ok(
    card.colors.every(Boolean),
    `${CARD_FILE}: a gauge fill class is not a known Tailwind hue (got ${JSON.stringify(card.colors)})`,
  );
  assert.ok(
    og.colors.every(Boolean),
    `${OG_FILE}: a band colour is not a 6-digit hex (got ${JSON.stringify(og.colors)})`,
  );
});

test("the four score thresholds are strictly ascending and identical across the two cards", () => {
  for (let i = 1; i < card.thresholds.length; i++) {
    assert.ok(
      card.thresholds[i] > card.thresholds[i - 1],
      `${CARD_FILE}: thresholds not strictly ascending: ${JSON.stringify(card.thresholds)}`,
    );
  }
  assert.deepEqual(
    og.thresholds,
    card.thresholds,
    `the OG route's score thresholds (${JSON.stringify(og.thresholds)}) must match the result ` +
      `card's (${JSON.stringify(card.thresholds)}) — the same score must land in the same band ` +
      `on the page and on the share card.`,
  );
});

test("the five band labels are identical, in order, across the two cards", () => {
  assert.deepEqual(
    og.labels,
    card.labels,
    `the OG route's band labels (${JSON.stringify(og.labels)}) must match the result card's ` +
      `(${JSON.stringify(card.labels)}) — a role shown as "Contested" on the page must unfurl as ` +
      `"Contested" on LinkedIn/X.`,
  );
});

test("the five band blurbs are identical, in order, across the two cards", () => {
  assert.deepEqual(
    og.blurbs,
    card.blurbs,
    `the OG route's band blurbs must match the result card's, word for word, so the share card and ` +
      `the page tell the same story.`,
  );
});

test("the five band colours are identical, in order, across the two cards (Tailwind ⇄ hex)", () => {
  assert.deepEqual(
    og.colors,
    card.colors,
    `the OG route's band hexes (${JSON.stringify(og.colors)}) must match the result card's Tailwind ` +
      `fill hues mapped to hex (${JSON.stringify(card.colors)}) — the gauge fill and the share-card ` +
      `bar should be the same colour for the same band.`,
  );
});

test("the band labels are distinct and non-empty (no vacuous all-equal pass)", () => {
  // Guards against the parity checks passing because every label collapsed to ""
  // or the five bands silently deduplicated to one.
  assert.equal(new Set(card.labels).size, 5, `band labels are not all distinct: ${JSON.stringify(card.labels)}`);
  assert.ok(card.labels.every((l) => l.length > 0), "a band label is empty");
});
