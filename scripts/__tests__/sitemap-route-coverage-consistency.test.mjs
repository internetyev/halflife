// Sitemap route-coverage guard: every STATIC, indexable HTML page route under
// `app/` must be advertised in `app/sitemap.ts`. This is the load-bearing
// REVERSE of L5.64's internal-link guard.
//
// L5.64 pins links ⊆ routes — every static `href`/sitemap URL must resolve to a
// real route, so the sitemap never advertises a 404. It is DIRECTIONAL by design
// and deliberately silent about the inverse footgun: a real, indexable page that
// is NOT in the sitemap. A route with no inbound link (or sitemap entry) passes
// L5.64 cleanly. So the SEO-discovery half of the contract — "a page search
// engines should index is actually announced to them" — has been unguarded.
//
// The drift this pins is a silent indexing gap, invisible to every build step:
// someone adds `app/about/page.tsx` (a real, always-200, index:true page — the
// layout default robots is `{ index: true, follow: true }`), wires it into the
// footer nav, and ships. `next build`/`tsc --noEmit` are green; L5.64 is green
// (the nav link resolves); robots.ts allows it. But `app/sitemap.ts` is a
// hand-maintained list of `${SITE_URL}/<path>` literals that nobody updated, so
// the new page is never submitted to search engines and silently fails to get
// discovered/indexed for as long as nobody notices. The same gap opens if a
// future page route is added but its sitemap entry is dropped in a refactor.
//
// DIRECTION — static-indexable-page-routes ⊆ sitemap. Every static `page.tsx`
// route that is indexable must appear in the sitemap; NOT the reverse (the
// reverse, sitemap ⊆ routes, is exactly what L5.64 already enforces). Two
// deliberate carve-outs keep this aligned with the sitemap's own D-021 policy
// ("never advertise a URL that might 404"):
//
//   1. DYNAMIC routes are excluded. `app/role/[slug]/page.tsx` (`/role/:slug`)
//      `notFound()`s for any slug without committed `data/roles/<slug>.json`
//      (D-021), so the sitemap lists role URLs per-seeded-JSON at runtime, not as
//      a static literal. Requiring `/role/[slug]` as a static entry would be
//      wrong — there is no single static URL for it.
//   2. NOINDEX routes are excluded. A page that overrides the layout default with
//      `robots: { index: false }` (or a `"noindex"` string) is intentionally kept
//      out of the index, so it MUST NOT be in the sitemap. No page declares this
//      today; the carve-out future-proofs the guard so adding a noindex page
//      doesn't force a false sitemap entry.
//
// SCOPE — only `page` file-convention routes (the navigable HTML pages). API
// `route.ts` endpoints and metadata conventions (`sitemap`, `robots`, the icon /
// `opengraph-image` generators) are NOT indexable pages and are correctly absent
// from the sitemap, so they are out of scope here.
//
// Why a text guard: same D-080 wall as the L5.57–L5.78 arc — `app/sitemap.ts`
// and the page files pull `next` types (`MetadataRoute`, `Metadata`) and
// `@/`-aliased modules the bare `.mjs` loader can't resolve and that aren't
// installed for the runner — so this reads source as TEXT (`fs` + regex +
// filesystem route walk), never executes a route, and runs identically on the
// routine laptop and in CI.
//
// Pure Node built-ins, no npm install — run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP_DIR = join(REPO_ROOT, "app");

// --- Walk app/ for `page` routes -------------------------------------------
//
// Mirrors L5.64's route walk but keeps ONLY `page` file-convention routes (the
// navigable HTML pages a sitemap lists) — not `route` API endpoints or metadata
// conventions. Each route records its URL path, whether it carries a dynamic
// (`[slug]`) or catch-all (`[...rest]`) segment, and its source file (so the
// noindex carve-out can read the page's own metadata). Route groups `(group)`
// contribute no URL segment; parallel slots `@slot` are not navigable URLs.
function isDynamicSeg(name) {
  return /^\[.+\]$/.test(name); // covers both [slug] and [...rest]
}

function collectPageRoutes(dir, segs, dynamic, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // dir absent on this checkout
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const name = entry.name;
      if (name === "node_modules" || name === "__tests__") continue;
      if (/^\(.+\)$/.test(name)) {
        collectPageRoutes(join(dir, name), segs, dynamic, out); // group: no segment
      } else if (name.startsWith("@")) {
        continue; // parallel route slot: not a navigable URL
      } else {
        collectPageRoutes(
          join(dir, name),
          [...segs, name],
          dynamic || isDynamicSeg(name),
          out,
        );
      }
    } else if (entry.isFile()) {
      const m = entry.name.match(/^([^.]+)\.(?:t|j)sx?$/);
      if (m && m[1] === "page") {
        const urlPath = segs.length ? "/" + segs.join("/") : "/";
        out.push({ urlPath, dynamic, file: join(dir, entry.name) });
      }
    }
  }
}

