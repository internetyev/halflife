// Open Graph share-card frame consistency guard: the two card generators must
// agree on the brand frame (dimensions, content type, runtime, palette), and the
// Twitter card must re-export the default OG card rather than diverge.
//
// halflife renders share cards from TWO places that deliberately mirror one
// frame so every preview — homepage, report, role page — reads as one brand:
//
//   1. `app/opengraph-image.tsx`     — the site-level default card Next injects
//                                       into routes that declare no image of
//                                       their own (home, report).
//   2. `app/api/og/[slug]/route.tsx` — the dynamic per-role card (numbers card
//                                       from KV, or a generic fallback).
//
// `app/opengraph-image.tsx`'s own header says the frame "deliberately mirrors the
// generic card in `app/api/og/[slug]/route.tsx` (dark palette + eyebrow + headline
// + tagline) so every halflife share … reads as one brand. Palette is duplicated
// as inline hex because Satori only reads inline styles and the codebase prefers
// small duplication over a shared OG helper (D-027)." Both files therefore hand-copy
// the same four frame constants:
//
//   - `export const size = { width: 1200, height: 630 }`  (the card dimensions
//      crawlers expect for `summary_large_image`)
//   - `export const contentType = "image/png"`
//   - `export const runtime = "edge"`
//   - the brand palette `BG = "#0a0a0a"`, `FG = "#fafafa"`, `MUTED = "#a3a3a3"`
//     (the dynamic route layers `BORDER` + per-band colours on top; those are
//      route-specific and not part of the shared frame)
//
// The drift this pins is a silent off-brand / broken-preview failure, invisible to
// every build step:
//   (a) one card's dimensions change but not the other's — set the default card to
//       1200×600 while the role card stays 1200×630. `next build`/`tsc --noEmit`
//       stay green (each `size` literal is valid alone), but now two halflife shares
//       render at different aspect ratios: one fills the LinkedIn/Twitter
//       large-image frame, the other is letterboxed or cropped.
//   (b) the palette drifts — a brand-colour tweak lands in the role card but not the
//       default card (or vice-versa), so the homepage share is `#0a0a0a` on one
//       grey and the role share is a different grey: the "one brand" the comment
//       promises silently splits.
//   (c) `contentType`/`runtime` drift — one card declares `image/jpeg` or drops
//       `edge`; the `<meta>` content-type no longer matches the bytes, or the two
//       cards diverge in where they execute.
//   (d) `app/twitter-image.tsx` stops re-exporting the OG card and grows its own
//       copy — the "one source of truth: edit `opengraph-image.tsx` and both cards
//       update" guarantee in its header quietly breaks, re-creating (a)/(b) on the
//       Twitter surface.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.65 — both card files
// import `next/og` (`ImageResponse`) and the route also pulls `@/`-aliased modules
// (`@/lib/cache/role-cache`, `@/lib/scoring/types`) the `.mjs` loader can't resolve
// and that aren't installed for the test runner. So this reads the sources as TEXT
// and compares the extracted frame literals, exactly the technique L5.57–L5.65 use
// on their surfaces. New consistency surface — the share-card brand frame across the
// OG-image family — not a continuation of the L5.57–L5.63 config/cache drift arc,
// the L5.64 internal-link arc, or the L5.65 canonical-origin arc.
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

// The two card generators that hand-copy the shared brand frame.
const CARD_FILES = ["app/opengraph-image.tsx", "app/api/og/[slug]/route.tsx"];

// The Twitter card must re-export these names from the default OG card so it can
// never grow an independent copy of the frame.
const TWITTER_FILE = "app/twitter-image.tsx";
const TWITTER_OG_IMPORT = "./opengraph-image";
const REQUIRED_REEXPORTS = ["default", "alt", "size", "contentType", "runtime"];

// The three palette constants both cards share (the route adds route-specific
// `BORDER`/band colours that are NOT part of the shared frame and are ignored).
const SHARED_PALETTE = ["BG", "FG", "MUTED"];

// Extract the brand frame from a card source as TEXT: { width, height },
// contentType, runtime, and the shared palette { BG, FG, MUTED }.
function extractFrame(relPath) {
  const src = read(relPath);

  const sizeM =
    /export\s+const\s+size\s*=\s*\{\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)\s*\}/.exec(
      src,
    );
  assert.ok(
    sizeM,
    `could not find \`export const size = { width: N, height: N }\` in ${relPath} — ` +
      "the card dimensions were renamed or reshaped; update this guard with them.",
  );

  const ctM = /export\s+const\s+contentType\s*=\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    ctM,
    `could not find \`export const contentType = "..."\` in ${relPath} — renamed or reshaped?`,
  );

  const rtM = /export\s+const\s+runtime\s*=\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    rtM,
    `could not find \`export const runtime = "..."\` in ${relPath} — renamed or reshaped?`,
  );

  // Collect the shared palette constants by name. Both cards declare them as
  // top-level `const NAME = "#hex"`; named so the route's extra `BORDER`/band
  // colours never match.
  const palette = {};
  for (const name of SHARED_PALETTE) {
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

  return {
    file: relPath,
    size: { width: Number(sizeM[1]), height: Number(sizeM[2]) },
    contentType: ctM[1],
    runtime: rtM[1],
    palette,
  };
}

