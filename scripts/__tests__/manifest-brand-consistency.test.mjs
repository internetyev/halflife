// PWA-manifest brand-metadata consistency guard: the install / Add-to-Home-Screen
// identity the web app manifest advertises must stay byte-for-byte in step with the
// page-metadata identity `app/layout.tsx` advertises, and the manifest's two single-
// value colours must match the same `app/globals.css` light-theme surface tokens the
// rest of the chrome paints against.
//
// halflife's brand identity is hand-copied across the metadata family. `app/manifest.ts`
// (the PWA web app manifest Next serves at `/manifest.webmanifest`, auto-injected as
// `<link rel="manifest">`) restates four values that ALSO live in `app/layout.tsx` and
// `app/globals.css`, with nothing pinning the copies together until now:
//
//   1. `name`             = `app/layout.tsx`'s `TITLE` const (the full
//                           "halflife — AI Job Obsolescence Clock" the browser tab,
//                           `<title>` default, and OG/Twitter cards all show)
//   2. `description`      = `app/layout.tsx`'s `DESCRIPTION` const (the same sentence
//                           `metadata.description` + the OG/Twitter `description` use)
//   3. `short_name`       = `app/layout.tsx`'s OpenGraph `siteName` (= "halflife"),
//                           which is ALSO the suffix of the page-title `template`
//                           ("%s · halflife") — the short brand label every surface uses
//   4. `background_color` = the light `--color-background` token in `app/globals.css`
//                           (`hsl(0 0% 100%)` = #ffffff), which is ALSO the light-mode
//                           `viewport.themeColor` value in `app/layout.tsx`; and
//      `theme_color`      = the light `--color-primary` token (`hsl(0 0% 9%)` ≈ #171717)
//
// (The manifest's `id`/`start_url` SITE_URL origin is a different contract, already
// pinned by L5.65's site-origin guard — this guard deliberately does not touch it.)
//
// The drift this pins is a silent split-brand / wrong-splash failure, invisible to
// every build step:
//   (a) the human-gated L1.7b/L5.1 naming pick rewrites `TITLE`/`DESCRIPTION` in
//       `app/layout.tsx` (or the product is renamed) and the edit lands in the browser
//       tab + OG cards but NOT in `app/manifest.ts`. `next build`/`tsc --noEmit` stay
//       green — each string is valid on its own — but now the Add-to-Home-Screen prompt
//       and the OS app drawer show the OLD product name/tagline while every other
//       surface shows the new one: two brands for one site, only visible once installed.
//   (b) `short_name` drifts from the `siteName` / title-template suffix — the install
//       prompt's short label ("halflife") no longer matches the OG `siteName` or the
//       `%s · halflife` page-title suffix, so the launcher icon caption and the share
//       attribution disagree.
//   (c) `background_color` drifts from the light `--color-background` (and from the
//       `viewport.themeColor` light value) — the PWA splash screen / OS task-switcher
//       card renders on a different surface than the app's actual light background, a
//       flash of the wrong colour on every cold launch.
//   (d) `theme_color` drifts from the light `--color-primary` ink — the splash accent /
//       status-bar tint no longer matches the brand's primary colour token.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.67 — `app/manifest.ts`
// and `app/layout.tsx` pull `next` types + `@/`-aliased modules (`@/components/...`,
// `@/lib/seo/json-ld`) the `.mjs` loader can't resolve and that aren't installed for the
// test runner, and `app/globals.css` is plain CSS — so this reads all three sources as
// TEXT and compares the extracted literals (strings + the hsl→hex colour mapping),
// exactly the technique L5.57–L5.67 use on their surfaces. New consistency surface
// (the PWA-manifest brand identity across manifest ↔ layout ↔ globals), NOT a
// continuation of the L5.65 site-origin arc (which pins the manifest's URL origin, a
// field this guard leaves alone), the L5.66 card-frame arc, or the L5.67 icon-family arc.
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

const MANIFEST_FILE = "app/manifest.ts";
const LAYOUT_FILE = "app/layout.tsx";
const GLOBALS_FILE = "app/globals.css";

// --- Extractors -------------------------------------------------------------

// Pull a top-level string field `<key>: "<value>"` out of the object the manifest's
// default export returns. Tolerant of the multi-line `description:\n  "..."` form.
function manifestStringField(src, key) {
  const re = new RegExp(`${key}:\\s*["']([^"']+)["']`);
  const m = re.exec(src);
  assert.ok(
    m,
    `could not find \`${key}: "..."\` in ${MANIFEST_FILE} — renamed or reshaped? ` +
      "update this guard with it.",
  );
  return m[1];
}

