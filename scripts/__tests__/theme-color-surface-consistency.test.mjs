// Browser-chrome-tint ↔ page-surface consistency guard: the per-page mobile-chrome
// tint `app/layout.tsx` advertises (`viewport.themeColor`) must match the page
// background the app actually paints (`--color-background` in `app/globals.css`),
// in BOTH the light and the dark colour scheme.
//
// `app/layout.tsx` exports a two-entry `viewport.themeColor` array — one
// `{ media: "(prefers-color-scheme: light)", color }` and one
// `(prefers-color-scheme: dark)` — that tints the mobile browser chrome (Chrome
// Android address bar, Safari iOS status bar) so the top of the viewport blends
// into the page surface instead of clashing on a dark-mode load. Its own header
// (L5.* / D-041 context) says "Hex values match the `--color-background` tokens
// in `app/globals.css` light/dark blocks". `app/globals.css` declares
// `--color-background` twice: once in the top-level `@theme` block (the LIGHT
// surface, `hsl(0 0% 100%)` = #ffffff) and once inside
// `@media (prefers-color-scheme: dark) { @theme { … } }` (the DARK surface,
// `hsl(0 0% 3.9%)` = #0a0a0a). Nothing pinned the two copies — different files,
// different colour spaces (layout = hex, globals = hsl) — together until now.
//
// Why this is a NEW surface, not D-098's manifest guard: D-098/L5.68 pins the
// manifest's single `background_color` to the LIGHT `--color-background` AND the
// LIGHT `viewport.themeColor` value — it only ever touches the light scheme (the
// manifest has no dark field). The DARK chrome tint ↔ dark `--color-background`
// parity, plus the structure of the `themeColor` array itself (exactly the two
// schemes, each a valid hex), is unpinned. This guard owns that contract across
// BOTH schemes in one place.
//
// The drift it pins is a silent dark-mode chrome clash, invisible to every build
// step:
//   (a) the dark surface token changes (`--color-background` in the dark `@theme`
//       moves to a new near-black) but the dark `viewport.themeColor` entry is not
//       updated (or vice-versa) — `next build`/`tsc --noEmit` stay green (each hex
//       / hsl literal is valid alone) but on a dark-mode phone the address-bar tint
//       no longer matches the page background: a visible seam at the top of the
//       viewport, the exact clash the `themeColor` array exists to prevent.
//   (b) the light surface drifts the same way (already half-covered by D-098 via
//       the manifest, re-anchored here so the light + dark checks live together).
//   (c) the `themeColor` array loses an entry, gains a third, or both entries
//       point at the same scheme — so one scheme silently has no chrome tint and
//       falls back to the browser default.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.70 — `app/layout.tsx`
// value-imports `@/`-aliased modules and `next` types the `.mjs` loader can't
// resolve and that aren't installed for the test runner, and `app/globals.css` is
// plain CSS — so it reads both sources as TEXT and compares the extracted colour
// literals (mapping the achromatic `hsl(0 0% L%)` tokens to hex, asserting
// saturation 0% so a future chromatic token can't be silently mis-converted),
// exactly the technique L5.57–L5.70 use on their surfaces.
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
const GLOBALS_FILE = "app/globals.css";

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Normalise a 3- or 6-digit `#rgb`/`#rrggbb` to lowercase `#rrggbb`.
function hexToCanonical(hex) {
  let h = hex.replace(/^#/, "").toLowerCase();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  assert.equal(h.length, 6, `hex ${JSON.stringify(hex)} is not 3- or 6-digit`);
  return `#${h}`;
}

// Map an achromatic `hsl(0 0% L%)` (saturation 0 → pure grey) to canonical hex.
// Asserts saturation is 0% so a future chromatic token (a real hue/sat) fails
// loudly here instead of being silently flattened to grey.
function hslGreyToHex(hsl) {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/.exec(hsl);
  assert.ok(m, `could not parse hsl() from ${JSON.stringify(hsl)}`);
  const sat = parseFloat(m[2]);
  assert.equal(
    sat,
    0,
    `${JSON.stringify(hsl)} is chromatic (saturation ${sat}%); this grey-only ` +
      "converter would mis-map it — extend the converter before using a colour token.",
  );
  const lightness = parseFloat(m[3]);
  const v = Math.round((lightness / 100) * 255);
  const byte = v.toString(16).padStart(2, "0");
  return `#${byte}${byte}${byte}`;
}

// Extract the two `{ media: "(prefers-color-scheme: <scheme>)", color: "<hex>" }`
// entries from app/layout.tsx's `viewport.themeColor`, in source order.
function themeColorEntries() {
  const src = read(LAYOUT_FILE);
  const re =
    /media:\s*["']\(prefers-color-scheme:\s*(light|dark)\)["']\s*,\s*color:\s*["'](#[0-9a-fA-F]{3,8})["']/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ scheme: m[1], hex: hexToCanonical(m[2]) });
  }
  return out;
}

// Extract the light + dark `--color-background` tokens from app/globals.css.
// The dark token is the one inside `@media (prefers-color-scheme: dark)`; the
// light token is the first declaration before that block.
function backgroundTokens() {
  const src = read(GLOBALS_FILE);
  const darkAt = src.search(/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/);
  assert.ok(
    darkAt > -1,
    `could not find a \`@media (prefers-color-scheme: dark)\` block in ${GLOBALS_FILE}`,
  );
  const before = src.slice(0, darkAt);
  const after = src.slice(darkAt);
  const grab = (chunk) => {
    const m = /--color-background:\s*([^;]+);/.exec(chunk);
    return m ? m[1].trim() : null;
  };
  return { light: grab(before), dark: grab(after) };
}

const entries = themeColorEntries();
const bg = backgroundTokens();
const byScheme = Object.fromEntries(entries.map((e) => [e.scheme, e.hex]));

test("both themeColor entries and both --color-background tokens parsed (vacuous-scan guard)", () => {
  // If any extraction silently failed, the equality checks below would trivially
  // pass against undefined/empty values. Anchor counts + presence first.
  assert.equal(
    entries.length,
    2,
    `expected exactly 2 viewport.themeColor entries in ${LAYOUT_FILE}, parsed ${entries.length}`,
  );
  assert.ok(bg.light, `could not extract the light --color-background from ${GLOBALS_FILE}`);
  assert.ok(bg.dark, `could not extract the dark --color-background from ${GLOBALS_FILE}`);
});

test("the themeColor array covers exactly the light and dark schemes (no dupes/gaps)", () => {
  // Guards against an entry losing/duplicating its media scheme, which would leave
  // one colour scheme with no chrome tint (browser-default) while the other has two.
  const schemes = entries.map((e) => e.scheme).sort();
  assert.deepEqual(
    schemes,
    ["dark", "light"],
    `viewport.themeColor must declare exactly one light and one dark entry — got [${schemes.join(", ")}]`,
  );
});

test("the light chrome tint matches the light --color-background surface", () => {
  // Re-anchors the light parity (also touched by D-098 via the manifest) so the
  // light + dark checks live in one place.
  assert.equal(
    byScheme.light,
    hslGreyToHex(bg.light),
    `light viewport.themeColor (${byScheme.light}) must equal the light --color-background ` +
      `${JSON.stringify(bg.light)} (= ${hslGreyToHex(bg.light)}) — the chrome tint should match the page surface.`,
  );
});

test("the dark chrome tint matches the dark --color-background surface", () => {
  // The load-bearing NEW invariant: the dark-mode address-bar/status-bar tint must
  // equal the dark page background, or a dark-mode load shows a seam at the top of
  // the viewport. Not covered anywhere else (the manifest has no dark field).
  assert.equal(
    byScheme.dark,
    hslGreyToHex(bg.dark),
    `dark viewport.themeColor (${byScheme.dark}) must equal the dark --color-background ` +
      `${JSON.stringify(bg.dark)} (= ${hslGreyToHex(bg.dark)}) — the dark chrome tint should match the dark page surface.`,
  );
});

test("the light and dark surfaces are actually different colours", () => {
  // Sanity check that the two schemes weren't accidentally collapsed to one
  // colour (which would defeat the per-scheme tint entirely).
  assert.notEqual(
    byScheme.light,
    byScheme.dark,
    `light and dark viewport.themeColor are both ${byScheme.light} — the two schemes should tint differently.`,
  );
  assert.notEqual(
    hslGreyToHex(bg.light),
    hslGreyToHex(bg.dark),
    "light and dark --color-background resolve to the same hex — the two surfaces should differ.",
  );
});
