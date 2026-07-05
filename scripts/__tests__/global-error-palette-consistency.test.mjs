// Root-error-boundary palette consistency guard: every `hsl()` colour literal
// inlined in `app/global-error.tsx` must be one of the LIGHT-theme `--color-*`
// tokens declared in `app/globals.css`, and every load-bearing light token the
// page paints (background, foreground, muted-foreground, primary,
// primary-foreground, border) must actually appear in it.
//
// `app/global-error.tsx` is the ONLY App-Router surface that cannot use the
// design tokens. It is the boundary Next.js renders when `app/layout.tsx`
// ITSELF throws, so Next replaces the root layout with it — which means it
// never gets `app/globals.css` (that `@import`/`<link>` lives in the bypassed
// layout) and no CSS variable resolves. Its own header says the palette is
// therefore "inlined as literal hsl() values copied verbatim from the
// light-theme block of `app/globals.css`". Its siblings in the trio —
// `app/error.tsx` (L5.9) and `app/not-found.tsx` (L5.6) — render INSIDE the
// layout and reference the palette through Tailwind/`var(--color-*)` classes,
// so they track `globals.css` automatically. `global-error.tsx` is the one
// hand-copy that does not.
//
// The drift this pins is a silent stale-palette catastrophic-error page,
// invisible to every build step:
//   (a) the light palette is retuned in `app/globals.css` (a launch rebrand
//       moves `--color-primary` off near-black, or the surface warms off pure
//       white). `error.tsx`/`not-found.tsx` follow instantly via `var()`, but
//       the hand-copied hsl() literals in `global-error.tsx` still hold the OLD
//       values. `next build`/`tsc --noEmit` stay green — every hsl() string is
//       valid CSS on its own — yet the one page a user sees when the whole app
//       shell is broken renders in a dead, off-brand palette that matches
//       nothing else on the site.
//   (b) a dark-theme value is pasted in by mistake (the two blocks sit adjacent
//       in `globals.css`); the light subset check below rejects it because the
//       light block's seven values are all distinct from the dark-only ones it
//       would introduce.
//
// Why a NEW surface, not an existing palette guard: theme-color-surface
// (D-041) pins `viewport.themeColor` ↔ the `--color-background` token in BOTH
// schemes — it only reads `layout.tsx` + `globals.css` and never opens
// `global-error.tsx`. design-token-consistency reads `globals.css` alone. No
// guard reads the hsl() literals `global-error.tsx` draws, so nothing pins them
// to the tokens they were copied from. This guard owns exactly that hop.
//
// Why a text guard, not an import: the same D-080 wall the sibling guards hit —
// `app/global-error.tsx` is a Client Component that value-imports React types
// the `.mjs` loader can't resolve, and `app/globals.css` is plain CSS — so it
// reads both as TEXT and compares the extracted, canonicalised hsl() literals,
// exactly the technique L5.57+ use on their surfaces. Achromatic-grey parsing
// is enforced (saturation 0%) so a future chromatic token can't slip through
// mis-canonicalised.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLOBALS_FILE = "app/globals.css";
const GLOBAL_ERROR_FILE = "app/global-error.tsx";

// The load-bearing light tokens `global-error.tsx` paints. It deliberately does
// NOT use `--color-muted` (no skeleton on the catastrophic-error page), so that
// token is allowed-but-not-required.
const REQUIRED_TOKENS = [
  "background",
  "foreground",
  "muted-foreground",
  "primary",
  "primary-foreground",
  "border",
];

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Canonicalise an `hsl(H S% L%)` literal to a single stable string and assert it
// is achromatic (saturation 0%). The whole palette is pure grey today; a future
// chromatic token would parse fine here but the sat===0 assertion makes the
// intent explicit and fails loudly if the converter's grey-only assumption
// silently stops holding.
function canonicalHsl(hsl) {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/.exec(hsl);
  assert.ok(m, `could not parse an achromatic hsl() from ${JSON.stringify(hsl)}`);
  const [h, s, l] = [m[1], m[2], m[3]];
  assert.equal(
    parseFloat(s),
    0,
    `${JSON.stringify(hsl)} is chromatic (saturation ${s}%) — this guard assumes the ` +
      "achromatic palette; extend it before introducing a coloured token.",
  );
  return `hsl(${h} ${s}% ${l}%)`;
}

