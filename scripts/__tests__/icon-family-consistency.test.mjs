// Favicon / app-icon family consistency guard: the two generated icon surfaces
// must agree on the brand mark (palette, glyph, content type, runtime, square
// aspect), and that mark must match the palette the OG share cards already use,
// so every icon surface reads as one brand at every scale.
//
// halflife renders its icons from TWO `next/og` file-convention generators that
// deliberately mirror one brand mark but at different sizes:
//
//   1. `app/icon.tsx`       — the 32×32 browser-tab / bookmark / history favicon
//                             (Next serves it at `/icon`, injects `<link rel="icon">`).
//   2. `app/apple-icon.tsx` — the 180×180 iOS "Add to Home Screen" / iPadOS /
//                             macOS-Safari pinned-tab icon (Next serves it at
//                             `/apple-icon`, injects `<link rel="apple-touch-icon">`).
//
// `app/apple-icon.tsx`'s own header says it "renders the same filled `#0a0a0a`
// square + bold lowercase `#fafafa` `h` as the 32×32 favicon so the two surfaces
// read as one brand at every scale", and both headers say the mark is generated
// "from the same inline-hex palette the OG cards already use" (D-041/D-061). So
// each file hand-copies the same four brand constants — `runtime = "edge"`,
// `contentType = "image/png"`, `BG = "#0a0a0a"`, `FG = "#fafafa"` — and the same
// rendered glyph (`h`, the "halflife" wordmark initial). The two `size` constants
// are deliberately DIFFERENT (32 vs 180, an order of magnitude apart — see the
// apple-icon header on why it is a separate file, not a shared export), but both
// are SQUARE.
//
// The drift this pins is a silent off-brand icon, invisible to every build step:
//   (a) the palette drifts — a brand-colour tweak lands in the favicon but not the
//       apple-icon (or vice-versa), so the browser-tab icon is `#0a0a0a` on one ink
//       and the home-screen icon is a different grey: the "one brand at every scale"
//       the header promises silently splits. `next build`/`tsc --noEmit` stay green
//       (each `const BG = "#..."` literal is valid alone).
//   (b) the glyph drifts — one surface renders `h`, the other renders a different
//       letter (or the wordmark initial changes at the L1.7b/L5.1 naming pick and
//       gets updated in one file only), so the favicon and home-screen icon show
//       different marks.
//   (c) `contentType`/`runtime` drift — one icon declares `image/jpeg` or drops
//       `edge`; the `<link>` type no longer matches the bytes, or the two icons
//       diverge in where they execute.
//   (d) an icon stops being square — a `size` edit yields `{ width: 32, height: 16 }`,
//       so the OS scales a non-square source into the square icon slot and the mark
//       renders stretched.
//   (e) the icon palette drifts from the OG card palette — the cards move to a new
//       brand grey (caught among themselves by L5.66) but the icons keep the old one,
//       so a share card and the favicon beside it in the same tab read as two brands.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.66 — every icon/card
// file imports `next/og` (`ImageResponse`), which is not installed for the `.mjs`
// test runner. So this reads the sources as TEXT and compares the extracted mark
// literals, exactly the technique L5.57–L5.66 use on their surfaces. New consistency
// surface — the icon-family brand mark across `app/icon.tsx` + `app/apple-icon.tsx`,
// anchored to the L5.66 OG-card palette — not a continuation of the L5.66 card-frame
// arc itself (that guard never touches the icon files; the icons share the palette
// but carry their own square-aspect + glyph contract the cards do not).
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

// The two icon generators that hand-copy the shared brand mark. Each carries its
// own deliberately-different square `size`; everything else must agree.
const ICON_FILES = ["app/icon.tsx", "app/apple-icon.tsx"];

// The default OG card — its BG/FG are the palette the icons must match (the icons'
// headers say they use "the same inline-hex palette the OG cards already use").
const OG_CARD_FILE = "app/opengraph-image.tsx";

// The two palette constants both icons share (the icons use no MUTED — that is a
// card-only band colour, so it is not part of the icon contract).
const SHARED_PALETTE = ["BG", "FG"];

