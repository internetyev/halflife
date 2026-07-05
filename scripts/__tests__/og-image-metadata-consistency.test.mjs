// OG-image metadata consistency guard: the per-role share-card that the role page
// ADVERTISES in its metadata must name the same image URL and the same pixel
// dimensions that the OG route actually RENDERS — and the advertised URL must
// resolve to a route that really exists on disk. Nothing pinned these together
// until now.
//
// The two surfaces this hop relates:
//
//   1. `app/role/[slug]/page.tsx` — `generateMetadata()` DECLARES the per-role
//      card to crawlers. Its `openGraph.images` entry is
//      `{ url: `/api/og/${slug}`, width: 1200, height: 630 }` and its
//      `twitter.images` entry is `[`/api/og/${slug}`]`. These are the numbers and
//      the URL Facebook/Twitter/LinkedIn read from the `<head>` to decide how to
//      frame (and whether to accept) the preview — the `width`/`height` are a
//      PROMISE about the bytes the crawler will fetch.
//   2. `app/api/og/[slug]/route.tsx` — the edge route that actually GENERATES the
//      PNG. Its `export const size = { width: 1200, height: 630 }` is the real
//      pixel frame `next/og` stamps into the image. Its location on disk
//      (`app/api/og/[slug]/route.tsx`) is what makes `/api/og/<slug>` a live URL
//      rather than a 404.
//
// The drift this pins is invisible to every build step — neither `next build` nor
// `tsc --noEmit` relates a `width`/`height` NUMBER in a metadata object to the
// `size` LITERAL in a different module, and neither resolves a template-string URL
// (`/api/og/${slug}`) against the route tree; each file is independently valid:
//   (a) the card is resized — a redesign bumps `export const size` in the route to
//       `{ width: 1600, height: 900 }` (the L5.79 og-card-frame guard then forces
//       `app/opengraph-image.tsx` to follow, so the two GENERATORS stay in step) —
//       but the role page's metadata still advertises `width: 1200, height: 630`.
//       The crawler is told 1200×630, fetches a 1600×900 PNG; the mismatch makes
//       Twitter fall back to `summary` (small square) or Facebook crop/reject the
//       card. `tsc` is green: the metadata object accepts arbitrary numbers and the
//       `size` export is an unrelated literal.
//   (b) the OG route is moved or renamed — `app/api/og/[slug]` → `app/api/card/[slug]`
//       (or the segment folder is refactored) — but the metadata URL still points
//       at `/api/og/${slug}`. The advertised `og:image` now 404s and every role
//       share renders a blank preview. `tsc` never resolves the template string
//       against the filesystem, so it stays green.
//   (c) the two role-page image declarations drift from each other — the OpenGraph
//       `images[0].url` is updated but the parallel `twitter.images` path is left
//       stale (or vice-versa) — so one network's crawler gets the new card and the
//       other gets a dead link.
//
// Why a NEW surface, not the existing OG guards: the L5.79 og-card-frame guard
// pins the `size`/`contentType`/`runtime`/palette of the two GENERATORS
// (`app/opengraph-image.tsx` ↔ `app/api/og/[slug]/route.tsx`) to each other — it
// never reads `app/role/[slug]/page.tsx` at all, so the metadata's ADVERTISED
// dimensions and the advertised URL are wholly outside its scope. The L5.80
// og-card-copy guard reads the role page's metadata STRINGS (title/description
// brand copy) but never its image `width`/`height` or the `/api/og/` URL path.
// So the "what the role page promises about the card" ↔ "what the route delivers"
// contract was unguarded; this guard owns exactly that one hop.
//
// Fully extractive where it can be: the canonical frame is READ from the route's
// `size` export (not hard-coded per-side) and every advertised dimension must equal
// it. The URL PREFIX (`/api/og/`) is anchored as a literal drop-detector — a
// coordinated move of both the route folder and every metadata URL would keep the
// existence check green, so pinning the current prefix here forces such a move to
// be a deliberate, test-visible edit — and it is checked to resolve to a real
// `route.{tsx,ts}` on disk so a rename that misses the metadata is caught.
//
// Why a text guard: the same D-080 wall as the L5.57–L5.89 arc — `page.tsx`
// imports `next` types and `@/`-aliased modules the bare `.mjs` loader can't
// resolve and that aren't installed for the runner, and `route.tsx` imports
// `next/og`; so it reads each source as TEXT and regex-extracts the fields.
// Comments are stripped first so a `width`/`height`/`/api/og/` mentioned in prose
// (both files, and this header, document the invariant) is never scanned as a real
// declaration. Pure Node built-ins, no npm install — identical on the routine
// laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical OG-route URL prefix the role page advertises. Named here as the
// drop-detector anchor: a coordinated rename of both the route folder and every
// metadata URL would keep the on-disk existence check green, so this literal forces
// such a move to be a deliberate, reviewed edit here too (the CANONICAL_LANG /
// CANONICAL_SLUG play in the L5.89 / L5.86 guards).
const CANONICAL_OG_PREFIX = "/api/og/";