// Parse the LIGHT-theme `--color-*` tokens: the top-level `@theme { … }` block,
// i.e. everything before the `@media (prefers-color-scheme: dark)` wrapper.
// Returns a Map of token-suffix → canonical hsl (e.g. "primary" → "hsl(0 0% 9%)").
function lightThemeTokens() {
  const src = read(GLOBALS_FILE);
  const darkAt = src.search(/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/);
  assert.ok(
    darkAt > -1,
    `could not find a \`@media (prefers-color-scheme: dark)\` block in ${GLOBALS_FILE}`,
  );
  const lightChunk = src.slice(0, darkAt);
  const tokens = new Map();
  const re = /--color-([a-z-]+):\s*(hsl\([^;]+\))\s*;/g;
  let m;
  while ((m = re.exec(lightChunk)) !== null) {
    tokens.set(m[1], canonicalHsl(m[2]));
  }
  return tokens;
}

// Strip `//` line and `/* */` block comments so prose mentioning "hsl()" in the
// file header (which documents this very invariant) is never scanned as a colour.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// Every distinct `hsl()` literal drawn in app/global-error.tsx, canonicalised.
function globalErrorColors() {
  const src = stripComments(read(GLOBAL_ERROR_FILE));
  const found = new Set();
  const re = /hsl\([^)]*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    found.add(canonicalHsl(m[0]));
  }
  return found;
}

const light = lightThemeTokens();
const lightValues = new Set(light.values());
const geColors = globalErrorColors();

test("both sources parsed non-trivially (vacuous-scan guard)", () => {
  // If either extraction silently returned nothing, the subset/coverage checks
  // below would pass vacuously. Anchor real counts first.
  assert.equal(
    light.size,
    7,
    `expected 7 light \`--color-*\` tokens in ${GLOBALS_FILE}, parsed ${light.size}`,
  );
  // Seven distinct light values → value↔token is a bijection, so the coverage
  // check below can name a token purely by its hsl value without ambiguity.
  assert.equal(
    lightValues.size,
    7,
    "the 7 light --color-* tokens should hold 7 distinct hsl values",
  );
  assert.ok(
    geColors.size >= 5,
    `expected several inlined hsl() literals in ${GLOBAL_ERROR_FILE}, found ${geColors.size}`,
  );
});

test("every hsl() literal in global-error.tsx is a light-theme token (no stale/dark values)", () => {
  // The core invariant: retune the light palette in globals.css and any literal
  // global-error.tsx failed to hand-update drops out of `lightValues` and fires
  // here. Also rejects a dark-theme value pasted in by mistake, since the light
  // block's values are distinct from the dark-only ones.
  for (const color of geColors) {
    assert.ok(
      lightValues.has(color),
      `${color} is drawn in ${GLOBAL_ERROR_FILE} but is not a light --color-* token in ` +
        `${GLOBALS_FILE} — the inlined palette drifted from the tokens it was copied from ` +
        `(light tokens: ${[...lightValues].join(", ")}).`,
    );
  }
});

test("global-error.tsx paints every load-bearing light token", () => {
  // The other direction: if a required surface (say the primary button colour)
  // is dropped or its literal is corrupted, the light token's value is no longer
  // present among the drawn colours and this fails — so the page can't silently
  // lose an on-brand element.
  for (const token of REQUIRED_TOKENS) {
    const value = light.get(token);
    assert.ok(value, `expected a light --color-${token} token in ${GLOBALS_FILE}`);
    assert.ok(
      geColors.has(value),
      `${GLOBAL_ERROR_FILE} does not draw --color-${token} (${value}) — the root-error page ` +
        "must render this surface with the light-theme value it was copied from.",
    );
  }
});