// The documented per-file square dimensions: 32×32 favicon, 180×180 apple-touch.
const EXPECTED_SIZES = {
  "app/icon.tsx": 32,
  "app/apple-icon.tsx": 180,
};

function extractSize(src, relPath) {
  const m =
    /export\s+const\s+size\s*=\s*\{\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)\s*\}/.exec(
      src,
    );
  assert.ok(
    m,
    `could not find \`export const size = { width: N, height: N }\` in ${relPath} — ` +
      "the icon dimensions were renamed or reshaped; update this guard with them.",
  );
  return { width: Number(m[1]), height: Number(m[2]) };
}

function extractContentType(src, relPath) {
  const m = /export\s+const\s+contentType\s*=\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    m,
    `could not find \`export const contentType = "..."\` in ${relPath} — renamed or reshaped?`,
  );
  return m[1];
}

function extractRuntime(src, relPath) {
  const m = /export\s+const\s+runtime\s*=\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    m,
    `could not find \`export const runtime = "..."\` in ${relPath} — renamed or reshaped?`,
  );
  return m[1];
}

// Collect the shared palette constants by name. Both icons declare them as
// top-level `const NAME = "#hex"`.
function extractPalette(src, relPath, names) {
  const palette = {};
  for (const name of names) {
    const pm = new RegExp(
      `\\bconst\\s+${name}\\s*=\\s*["'](#[0-9a-fA-F]{3,8})["']`,
    ).exec(src);
    assert.ok(
      pm,
      `could not find \`const ${name} = "#..."\` in ${relPath} — ` +
        "the shared brand palette was renamed; update this guard with it.",
    );
    palette[name] = pm[1].toLowerCase();
  }
  return palette;
}

// The rendered glyph: the single text node inside the icon's one `<div>…</div>`.
// Both files render exactly one letter (the wordmark initial) as the div's child.
function extractGlyph(src, relPath) {
  const m = />\s*([^\s<>]+)\s*<\/div>/.exec(src);
  assert.ok(
    m,
    `could not find the rendered glyph (\`> X </div>\`) in ${relPath} — ` +
      "the icon JSX was reshaped; update this guard with the new mark.",
  );
  return m[1];
}

function extractIcon(relPath) {
  const src = read(relPath);
  return {
    file: relPath,
    size: extractSize(src, relPath),
    contentType: extractContentType(src, relPath),
    runtime: extractRuntime(src, relPath),
    palette: extractPalette(src, relPath, SHARED_PALETTE),
    glyph: extractGlyph(src, relPath),
  };
}

const icons = ICON_FILES.map(extractIcon);

test("both icon generators were actually parsed into a complete mark (vacuous guard)", () => {
  // If extraction silently failed on either file, the equality checks below would
  // trivially pass (one side missing) or throw. Anchor that both marks are fully
  // populated so a reshaped icon / regex drift fails loudly here first.
  assert.equal(
    icons.length,
    ICON_FILES.length,
    `expected ${ICON_FILES.length} icon files, parsed ${icons.length}`,
  );
  for (const i of icons) {
    assert.ok(
      i.size.width > 0 && i.size.height > 0,
      `${i.file}: dimensions did not parse to positive integers (${JSON.stringify(i.size)})`,
    );
    assert.ok(i.contentType.length > 0, `${i.file}: empty contentType`);
    assert.ok(i.runtime.length > 0, `${i.file}: empty runtime`);
    assert.ok(i.glyph.length > 0, `${i.file}: empty glyph`);
    for (const name of SHARED_PALETTE) {
      assert.ok(
        i.palette[name] && i.palette[name].length > 0,
        `${i.file}: empty palette ${name}`,
      );
    }
  }
});