// --- Noindex detection ------------------------------------------------------
//
// A page is "noindex" when it overrides the layout's default indexable robots
// with `index: false` (Next `Metadata.robots` object form) or a `"noindex"`
// directive string. Exported so the predicate is unit-testable without a fixture
// file on disk. Comments are stripped first so a `// robots: { index: false }`
// example in prose never reads as a real declaration.
export function declaresNoindex(src) {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  // Object form: `robots: { ... index: false ... }`. The `[^}]*` stays inside
  // the robots object literal so an unrelated later `index: false` can't match.
  if (/robots\s*:\s*\{[^}]*\bindex\s*:\s*false\b/.test(code)) return true;
  // String/array form: a `noindex` directive anywhere in a robots value.
  if (/robots\s*:\s*(["'`][^"'`]*\bnoindex\b|[^,;}]*\bnoindex\b)/.test(code)) {
    return true;
  }
  return false;
}

// A static page route is REQUIRED in the sitemap when it is neither dynamic nor
// noindex. (Reading the file lazily — only for non-dynamic candidates — keeps the
// I/O to the handful of static pages.)
function isRequiredInSitemap(route) {
  if (route.dynamic) return false;
  let src;
  try {
    src = readFileSync(route.file, "utf8");
  } catch {
    return true; // unreadable: fail safe toward requiring coverage
  }
  return !declaresNoindex(src);
}

// --- Sitemap static URL set -------------------------------------------------
//
// `app/sitemap.ts` builds absolute URLs as `${SITE_URL}/<path>` template
// literals. Pull each fully-static path tail (the same extraction L5.64 uses);
// an interpolated tail (`${SITE_URL}/role/${slug}`) has a `$` immediately after
// the captured prefix and is skipped — it is the dynamic surface, not a static
// entry. The home entry `${SITE_URL}/` yields `/`.
const SITEMAP_URL = /\$\{SITE_URL\}(\/[A-Za-z0-9._\-/]*)/g;

function collectSitemapPaths() {
  const file = join(APP_DIR, "sitemap.ts");
  let src;
  try {
    src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  } catch {
    return new Set();
  }
  const out = new Set();
  let m;
  while ((m = SITEMAP_URL.exec(src)) !== null) {
    if (src[m.index + m[0].length] === "$") continue; // interpolated tail
    out.add(m[1]);
  }
  return out;
}

const PAGE_ROUTES = [];
collectPageRoutes(APP_DIR, [], false, PAGE_ROUTES);
const sitemapPaths = collectSitemapPaths();
const requiredPaths = PAGE_ROUTES.filter(isRequiredInSitemap)
  .map((r) => r.urlPath)
  .sort();

test("the app/ page-route walk found the expected anchor pages", () => {
  // Vacuous-walk guard: if the walker found nothing (or missed a known page),
  // the coverage ⊆ check below would pass for the wrong reason.
  assert.ok(PAGE_ROUTES.length > 0, "no page routes discovered under app/");
  const paths = PAGE_ROUTES.map((r) => r.urlPath);
  for (const p of ["/", "/privacy", "/report/2026"]) {
    assert.ok(paths.includes(p), `expected page route ${p} to be discovered`);
  }
  // The dynamic role page must be discovered AND flagged dynamic.
  const role = PAGE_ROUTES.find((r) => r.urlPath === "/role/[slug]");
  assert.ok(role, "expected the dynamic /role/[slug] page route to be found");
  assert.ok(role.dynamic, "/role/[slug] should be flagged as dynamic");
});

test("the sitemap static-URL scan found its anchor entries", () => {
  // Vacuous-scan guard: an empty scan would make the coverage check trivially
  // pass (required ⊆ {} can only hold if nothing is required).
  assert.ok(
    sitemapPaths.size > 0,
    "found no ${SITE_URL}/… static URLs in app/sitemap.ts — scan misconfigured",
  );
  for (const p of ["/", "/privacy", "/report/2026"]) {
    assert.ok(
      sitemapPaths.has(p),
      `sitemap scan missed expected static entry ${p}; found: ${[...sitemapPaths].sort().join(", ")}`,
    );
  }
});

test("every static, indexable page route is advertised in the sitemap", () => {
  // The load-bearing invariant: static-indexable-page-routes ⊆ sitemap.
  const missing = requiredPaths.filter((p) => !sitemapPaths.has(p));
  assert.deepEqual(
    missing,
    [],
    "page route(s) that are static + indexable but NOT in app/sitemap.ts " +
      "(search engines won't discover them):\n" +
      missing.map((p) => `  ${p}`).join("\n"),
  );
});

test("the dynamic /role/[slug] route is NOT required as a static sitemap entry", () => {
  // Documents the D-021 carve-out: the dynamic role page is seeded into the
  // sitemap per-JSON at runtime, never as a static literal, so it must not be in
  // the required set (else the suite would demand a 404-prone static entry).
  assert.ok(
    !requiredPaths.includes("/role/[slug]"),
    "the dynamic role route must be excluded from the required static set",
  );
});

test("a noindex page is excluded from the required set (carve-out works)", () => {
  // Predicate-level check so the noindex carve-out is verified without a fixture
  // page on disk. Covers the object form, the string form, and the indexable
  // default (which must NOT be treated as noindex).
  assert.ok(
    declaresNoindex("export const metadata = { robots: { index: false } };"),
    "object-form `robots: { index: false }` should read as noindex",
  );
  assert.ok(
    declaresNoindex('export const metadata = { robots: "noindex, nofollow" };'),
    "string-form `noindex` directive should read as noindex",
  );
  assert.ok(
    !declaresNoindex("export const metadata = { robots: { index: true } };"),
    "the indexable default must NOT read as noindex",
  );
  assert.ok(
    !declaresNoindex("// robots: { index: false }  (example in a comment)"),
    "a commented-out robots example must NOT read as noindex",
  );
});

test("the three known static pages are required AND present (anchor)", () => {
  // Pins today's surface so the suite also fails loudly if a future edit DROPS a
  // page from the sitemap (not only when a new uncovered page is added).
  for (const p of ["/", "/privacy", "/report/2026"]) {
    assert.ok(
      requiredPaths.includes(p),
      `${p} should be in the required (static + indexable) set`,
    );
    assert.ok(p === "/" || sitemapPaths.has(p), `${p} should be in the sitemap`);
  }
  assert.ok(sitemapPaths.has("/"), "home `/` should be in the sitemap");
});
