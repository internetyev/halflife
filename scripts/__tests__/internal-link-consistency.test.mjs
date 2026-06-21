// Internal-link integrity guard: every STATIC internal `href` in the app's
// pages/components — and every static path the sitemap advertises — must
// resolve to a real route under `app/`.
//
// Next.js maps the filesystem to URLs: `app/report/2026/page.tsx` → `/report/2026`,
// `app/privacy/page.tsx` → `/privacy`, `app/role/[slug]/page.tsx` → `/role/:slug`,
// the root `app/page.tsx` → `/`, and file-convention metadata routes
// (`app/apple-icon.tsx` → `/apple-icon`, `app/sitemap.ts` → `/sitemap.xml`, …).
// Nothing pins the hand-written link strings to that route tree, though. Rename
// or remove a route — e.g. fold `/report/2026` into `/report`, or drop
// `/privacy` — and the `<Link href="/report/2026">` in `components/site-footer.tsx`,
// the `href="/report/2026"` in `app/not-found.tsx`, and the `${SITE_URL}/privacy`
// entry in `app/sitemap.ts` all keep pointing at the old path. `next build` and
// `tsc --noEmit` stay green (an href is just a string; Next does not statically
// verify internal `<Link>` targets), and the break ships as a live 404 — dead
// nav links plus, via the sitemap, a 404 URL submitted straight to search
// engines, the exact "never advertise a 404" failure the sitemap's own D-021
// note guards against on the dynamic side.
//
// This is the same silent-correctness drift class the L5.56–L5.63 consistency
// guards pin (doc/config/cache surfaces that compile clean while quietly
// disagreeing), applied to the internal-link surface — a genuinely new one. Like
// L5.57–L5.63 it reads source as TEXT (no import): it never executes a route or
// renders a component, so it needs no `node_modules`/`@/`-alias resolution and
// runs identically on the routine laptop and CI.
//
// DIRECTIONAL, by design: link ⊆ routes. Every static internal link must hit a
// real route, but NOT the reverse — a route with no inbound link (every role
// page until the human-gated L3.2b seed lands; the `/api/*` endpoints) is
// perfectly legitimate, so an unlinked route never fails.
//
// SCOPE — only fully-static internal links are checked. A template-literal or
// expression href (`href={`/role/${r.slug}`}`, `href={REPO_URL}`) is skipped:
// its value isn't a compile-time constant this text scan can resolve, and the
// dynamic `/role/[slug]` segment matches any slug anyway. External (`https://`,
// `mailto:`), protocol-relative (`//host`), and pure-fragment (`#id`) hrefs are
// out of scope — this guard is about the app's own route tree.
//
// Pure Node built-ins, no npm install — run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP_DIR = join(REPO_ROOT, "app");

// Dirs scanned for hand-written internal links. `app/` holds pages + the
// sitemap; `components/` holds shared chrome (the footer nav). `scripts/`,
// `data/`, docs etc. never render hrefs, so they're out of scope.
const LINK_DIRS = ["app", "components"];
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

// Metadata file conventions that Next serves at a fixed URL segment. The image
// conventions resolve at the route level of the file (`app/apple-icon.tsx` →
// `/apple-icon`); the special data files map to their served filename.
const METADATA_FILE_ROUTE = new Map([
  ["icon", "icon"],
  ["apple-icon", "apple-icon"],
  ["opengraph-image", "opengraph-image"],
  ["twitter-image", "twitter-image"],
  ["sitemap", "sitemap.xml"],
  ["robots", "robots.txt"],
  ["manifest", "manifest.webmanifest"],
]);

// Strip comments so a documentary href in prose (e.g. global-error.tsx's
// `<a href="/">` mentioned in a `//` comment, or a `/* */` example) isn't
// scanned as a real link. The line-comment strip is guarded against a preceding
// `:` so an external `https://…` URL inside a string is never mangled into a
// false internal `//…` match.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

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

