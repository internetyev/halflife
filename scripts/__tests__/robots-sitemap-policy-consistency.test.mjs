// Robots ↔ sitemap path-policy consistency guard: the crawl policy `app/robots.ts`
// publishes and the URL set `app/sitemap.ts` advertises must agree — no URL the
// sitemap lists may fall under a robots `disallow` rule, and the `disallow` list
// must actually cover every `/api/*` route that exists.
//
// halflife ships two file-convention metadata routes whose JOB is to agree on what
// crawlers may index, but they were written independently and nothing pinned their
// path policies together until now:
//
//   - `app/robots.ts` (L5.5) → `/robots.txt`. Allows `/`, disallows `/api/`
//     (the `analyze`/`subscribe`/`og` JSON/image endpoints, not indexable pages),
//     and publishes a `Sitemap:` directive. Its header is explicit that the
//     `/api/` block "keeps search engines from indexing the raw endpoint as a thin
//     page".
//   - `app/sitemap.ts` (L3.3) → `/sitemap.xml`. Advertises the home `/`, the annual
//     report `/report/2026`, the privacy notice `/privacy`, and one `/role/<slug>`
//     per seeded role JSON. Its header is explicit that it only lists URLs that
//     resolve to a real 200 so the sitemap never points crawlers at 404s.
//
// The two are consistent today, but the contract is invisible to the compiler:
//
//   (a) Sitemapping a blocked URL. Someone adds an `/api/`-prefixed entry to the
//       sitemap (e.g. advertises `/api/og/<slug>` as a "page"), or tightens robots
//       to `disallow: "/report/"`. `next build`/`tsc --noEmit` stay green — each
//       file independently holds valid data — but now the sitemap advertises a URL
//       robots forbids: a "Sitemap contains blocked URL" warning in Search Console,
//       the exact self-contradiction a crawler resolves by distrusting BOTH files.
//   (b) A stale `disallow` list. A new endpoint lands at `app/api/<new>/route.ts`
//       but the `/api/` block is later narrowed (e.g. to `/api/analyze`), so the new
//       endpoint is suddenly crawlable and gets indexed as a thin JSON "page" — the
//       precise outcome robots.ts's header says the block exists to prevent. Or the
//       `disallow` is dropped entirely in a refactor and every API route opens up.
//   (c) The site root falls out of policy. A robots edit disallows `/` (blocking the
//       whole site) or the sitemap loses its home entry — either way the crawlable
//       set and the advertised set no longer share the one URL that anchors them.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.69 — `app/robots.ts`
// and `app/sitemap.ts` both pull `next` types (`MetadataRoute`) the `.mjs` loader
// can't resolve and that aren't installed for the test runner, and `sitemap.ts`
// additionally reads the filesystem at module-eval time — so this reads the two
// sources as TEXT and compares the extracted path literals, exactly the technique
// L5.57–L5.69 use on their surfaces. New consistency surface (the crawl-policy ↔
// advertised-URL contract between robots and sitemap), NOT a continuation of the
// D-095/L5.65 site-origin arc: that guard pins the SITE_URL ORIGIN literal across
// the metadata-route family and never looks at the PATH SUFFIXES or the disallow
// rules this checks; the origin and the path policy are orthogonal contracts.
//
// Pure Node built-ins (`fs` read + regex + `readdir`), no `node_modules`/`@/`-alias
// resolution, identical on the routine laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

const ROBOTS_FILE = "app/robots.ts";
const SITEMAP_FILE = "app/sitemap.ts";
const API_DIR = "app/api";

// Extract the `allow:` / `disallow:` rule paths from robots.ts. Each may be a
// single string (`disallow: "/api/"`) or an array (`disallow: ["/api/", "/x"]`).
// Returns a sorted array of the path literals found for the given key.
function robotsRule(src, key) {
  // Match `<key>: "<one>"` or `<key>: ['/a', "/b"]`. The value group is either a
  // bracketed list or a single quoted string.
  const m = new RegExp(`\\b${key}:\\s*(\\[[^\\]]*\\]|["'][^"']*["'])`).exec(src);
  assert.ok(
    m,
    `could not find \`${key}: ...\` in ${ROBOTS_FILE} — the rule was renamed or ` +
      "reshaped; update this guard with it (it pins the crawl policy the sitemap must agree with).",
  );
  const raw = m[1];
  // Pull every quoted string out of the matched value (works for both the single
  // string and the array form).
  return [...raw.matchAll(/["']([^"']*)["']/g)].map((g) => g[1]).sort();
}

