// Design-token consistency guard: every `--color-*` design token referenced via
// a literal `var(--color-X)` in the app's pages/components/stylesheet must be
// DEFINED in `app/globals.css`'s `@theme` palette, and the light and dark theme
// blocks must define the SAME set of tokens.
//
// halflife's palette is a Tailwind v4 `@theme` block in `app/globals.css`: a
// light `@theme { --color-background: …; … }` and a dark
// `@media (prefers-color-scheme: dark) { @theme { … } }`. Components consume the
// palette two ways — Tailwind utility classes (`bg-background`, generated from
// the token) and, for the inline `next/og` / style-object cases, a literal
// `var(--color-foreground)`. Nothing pins a `var(--color-X)` reference to a real
// token definition, and nothing pins the light token set to the dark one.
//
// Two silent-correctness drifts ship green past `next build` / `tsc --noEmit`
// (a CSS custom property is just an identifier; an undefined `var()` resolves to
// nothing rather than erroring, and a token defined in one `@theme` but not the
// other is still valid CSS):
//
//   (a) Dangling token reference. Rename `--color-muted-foreground` →
//       `--color-subtle` in `globals.css` (updating the Tailwind-class call
//       sites) but miss a literal `var(--color-muted-foreground)` in a style
//       object — the build is clean and the property silently falls back to its
//       inherited/initial value, so that text quietly renders the wrong colour.
//
//   (b) Light/dark token-set skew. Add `--color-accent` to the light `@theme`
//       and wire it into a component, but forget the dark `@theme` — every
//       `var(--color-accent)` / `accent` utility then silently inherits the
//       LIGHT value in dark mode (the token simply isn't redefined there), an
//       off-theme colour invisible until someone views the page in dark mode.
//
// This is the design-token analogue of L5.64's internal-link integrity guard
// (link ⊆ routes) and the L5.58 build-scripts guard (referenced ⊆ defined),
// applied to a genuinely new surface — the CSS palette. L5.71's
// theme-color-surface guard pins only `--color-background` (the `themeColor`
// chrome tint ↔ the surface); it never reads the rest of the palette, the
// `var()` call sites, or the light/dark token SET. This guard owns that.
//
// DIRECTIONAL, by design: use ⊆ definition. Every literal `var(--color-X)` must
// resolve to a defined token, but NOT the reverse — a token defined for
// consumption only via a Tailwind utility class (`bg-primary`, the idiomatic
// `@theme` use) legitimately has zero literal `var()` call sites, so an
// "unused" token never fails. Catching a dead token would mean parsing every
// Tailwind class name back to its token, out of scope here.
//
// SCOPE — `--color-*` tokens and literal `var(--color-X)` references only (the
// app's palette surface). Tailwind-default tokens not declared in this repo's
// `@theme` (`--spacing-*`, `--font-*`, …) and class-name consumption are out of
// scope. Like the L5.57–L5.80 arc it reads source as TEXT (no import / no render):
// `globals.css` is CSS the `.mjs` loader can't execute and the components import
// `next/og` + `@/`-aliased modules it can't resolve, so it needs no
// `node_modules`/alias resolution and runs identically on the routine laptop and
// CI.
//
// Pure Node built-ins, no npm install — run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLOBALS_FILE = join(REPO_ROOT, "app", "globals.css");

// Dirs scanned for literal `var(--color-X)` call sites. `app/` holds the pages,
// the `next/og` generators, and `globals.css` itself (the html/body refs);
// `components/` holds the shared chrome. Scripts/data/docs never reference the
// palette, so they're out of scope.
const USE_DIRS = ["app", "components"];
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|css)$/;

// The core palette this repo ships today. Used only as a drop-detector anchor
// (known ⊆ defined) so the suite also fails if a future edit REMOVES one of
// these definitions, not only when a new dangling `var()` is added.
const KNOWN_CORE_TOKENS = [
  "--color-background",
  "--color-foreground",
  "--color-muted",
  "--color-muted-foreground",
  "--color-border",
  "--color-primary",
  "--color-primary-foreground",
];

// --- CSS / source comment stripping ----------------------------------------

// Block comments are valid in both CSS and JS, so strip them everywhere first.
function stripBlockComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

// JS/TS line comments too, but guard against a preceding `:` so a `var(...)`
// inside an external `https://…` string is never mangled (mirrors the
// internal-link guard's line-comment strip).
function stripLineComments(src) {
  return src.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// --- Brace matching --------------------------------------------------------

// Given the index of an opening `{`, return the index of its matching `}`
// (or -1). Lets us extract a `@theme { … }` / `@media (…) { … }` body without a
// CSS parser.
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Find the `{ … }` block whose header matches `headerRe`. Returns
// `{ open, close, body }` (open/close are the brace indices) or null.
function blockFor(src, headerRe) {
  const m = headerRe.exec(src);
  if (!m) return null;
  const open = src.indexOf("{", m.index + m[0].length - 1);
  if (open < 0) return null;
  const close = matchBrace(src, open);
  if (close < 0) return null;
  return { open, close, body: src.slice(open + 1, close) };
}

// --- Parse the globals.css palette -----------------------------------------

const css = stripBlockComments(readFileSync(GLOBALS_FILE, "utf8"));

// The dark palette lives inside `@media (prefers-color-scheme: dark) { … }`.
const darkMedia = blockFor(
  css,
  /@media\s*\([^)]*prefers-color-scheme\s*:\s*dark[^)]*\)\s*/,
);