// --- Build the route table from the `app/` filesystem ----------------------
//
// A route is an array of segment matchers. A static segment is the literal dir
// name; a dynamic segment `[slug]` matches any single path segment; a catch-all
// `[...rest]` matches one-or-more trailing segments. Route groups `(group)` and
// parallel slots `@slot` contribute no URL segment.
const DYNAMIC = { dynamic: true };
const CATCHALL = { catchall: true };

function segMatcher(name) {
  if (/^\[\.\.\..+\]$/.test(name)) return CATCHALL;
  if (/^\[.+\]$/.test(name)) return DYNAMIC;
  return { literal: name };
}

function collectRoutes(dir, segs, routes) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const name = entry.name;
      if (/^\(.+\)$/.test(name)) {
        collectRoutes(join(dir, name), segs, routes); // route group: no segment
      } else if (name.startsWith("@")) {
        continue; // parallel route slot: not a navigable URL
      } else {
        collectRoutes(join(dir, name), [...segs, segMatcher(name)], routes);
      }
    } else if (entry.isFile()) {
      const m = entry.name.match(/^([^.]+)\.(?:t|j)sx?$/);
      if (!m) continue;
      const base = m[1];
      if (base === "page" || base === "route") {
        routes.push(segs);
      } else if (METADATA_FILE_ROUTE.has(base)) {
        routes.push([...segs, { literal: METADATA_FILE_ROUTE.get(base) }]);
      }
    }
  }
}

const ROUTES = [];
collectRoutes(APP_DIR, [], ROUTES);

function pathSegments(p) {
  return p.split("/").filter(Boolean);
}

function routeMatches(matcher, segs) {
  // Catch-all only ever sits last; everything before it must match 1:1.
  const last = matcher[matcher.length - 1];
  if (last === CATCHALL) {
    if (segs.length < matcher.length - 1) return false;
    return matcher
      .slice(0, -1)
      .every((mm, i) => mm === DYNAMIC || mm.literal === segs[i]);
  }
  if (matcher.length !== segs.length) return false;
  return matcher.every((mm, i) => mm === DYNAMIC || mm.literal === segs[i]);
}

function resolves(linkPath) {
  const segs = pathSegments(linkPath);
  return ROUTES.some((r) => routeMatches(r, segs));
}

// --- Extract static internal links -----------------------------------------
//
// Match `href="…"`, `href='…'`, `href={"…"}`, `href={'…'}` — the four
// fully-static literal forms. A `href={`…`}` template or `href={ident}`
// expression has no string-literal group here, so it's skipped (its value isn't
// a compile-time constant and the dynamic `/role/[slug]` route covers it).
const HREF = /href=\{?\s*["']([^"']*)["']\s*\}?/g;

// Keep app-internal absolute paths only: leading `/` but not `//` (protocol-
// relative external). External schemes, mailto, tel, and `#fragment`s are out.
function isInternalPath(value) {
  return value.startsWith("/") && !value.startsWith("//");
}