// Extract every path the sitemap advertises: each `url: \`${SITE_URL}<path>\``.
// The role entry's path carries a `${slug}` interpolation — kept verbatim, since a
// `disallow`/prefix comparison only cares about the static leading segments
// (`/role/`), which never overlap `/api/`.
function sitemapPaths(src) {
  return [
    ...src.matchAll(/url:\s*`\$\{SITE_URL\}([^`]*)`/g),
  ].map((m) => m[1]);
}

// Directory names directly under app/api/ → their route URL prefix `/api/<name>`.
// Each such directory is an actual endpoint that robots must keep out of the index.
function apiRoutePrefixes() {
  const dir = join(REPO_ROOT, API_DIR);
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .map((name) => `/api/${name}`)
    .sort();
}

// Does `path` fall under crawl rule `rule`? Robots path rules are prefix matches:
// a rule `/api/` blocks every URL whose path starts with `/api/`. The root rule
// `/` is the universal prefix and is handled explicitly by the callers (it is the
// expected `allow`, never a `disallow` we test paths against).
function isUnder(path, rule) {
  return path === rule || path.startsWith(rule);
}

const robotsSrc = read(ROBOTS_FILE);
const sitemapSrc = read(SITEMAP_FILE);

const allowRules = robotsRule(robotsSrc, "allow");
const disallowRules = robotsRule(robotsSrc, "disallow");
const advertised = sitemapPaths(sitemapSrc);
const apiPrefixes = apiRoutePrefixes();

test("robots rules, sitemap paths, and api routes all parsed (vacuous-scan guard)", () => {
  // Guard the scan itself: a file rename or regex drift that quietly emptied any of
  // these lists would make the consistency checks below trivially pass over nothing.
  assert.ok(allowRules.length > 0, `parsed no \`allow\` rule from ${ROBOTS_FILE}`);
  assert.ok(
    disallowRules.length > 0,
    `parsed no \`disallow\` rule from ${ROBOTS_FILE}`,
  );
  assert.ok(
    advertised.length >= 3,
    `parsed ${advertised.length} sitemap paths from ${SITEMAP_FILE}, expected ≥3 ` +
      "(home + report + privacy at minimum) — the `url: `${SITE_URL}...`` scan likely drifted",
  );
  assert.ok(
    apiPrefixes.length > 0,
    `found no route directories under ${API_DIR}/ — the readdir scan drifted`,
  );
});

test("every robots rule path is absolute (begins with `/`) so prefix matching is well-formed", () => {
  // A rule like `api/` (no leading slash) silently never matches an absolute URL
  // path, so the disallow would be a no-op the build can't catch.
  const bad = [...allowRules, ...disallowRules].filter((p) => !p.startsWith("/"));
  assert.deepEqual(
    bad,
    [],
    `these robots rules are not absolute paths: ${bad.join(", ")}. ` +
      "Crawl rules must start with `/` or they never match.",
  );
});

test("every sitemap-advertised path is a well-formed absolute path", () => {
  // The sitemap composes `${SITE_URL}${path}`; each path must be `/` or start with a
  // single `/` and carry no `//` or whitespace, so the URL resolves cleanly AND the
  // prefix comparison in the disallow check below is meaningful.
  const bad = advertised.filter(
    (p) => !p.startsWith("/") || p.includes("//") || /\s/.test(p),
  );
  assert.deepEqual(
    bad,
    [],
    `these sitemap paths are malformed: ${bad.map((p) => JSON.stringify(p)).join(", ")}. ` +
      "Each must be an absolute path with no double slashes or whitespace.",
  );
});

test("no sitemap-advertised URL falls under a robots `disallow` rule", () => {
  // The load-bearing invariant: advertising a URL the crawl policy forbids is the
  // "Sitemap contains blocked URL" self-contradiction — a Search Console warning and
  // a signal crawlers resolve by distrusting both files.
  const blocked = [];
  for (const path of advertised) {
    for (const rule of disallowRules) {
      if (isUnder(path, rule)) {
        blocked.push(`${JSON.stringify(path)} is blocked by disallow ${JSON.stringify(rule)}`);
      }
    }
  }
  assert.deepEqual(
    blocked,
    [],
    `the sitemap advertises URLs robots.txt disallows: ${blocked.join("; ")}. ` +
      "Either drop them from the sitemap or stop disallowing them — a sitemap must never list a blocked URL.",
  );
});

test("every /api/* route is covered by a robots `disallow` rule (the block isn't stale)", () => {
  // robots.ts's header says the `/api/` block exists to keep crawlers from indexing
  // the raw endpoints as thin pages. If a new endpoint lands but the block is later
  // narrowed (or dropped), that endpoint silently becomes crawlable — green build,
  // an indexed JSON route. Direction: every real api prefix ⊆ some disallow rule.
  const uncovered = apiPrefixes.filter(
    (prefix) => !disallowRules.some((rule) => isUnder(prefix, rule)),
  );
  assert.deepEqual(
    uncovered,
    [],
    `these /api/* routes exist but no robots disallow rule covers them: ${uncovered.join(", ")}. ` +
      `Disallow rules are ${JSON.stringify(disallowRules)}. Add a rule (or widen one) so every ` +
      "endpoint stays out of the index — a stale disallow list lets new endpoints get crawled.",
  );
});

test("the site root `/` is both crawlable (allow) and advertised (sitemap home)", () => {
  // The one URL that anchors the crawlable set and the advertised set: robots must
  // allow `/` (not block the whole site) and the sitemap must list the home page.
  assert.ok(
    allowRules.includes("/"),
    `${ROBOTS_FILE} no longer \`allow\`s "/": robots allow rules are ${JSON.stringify(allowRules)}. ` +
      "Blocking the root hides the entire site from search.",
  );
  assert.ok(
    advertised.includes("/"),
    `${SITEMAP_FILE} no longer advertises the home page "/": sitemap paths are ${JSON.stringify(advertised)}. ` +
      "The home page must always be in the sitemap.",
  );
  // And the root must not itself be disallowed (an explicit `disallow: "/"` would
  // contradict the `allow: "/"` and block everything).
  assert.ok(
    !disallowRules.includes("/"),
    `${ROBOTS_FILE} disallows "/", which blocks the whole site: ${JSON.stringify(disallowRules)}.`,
  );
});