// Pull a `const <NAME> =\n  "<value>";` declaration out of app/layout.tsx.
function layoutConst(src, name) {
  const re = new RegExp(`const ${name}\\s*=\\s*["']([^"']+)["']`);
  const m = re.exec(src);
  assert.ok(
    m,
    `could not find \`const ${name} = "..."\` in ${LAYOUT_FILE} — renamed or reshaped? ` +
      "update this guard with it.",
  );
  return m[1];
}

// The OpenGraph `siteName: "..."` in app/layout.tsx — the short brand label.
function layoutSiteName(src) {
  const m = /siteName:\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    m,
    `could not find \`siteName: "..."\` in ${LAYOUT_FILE} — the OpenGraph block was ` +
      "reshaped; update this guard with it.",
  );
  return m[1];
}

// The page-title template `template: "%s · halflife"` → its brand suffix after the
// last separator. The manifest `short_name` must equal this suffix.
function layoutTitleTemplateSuffix(src) {
  const m = /template:\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    m,
    `could not find \`template: "..."\` in ${LAYOUT_FILE} — the title template was ` +
      "reshaped; update this guard with it.",
  );
  const template = m[1];
  // Suffix after the last "·"/"-"/"|" separator, trimmed. "%s · halflife" → "halflife".
  const parts = template.split(/[·\-|]/);
  return parts[parts.length - 1].trim();
}

// The light-mode `viewport.themeColor` colour in app/layout.tsx — the
// `(prefers-color-scheme: light)` entry's hex. Must equal the manifest background_color.
function layoutLightThemeColor(src) {
  const m =
    /\(prefers-color-scheme:\s*light\)["']\s*,\s*color:\s*["'](#[0-9a-fA-F]{6})["']/.exec(
      src,
    );
  assert.ok(
    m,
    `could not find the light-mode \`viewport.themeColor\` entry in ${LAYOUT_FILE} — ` +
      "the themeColor array was reshaped; update this guard with it.",
  );
  return m[1].toLowerCase();
}