test("each icon is SQUARE, at its documented size (32 favicon, 180 apple-touch)", () => {
  // The icons' `size` constants are deliberately DIFFERENT (an order of magnitude
  // apart) — so unlike the OG cards they are NOT checked for equal dimensions. What
  // they must share is squareness (the OS scales a non-square source stretched into
  // the square icon slot) plus their documented per-file size.
  for (const i of icons) {
    assert.equal(
      i.size.width,
      i.size.height,
      `${i.file} is ${JSON.stringify(i.size)} — icon must be square or it renders ` +
        "stretched in the OS icon slot.",
    );
    const expected = EXPECTED_SIZES[i.file];
    assert.equal(
      i.size.width,
      expected,
      `${i.file} is ${i.size.width}×${i.size.height}, not the expected ${expected}×${expected} — ` +
        "if the intended icon size genuinely changed, update this anchor.",
    );
  }
});

test("both icons declare the SAME contentType (image/png)", () => {
  const [a, b] = icons;
  assert.equal(
    a.contentType,
    b.contentType,
    `${a.file} (${a.contentType}) and ${b.file} (${b.contentType}) declare different ` +
      "contentType — the <link> type must match the bytes both icons emit.",
  );
  assert.equal(
    a.contentType,
    "image/png",
    `icons declare contentType ${a.contentType}, not image/png — ` +
      "both icons render PNG via next/og; update this anchor if that changed.",
  );
});

test("both icons run on the SAME runtime (edge)", () => {
  const [a, b] = icons;
  assert.equal(
    a.runtime,
    b.runtime,
    `${a.file} (${a.runtime}) and ${b.file} (${b.runtime}) declare different runtimes — ` +
      "both icon renderers are built for the edge runtime (next/og).",
  );
  assert.equal(
    a.runtime,
    "edge",
    `icons declare runtime ${a.runtime}, not edge — update this anchor if that changed.`,
  );
});

test("both icons render the SAME glyph (the wordmark initial)", () => {
  // A favicon showing `h` next to a home-screen icon showing a different letter is
  // the off-brand split this pins. Duplicated by intent (two separate files), so
  // nothing but this guard keeps the marks identical.
  const [a, b] = icons;
  assert.equal(
    a.glyph,
    b.glyph,
    `${a.file} renders "${a.glyph}" but ${b.file} renders "${b.glyph}" — both icon ` +
      "surfaces must render the same brand mark.",
  );
  assert.equal(
    a.glyph,
    "h",
    `icons render "${a.glyph}", not the "h" wordmark initial — ` +
      "if the wordmark genuinely changed, update this anchor (and the OG cards' wordmark).",
  );
});

test("both icons define the SAME brand palette (BG/FG), matching the OG card", () => {
  // The "one brand at every scale" guarantee: a colour tweak in one icon but not the
  // other splits the mark across surfaces; a tweak in the cards but not the icons
  // splits the brand between a share preview and the favicon beside it. So pin the
  // two icons to each other AND to the default OG card's BG/FG (L5.66 keeps the two
  // cards' palette in sync among themselves; this extends the chain to the icons).
  const [a, b] = icons;
  assert.deepEqual(
    a.palette,
    b.palette,
    `${a.file} (${JSON.stringify(a.palette)}) and ${b.file} (${JSON.stringify(b.palette)}) ` +
      "define different brand palettes — the shared BG/FG must be byte-identical across " +
      "both icons or the favicon and home-screen icon render off-brand.",
  );

  const cardPalette = extractPalette(
    read(OG_CARD_FILE),
    OG_CARD_FILE,
    SHARED_PALETTE,
  );
  assert.deepEqual(
    a.palette,
    cardPalette,
    `the icons' palette (${JSON.stringify(a.palette)}) differs from the OG card's BG/FG ` +
      `(${JSON.stringify(cardPalette)}) in ${OG_CARD_FILE} — the icon mark and the share ` +
      "cards must share one brand palette so an icon and a card in the same view agree.",
  );

  // Anchor the agreed palette to the documented brand greys so a coordinated edit that
  // moved BOTH icons (and the card) off-spec still fails.
  assert.deepEqual(
    a.palette,
    { BG: "#0a0a0a", FG: "#fafafa" },
    `icon palette is ${JSON.stringify(a.palette)}, not the documented ` +
      '{ BG: "#0a0a0a", FG: "#fafafa" } — if the brand greys genuinely changed, update this anchor.',
  );
});