// Collect every `@theme { … }` block, then classify by whether it sits inside
// the dark media range. The light `@theme` is the one outside it; the dark
// `@theme` is the one inside.
function collectThemeBlocks() {
  const blocks = [];
  const re = /@theme\s*\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const open = css.indexOf("{", m.index);
    if (open < 0) continue;
    const close = matchBrace(css, open);
    if (close < 0) continue;
    blocks.push({ open, close, body: css.slice(open + 1, close) });
    re.lastIndex = close; // don't re-enter this block's interior
  }
  return blocks;
}

const themeBlocks = collectThemeBlocks();
const inDark = (idx) =>
  darkMedia !== null && idx > darkMedia.open && idx < darkMedia.close;
const lightTheme = themeBlocks.find((b) => !inDark(b.open)) ?? null;
const darkTheme = themeBlocks.find((b) => inDark(b.open)) ?? null;

// Token DEFINITIONS in a block: `--color-foo:` (declaration, followed by `:`).
function definedTokens(block) {
  const set = new Set();
  if (!block) return set;
  const re = /(--color-[a-z0-9-]+)\s*:/g;
  let m;
  while ((m = re.exec(block.body)) !== null) set.add(m[1]);
  return set;
}

const lightTokens = definedTokens(lightTheme);
const darkTokens = definedTokens(darkTheme);

// --- Scan literal var(--color-X) call sites --------------------------------

function collectSourceFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // dir absent on this checkout
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      if (entry.name === ".next" || entry.name === "dist") continue;
      out.push(...collectSourceFiles(full));
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// `var(--color-x)` or `var(--color-x, fallback)` — capture the token name; the
// fallback tail and closing paren are irrelevant to whether the token resolves.
const VAR_USE = /var\(\s*(--color-[a-z0-9-]+)/g;

function collectUses() {
  const out = new Map(); // token -> Set(relative file path)
  const files = USE_DIRS.flatMap((d) => collectSourceFiles(join(REPO_ROOT, d)));
  for (const file of files) {
    const isCss = file.endsWith(".css");
    let src = stripBlockComments(readFileSync(file, "utf8"));
    if (!isCss) src = stripLineComments(src);
    const rel = file.slice(REPO_ROOT.length + 1);
    let m;
    while ((m = VAR_USE.exec(src)) !== null) {
      const token = m[1];
      if (!out.has(token)) out.set(token, new Set());
      out.get(token).add(rel);
    }
  }
  return out;
}

const uses = collectUses();

test("the light and dark @theme palettes parse to non-empty token sets (vacuous-parse guard)", () => {
  // If the brace walk found nothing — or missed a block — the ⊆/equality checks
  // below would pass for the wrong reason.
  assert.ok(lightTheme, `no light @theme block found in ${GLOBALS_FILE}`);
  assert.ok(
    darkTheme,
    `no dark @theme block (inside @media prefers-color-scheme: dark) found in ${GLOBALS_FILE}`,
  );
  assert.ok(lightTokens.size > 0, "light @theme defined no --color-* tokens");
  assert.ok(darkTokens.size > 0, "dark @theme defined no --color-* tokens");
  assert.ok(
    lightTokens.has("--color-background") &&
      lightTokens.has("--color-foreground"),
    `light @theme missing anchor tokens; parsed: ${[...lightTokens].sort().join(", ")}`,
  );
  assert.ok(uses.size > 0, "found no literal var(--color-*) uses to check");
});

test("every literal var(--color-X) resolves to a token defined in the light @theme", () => {
  const dangling = [...uses.keys()]
    .filter((t) => !lightTokens.has(t))
    .sort();
  assert.deepEqual(
    dangling,
    [],
    `var(--color-*) reference(s) with no @theme definition (silently fall back at runtime):\n` +
      dangling
        .map((t) => `  ${t}  (in ${[...uses.get(t)].sort().join(", ")})`)
        .join("\n"),
  );
});

test("the light and dark @theme blocks define exactly the same token set", () => {
  // Token-set skew = a token that doesn't adapt to the other scheme, silently
  // inheriting the wrong value (e.g. a light-only token shows its light colour
  // in dark mode).
  assert.deepEqual(
    [...lightTokens].sort(),
    [...darkTokens].sort(),
    "light and dark @theme palettes define different --color-* token sets",
  );
});

test("the known core palette tokens are all still defined (drop-detector anchor)", () => {
  // Pins today's palette so the suite also fails if a future edit REMOVES one
  // of these definitions, not only when a new dangling var() is added.
  const missing = KNOWN_CORE_TOKENS.filter((t) => !lightTokens.has(t)).sort();
  assert.deepEqual(
    missing,
    [],
    `light @theme no longer defines expected core token(s): ${missing.join(", ")}`,
  );
});

test("the var() usage scan is substantive and cross-file (anchors the use ⊆ def check)", () => {
  // Guards the directional check above from passing vacuously: a near-empty or
  // single-file scan would make `use ⊆ def` trivially true.
  assert.ok(
    uses.size >= 4,
    `expected ≥4 distinct --color-* tokens referenced via var(); found ${uses.size}: ${[...uses.keys()].sort().join(", ")}`,
  );
  assert.ok(
    uses.has("--color-muted-foreground"),
    "expected the heavily-used --color-muted-foreground among the var() call sites",
  );
  const files = new Set([...uses.values()].flatMap((s) => [...s]));
  assert.ok(
    files.size >= 2,
    `expected var(--color-*) uses across ≥2 files; found only: ${[...files].join(", ")}`,
  );
});