// Parse the light-theme `@theme { ... }` block in app/globals.css (the FIRST one;
// the dark block lives inside `@media (prefers-color-scheme: dark)`). Returns the raw
// text of the first `@theme { ... }` body.
function globalsLightThemeBlock(src) {
  const start = src.indexOf("@theme");
  assert.ok(start >= 0, `no \`@theme\` block found in ${GLOBALS_FILE}`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("}", open);
  assert.ok(open >= 0 && close > open, `malformed \`@theme\` block in ${GLOBALS_FILE}`);
  return src.slice(open + 1, close);
}

// Pull a `--<token>: hsl(0 0% <L>%);` value out of a CSS block and convert the
// achromatic hsl to a #rrggbb hex. Only achromatic (saturation 0%) greys are
// supported — the manifest colours are greys, and asserting saturation 0 keeps a
// future chromatic token from being silently mis-converted.
function cssTokenToHex(block, token) {
  const re = new RegExp(`--${token}:\\s*hsl\\(([^)]+)\\)`);
  const m = re.exec(block);
  assert.ok(
    m,
    `could not find \`--${token}: hsl(...)\` in the light @theme block of ${GLOBALS_FILE} — ` +
      "renamed or reshaped? update this guard with it.",
  );
  const nums = m[1].trim().split(/\s+/);
  assert.equal(
    nums.length,
    3,
    `--${token} is not a 3-component \`hsl(H S% L%)\`: ${JSON.stringify(m[1])}`,
  );
  const sat = parseFloat(nums[1]);
  assert.equal(
    sat,
    0,
    `--${token} is not achromatic (saturation ${sat}%); this guard only maps grey hsl→hex`,
  );
  const lightness = parseFloat(nums[2]); // percent
  const v = Math.round((lightness / 100) * 255);
  const hex = v.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

// --- Read sources once -------------------------------------------------------

const manifestSrc = read(MANIFEST_FILE);
const layoutSrc = read(LAYOUT_FILE);
const globalsSrc = read(GLOBALS_FILE);

const manifest = {
  name: manifestStringField(manifestSrc, "name"),
  short_name: manifestStringField(manifestSrc, "short_name"),
  description: manifestStringField(manifestSrc, "description"),
  background_color: manifestStringField(manifestSrc, "background_color").toLowerCase(),
  theme_color: manifestStringField(manifestSrc, "theme_color").toLowerCase(),
};

const layoutTitle = layoutConst(layoutSrc, "TITLE");
const layoutDescription = layoutConst(layoutSrc, "DESCRIPTION");
const layoutSite = layoutSiteName(layoutSrc);
const layoutSuffix = layoutTitleTemplateSuffix(layoutSrc);
const layoutLightChrome = layoutLightThemeColor(layoutSrc);

const lightTheme = globalsLightThemeBlock(globalsSrc);
const cssBackground = cssTokenToHex(lightTheme, "color-background");
const cssPrimary = cssTokenToHex(lightTheme, "color-primary");

// --- Tests ------------------------------------------------------------------

test("all manifest brand fields and their layout/globals sources parsed (vacuous-scan guard)", () => {
  // If any extractor silently returned empty/garbage, every equality below would
  // trivially pass. Anchor each value so a regex drift or a file reshape fails loudly
  // here first, not as a no-op consistency check.
  for (const [k, v] of Object.entries(manifest)) {
    assert.ok(v.length > 0, `manifest.${k} extracted empty from ${MANIFEST_FILE}`);
  }
  assert.ok(layoutTitle.length > 0, `TITLE extracted empty from ${LAYOUT_FILE}`);
  assert.ok(
    layoutDescription.length > 0,
    `DESCRIPTION extracted empty from ${LAYOUT_FILE}`,
  );
  assert.ok(layoutSite.length > 0, `siteName extracted empty from ${LAYOUT_FILE}`);
  assert.ok(
    layoutSuffix.length > 0,
    `title-template suffix extracted empty from ${LAYOUT_FILE}`,
  );
  // Both manifest colours are 6-digit hex (so the hsl→hex comparison is meaningful).
  for (const key of ["background_color", "theme_color"]) {
    assert.match(
      manifest[key],
      /^#[0-9a-f]{6}$/,
      `manifest.${key} (${manifest[key]}) is not a 6-digit hex colour`,
    );
  }
});

test("manifest.name is byte-for-byte app/layout.tsx's TITLE", () => {
  // The full product name the install prompt / OS app drawer shows must equal the
  // browser-tab + OG/Twitter title. A rename in one place but not the other ships a
  // split brand visible only once installed.
  assert.equal(
    manifest.name,
    layoutTitle,
    `manifest.name (${JSON.stringify(manifest.name)}) != layout TITLE ` +
      `(${JSON.stringify(layoutTitle)}). Update both together — the install name must ` +
      "match the page title.",
  );
});

test("manifest.description is byte-for-byte app/layout.tsx's DESCRIPTION", () => {
  // The install prompt's tagline must equal the meta description + OG/Twitter
  // description so the share/install copy reads as one voice.
  assert.equal(
    manifest.description,
    layoutDescription,
    `manifest.description != layout DESCRIPTION. Update both together — the install ` +
      "tagline must match the meta description.",
  );
});

test("manifest.short_name equals the OpenGraph siteName and the page-title-template suffix", () => {
  // The short brand label appears in three places that must agree: the manifest
  // `short_name` (launcher caption), the OG `siteName` (share attribution), and the
  // `%s · halflife` title-template suffix (every page's <title>).
  assert.equal(
    manifest.short_name,
    layoutSite,
    `manifest.short_name (${JSON.stringify(manifest.short_name)}) != OpenGraph siteName ` +
      `(${JSON.stringify(layoutSite)}).`,
  );
  assert.equal(
    manifest.short_name,
    layoutSuffix,
    `manifest.short_name (${JSON.stringify(manifest.short_name)}) != title-template suffix ` +
      `(${JSON.stringify(layoutSuffix)} from "%s · halflife"). The short brand label must be ` +
      "identical across the install prompt, the OG siteName, and the page-title suffix.",
  );
});

test("manifest.background_color matches the light --color-background token and the viewport light themeColor", () => {
  // The PWA splash / OS task-switcher surface must equal the app's actual light
  // background (`--color-background` in globals.css) AND the per-page chrome tint the
  // layout already paints for light mode — otherwise the launch surface flashes a
  // colour the running app never uses.
  assert.equal(
    manifest.background_color,
    cssBackground,
    `manifest.background_color (${manifest.background_color}) != light --color-background ` +
      `(${cssBackground} from globals.css). The splash surface must match the app background.`,
  );
  assert.equal(
    manifest.background_color,
    layoutLightChrome,
    `manifest.background_color (${manifest.background_color}) != viewport light themeColor ` +
      `(${layoutLightChrome} in ${LAYOUT_FILE}). The splash surface and the light chrome tint ` +
      "must be the same colour.",
  );
});

test("manifest.theme_color matches the light --color-primary token", () => {
  // The splash accent / status-bar tint must equal the brand's primary ink token, the
  // value globals.css defines as `--color-primary` for light mode (≈ #171717).
  assert.equal(
    manifest.theme_color,
    cssPrimary,
    `manifest.theme_color (${manifest.theme_color}) != light --color-primary ` +
      `(${cssPrimary} from globals.css). The splash accent must match the brand primary ink.`,
  );
});