// The route folder the advertised URL must resolve to. `[slug]` is the dynamic
// segment `/api/og/${slug}` maps onto; the route file may be `.tsx` or `.ts`.
const OG_ROUTE_DIR = join("app", "api", "og", "[slug]");

const ROLE_PAGE = "app/role/[slug]/page.tsx";
const OG_ROUTE = "app/api/og/[slug]/route.tsx";

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Strip `//` line comments and `/* … */` block comments so a `width:`/`height:` or
// `/api/og/` written in a header comment (both files, and this test, document the
// invariant in prose) is never scanned as a real declaration. Deliberately simple —
// the source has no string literals containing `//` or `/*` that would be
// corrupted, and the extraction regexes anchor on object/JSX syntax that only
// appears in real code.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// The `{ width, height }` from the route's `export const size = { … }` — the real
// pixel frame the PNG is rendered at. Same shape the L5.79 frame guard extracts,
// re-parsed here independently so this guard stands alone.
function routeSize(src) {
  const m =
    /export\s+const\s+size\s*=\s*\{\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)\s*\}/.exec(
      stripComments(src),
    );
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

// Every OpenGraph image entry declared as an object literal
// `{ url: `/api/og/${slug}`, width: N, height: N }` in the role page's metadata.
// Returned as an array so the anti-vacuous floor asserts ≥1 and a future second
// object entry is checked too. `url` is captured whether written with a template
// backtick or a quote; width/height are required (the object form always carries
// them here — a bare-string entry is handled separately below).
function ogImageObjects(src) {
  const re =
    /\{\s*url:\s*[`"']([^`"']+)[`"']\s*,\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)\s*\}/g;
  const out = [];
  let m;
  while ((m = re.exec(stripComments(src))) !== null) {
    out.push({ url: m[1], width: Number(m[2]), height: Number(m[3]) });
  }
  return out;
}

// The `twitter.images` URL(s), declared as bare strings `[`/api/og/${slug}`]`.
// Scoped to the `twitter:` block so the OpenGraph object entries (captured above)
// are not double-counted. Returns the URL strings found inside the twitter images
// array.
function twitterImageUrls(src) {
  const clean = stripComments(src);
  const block = /twitter\s*:\s*\{([\s\S]*?)\n\s{2,}\}/.exec(clean);
  const scope = block ? block[1] : clean;
  const imagesArr = /images\s*:\s*\[([\s\S]*?)\]/.exec(scope);
  if (!imagesArr) return [];
  const re = /[`"']([^`"']*\/api\/og\/[^`"']*)[`"']/g;
  const out = [];
  let m;
  while ((m = re.exec(imagesArr[1])) !== null) out.push(m[1]);
  return out;
}

const rolePageSrc = read(ROLE_PAGE);
const ogRouteSrc = read(OG_ROUTE);

const size = routeSize(ogRouteSrc);
const ogImages = ogImageObjects(rolePageSrc);
const twitterUrls = twitterImageUrls(rolePageSrc);

// Every advertised image URL, from both networks, for the URL-shape assertions.
const allAdvertisedUrls = [...ogImages.map((o) => o.url), ...twitterUrls];

test("app/api/og/[slug]/route.tsx exports a size frame (vacuous-scan guard)", () => {
  // If the extraction silently returned null, every dimension check below would
  // pass for the wrong reason. Assert the real pixel frame is present.
  assert.ok(
    size,
    `could not find \`export const size = { width: N, height: N }\` in ${OG_ROUTE}`,
  );
});

test("app/role/[slug]/page.tsx advertises at least one OG image object (vacuous-scan guard)", () => {
  // Anti-vacuous floor for the metadata side: a regex that matched nothing would
  // make the dimension/URL agreement checks meaningless.
  assert.ok(
    ogImages.length >= 1,
    `expected ≥1 \`{ url, width, height }\` OpenGraph image entry in ${ROLE_PAGE}, ` +
      `found ${ogImages.length}`,
  );
});

test("app/role/[slug]/page.tsx advertises at least one twitter image URL (vacuous-scan guard)", () => {
  assert.ok(
    twitterUrls.length >= 1,
    `expected ≥1 \`/api/og/…\` twitter image URL in ${ROLE_PAGE}, found ${twitterUrls.length}`,
  );
});

test("the advertised OG-route URL prefix matches the canonical anchor (drop-detector)", () => {
  // Pins the current source of truth literally so a coordinated rename of both the
  // route folder and every metadata URL — which the on-disk existence check alone
  // would let through — is still a deliberate, test-visible edit here.
  for (const url of allAdvertisedUrls) {
    assert.ok(
      url.startsWith(CANONICAL_OG_PREFIX),
      `advertised image URL "${url}" in ${ROLE_PAGE} must start with the canonical ` +
        `"${CANONICAL_OG_PREFIX}"`,
    );
  }
});

test("the advertised OG-route URL resolves to a real route file on disk (the 404 guard)", () => {
  // The URL a crawler fetches must map to a route that exists. `/api/og/${slug}`
  // resolves to the `app/api/og/[slug]` dynamic segment; assert its route module is
  // present so a move/rename that misses the metadata URL is caught.
  const routeTsx = join(REPO_ROOT, OG_ROUTE_DIR, "route.tsx");
  const routeTs = join(REPO_ROOT, OG_ROUTE_DIR, "route.ts");
  assert.ok(
    existsSync(routeTsx) || existsSync(routeTs),
    `advertised prefix "${CANONICAL_OG_PREFIX}" points at ${OG_ROUTE_DIR}, but no ` +
      `route.tsx/route.ts exists there — the og:image URL would 404`,
  );
});

test("every advertised OG-image dimension matches the route's rendered size (the load-bearing invariant)", () => {
  // The real check: the `width`/`height` the role page PROMISES a crawler must
  // equal the `size` the route actually STAMPS into the PNG. A resize on one side
  // only (case (a)) fails here.
  for (const img of ogImages) {
    assert.equal(
      img.width,
      size.width,
      `${ROLE_PAGE} advertises og:image width ${img.width} for "${img.url}", but ` +
        `${OG_ROUTE} renders width ${size.width}`,
    );
    assert.equal(
      img.height,
      size.height,
      `${ROLE_PAGE} advertises og:image height ${img.height} for "${img.url}", but ` +
        `${OG_ROUTE} renders height ${size.height}`,
    );
  }
});

test("the OpenGraph and twitter image URLs agree (no cross-network drift)", () => {
  // Case (c): the two role-page image declarations must name the same card path
  // shape so both networks fetch the same live route. Compare the path templates
  // (the `${slug}` placeholder is identical in both), stripped of the interpolation
  // so a literal `/api/og/${slug}` on each side compares equal.
  const norm = (u) => u.replace(/\$\{[^}]+\}/g, "*");
  const ogPaths = new Set(ogImages.map((o) => norm(o.url)));
  for (const t of twitterUrls) {
    assert.ok(
      ogPaths.has(norm(t)),
      `twitter image URL "${t}" in ${ROLE_PAGE} has no matching OpenGraph image URL ` +
        `(${[...ogPaths].join(", ")}) — the two networks would fetch different cards`,
    );
  }
});