function collectLinks(files) {
  const out = new Map(); // path -> Set(relative file:line)
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const code = stripComments(raw);
    const rel = file.slice(REPO_ROOT.length + 1);
    let m;
    while ((m = HREF.exec(code)) !== null) {
      const value = m[1];
      if (!isInternalPath(value)) continue;
      // Drop the query/fragment tail before resolving against the route tree.
      const path = value.split(/[?#]/)[0];
      if (!out.has(path)) out.set(path, new Set());
      out.get(path).add(rel);
    }
  }
  return out;
}

// The sitemap advertises absolute URLs `${SITE_URL}/<path>` straight to search
// engines, so its static paths must resolve too (the static analogue of the
// D-021 "don't list not-yet-seeded role 404s" rule). Pull the literal path tail
// out of each `${SITE_URL}/…` template occurrence; the dynamic
// `${SITE_URL}/role/${slug}` entries have a `${` in the tail and are skipped.
const SITEMAP_URL = /\$\{SITE_URL\}(\/[A-Za-z0-9._\-/]*)/g;

function collectSitemapPaths() {
  const file = join(APP_DIR, "sitemap.ts");
  let src;
  try {
    src = stripComments(readFileSync(file, "utf8"));
  } catch {
    return new Map();
  }
  const out = new Map();
  let m;
  while ((m = SITEMAP_URL.exec(src)) !== null) {
    // Skip dynamic entries: a path tail butting up against `${` (e.g.
    // `${SITE_URL}/role/${slug}`) is interpolated, not a static URL — the char
    // class stops at the `$`, leaving a `/role/` PREFIX that must not be
    // resolved as a literal path. Only fully-static tails are checked.
    if (src[m.index + m[0].length] === "$") continue;
    const path = m[1];
    if (!out.has(path)) out.set(path, new Set());
    out.get(path).add("app/sitemap.ts");
  }
  return out;
}

const links = collectLinks(
  LINK_DIRS.flatMap((d) => collectSourceFiles(join(REPO_ROOT, d))),
);
const sitemapPaths = collectSitemapPaths();

test("the app/ route table parses to the expected anchor routes", () => {
  // Vacuous-parser guard: if the walker found nothing (or missed the known
  // routes), every ⊆ check below would pass for the wrong reason.
  assert.ok(ROUTES.length > 0, "no routes discovered under app/");
  assert.ok(resolves("/"), "root route `/` should resolve (app/page.tsx)");
  assert.ok(
    resolves("/report/2026"),
    "`/report/2026` should resolve (app/report/2026/page.tsx)",
  );
  assert.ok(
    resolves("/privacy"),
    "`/privacy` should resolve (app/privacy/page.tsx)",
  );
  assert.ok(
    resolves("/role/anything"),
    "the dynamic `/role/[slug]` route should match an arbitrary slug",
  );
});

test("static internal links were actually discovered", () => {
  // Vacuous-scan guard: a dir rename that empties the scan would otherwise make
  // the resolve assertion trivially true (empty ⊆ routes).
  assert.ok(
    links.size > 0,
    "found no static internal hrefs under app/ or components/ — scan likely misconfigured",
  );
});

test("every static internal href resolves to a real app/ route", () => {
  const broken = [...links.keys()].filter((p) => !resolves(p)).sort();
  assert.deepEqual(
    broken,
    [],
    `internal href(s) pointing at no app/ route:\n` +
      broken
        .map((p) => `  ${p}  (in ${[...links.get(p)].sort().join(", ")})`)
        .join("\n"),
  );
});

test("every static path the sitemap advertises resolves to a real route", () => {
  // Discovery guard first: the `${SITE_URL}/…` extraction must find the known
  // static entries, else the resolve check below is vacuous.
  assert.ok(
    sitemapPaths.has("/") &&
      sitemapPaths.has("/report/2026") &&
      sitemapPaths.has("/privacy"),
    `sitemap static-path scan missed an expected entry; found: ${[...sitemapPaths.keys()].sort().join(", ")}`,
  );
  const broken = [...sitemapPaths.keys()].filter((p) => !resolves(p)).sort();
  assert.deepEqual(
    broken,
    [],
    `sitemap advertises path(s) that resolve to no app/ route (would submit a 404 to search engines):\n` +
      broken.map((p) => `  ${p}`).join("\n"),
  );
});

test("the known navigable routes are all present (anchors the route table)", () => {
  // Pins today's route surface so the suite also fails loudly if a future edit
  // DROPS a route a link still points at — not only when a new dangling link is
  // added. `[…]` literals mark the dynamic segment the matcher fills in.
  const expected = ["/", "/report/2026", "/privacy", "/role/[slug]"];
  for (const r of expected) {
    const probe = r.replace(/\[[^\]]+\]/g, "x");
    assert.ok(resolves(probe), `expected app/ to expose the route ${r}`);
  }
});