const frames = CARD_FILES.map(extractFrame);

test("both card generators were actually parsed into a complete frame (vacuous guard)", () => {
  // If the extraction silently failed on either file, every equality check below
  // would trivially pass (one side missing) or throw. Anchor that both frames are
  // fully populated so a reshaped card / regex drift fails loudly here first.
  assert.equal(
    frames.length,
    CARD_FILES.length,
    `expected ${CARD_FILES.length} card files, parsed ${frames.length}`,
  );
  for (const f of frames) {
    assert.ok(
      f.size.width > 0 && f.size.height > 0,
      `${f.file}: dimensions did not parse to positive integers (${JSON.stringify(f.size)})`,
    );
    assert.ok(f.contentType.length > 0, `${f.file}: empty contentType`);
    assert.ok(f.runtime.length > 0, `${f.file}: empty runtime`);
    for (const name of SHARED_PALETTE) {
      assert.ok(
        f.palette[name] && f.palette[name].length > 0,
        `${f.file}: empty palette ${name}`,
      );
    }
  }
});

test("both cards declare the SAME dimensions (1200×630 for summary_large_image)", () => {
  // The load-bearing dimension check: a card whose aspect ratio drifts from the
  // other renders letterboxed/cropped in the large-image preview frame — green
  // build, off-brand share.
  const [a, b] = frames;
  assert.deepEqual(
    a.size,
    b.size,
    `${a.file} (${JSON.stringify(a.size)}) and ${b.file} (${JSON.stringify(b.size)}) ` +
      "declare different card dimensions — both share cards must be the same size or " +
      "previews render at different aspect ratios.",
  );
  // Anchor the agreed dimensions to the documented 1200×630 so a coordinated edit
  // that moved BOTH cards off-spec still fails (crawlers expect this size).
  assert.deepEqual(
    a.size,
    { width: 1200, height: 630 },
    `share cards are ${JSON.stringify(a.size)}, not the expected 1200×630 — ` +
      "if the intended card size genuinely changed, update this anchor.",
  );
});

test("both cards declare the SAME contentType (image/png)", () => {
  const [a, b] = frames;
  assert.equal(
    a.contentType,
    b.contentType,
    `${a.file} (${a.contentType}) and ${b.file} (${b.contentType}) declare different ` +
      "contentType — the <meta> content-type must match the bytes both cards emit.",
  );
  assert.equal(
    a.contentType,
    "image/png",
    `share cards declare contentType ${a.contentType}, not image/png — ` +
      "both cards render PNG via next/og; update this anchor if that changed.",
  );
});

test("both cards run on the SAME runtime (edge)", () => {
  const [a, b] = frames;
  assert.equal(
    a.runtime,
    b.runtime,
    `${a.file} (${a.runtime}) and ${b.file} (${b.runtime}) declare different runtimes — ` +
      "both OG renderers are built for the edge runtime (next/og + fetch-based KV).",
  );
  assert.equal(
    a.runtime,
    "edge",
    `share cards declare runtime ${a.runtime}, not edge — update this anchor if that changed.`,
  );
});

test("both cards define the SAME shared brand palette (BG/FG/MUTED)", () => {
  // The "one brand" guarantee: a colour tweak in one card but not the other splits
  // the palette across surfaces. Duplicated by intent (D-027 — Satori reads only
  // inline styles), so nothing but this guard keeps the copies identical.
  const [a, b] = frames;
  assert.deepEqual(
    a.palette,
    b.palette,
    `${a.file} (${JSON.stringify(a.palette)}) and ${b.file} (${JSON.stringify(b.palette)}) ` +
      "define different brand palettes — the shared BG/FG/MUTED must be byte-identical " +
      "across both cards or homepage and role shares render off-brand.",
  );
});

test("the Twitter card re-exports the default OG card (one source of truth)", () => {
  // `app/twitter-image.tsx` promises "one source of truth: edit
  // `app/opengraph-image.tsx` and both cards update". If it stopped re-exporting and
  // grew its own copy, the Twitter card could silently drift from the frame the two
  // checks above pin. Assert the re-export still names every frame symbol.
  const src = read(TWITTER_FILE);
  const m = new RegExp(
    `export\\s*\\{([^}]*)\\}\\s*from\\s*["']${TWITTER_OG_IMPORT.replace(/[.\\/]/g, "\\$&")}["']`,
  ).exec(src);
  assert.ok(
    m,
    `could not find \`export { ... } from "${TWITTER_OG_IMPORT}"\` in ${TWITTER_FILE} — ` +
      "the Twitter card no longer re-exports the OG card; it must, or the two share " +
      "cards can drift (it would need its own frame copy).",
  );
  const names = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const missing = REQUIRED_REEXPORTS.filter((r) => !names.includes(r));
  assert.deepEqual(
    missing,
    [],
    `${TWITTER_FILE} re-exports {${names.join(", ")}} from ${TWITTER_OG_IMPORT} but is ` +
      `missing ${missing.join(", ")} — every frame symbol must be re-exported so the ` +
      "Twitter card stays byte-identical to the OG card.",
  );
});
