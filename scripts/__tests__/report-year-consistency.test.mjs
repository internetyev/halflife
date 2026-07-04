// Annual-report YEAR consistency guard: the one calendar year the "Most At-Risk
// Roles" report is published under — currently `2026` — must be byte-for-byte in
// step across every surface that hard-carries it, and the served URL path must
// equal the canonical the page declares for itself.
//
// The report year lives in FIVE independent places, only ONE of which is a real
// variable; the other four are literals a rename must be remembered at:
//
//   1. `app/report/2026/page.tsx` — the ROUTE-SEGMENT DIRECTORY name `2026` is the
//      actual URL Next.js serves the page at (`app/report/2026/page.tsx` →
//      `/report/2026`). This is the one authoritative "where does this page live".
//   2. …and inside that same file, `const REPORT_YEAR = 2026` — the SOURCE OF TRUTH
//      the page's own code derives from: `alternates.canonical = `/report/${REPORT_YEAR}``,
//      the data filename `most-at-risk-${REPORT_YEAR}.json`, the email source
//      `report-${REPORT_YEAR}`, and the on-page copy ("The {REPORT_YEAR} ranking…").
//   3. `app/sitemap.ts` — a HARDCODED `${SITE_URL}/report/2026` (a literal `2026`,
//      NOT derived from anything the page exports), the URL crawlers are told exists.
//   4. `components/site-footer.tsx` — the `href="/report/2026"` "Report" link every
//      page's footer shows.
//   5. `app/not-found.tsx` — the `href="/report/2026"` link the 404 page offers.
//
// The load-bearing drift this pins is a SELF-CONTRADICTING canonical / dead
// advertised URL, invisible to every build step (none of these is touched by
// `next build`/`tsc --noEmit`; a year literal and a directory name are each valid
// on their own):
//   (a) THE CANONICAL-vs-SERVED SPLIT (the one nothing else guards): the report is
//       rolled forward — `REPORT_YEAR` is bumped to `2027` — but the directory is
//       left named `2026` (or a new `app/report/2027/` is added while the old one
//       lingers). The page now SERVES at `/report/2026` while declaring
//       `alternates.canonical = /report/2027`: a canonical pointing at a URL this
//       page is not served from. Google drops the page from the index (canonical to
//       a 404), and `tsc`/`next build` stay green because both `2026` (the path) and
//       `2027` (the `${REPORT_YEAR}` string) are individually valid. NO existing
//       guard reads the directory name and compares it to `REPORT_YEAR`.
//   (b) THE ADVERTISED-URL SPLIT: `REPORT_YEAR`/the directory roll to `2027` but the
//       hardcoded `/report/2026` in `app/sitemap.ts` is missed — the sitemap keeps
//       advertising `/report/2026` to crawlers, a URL that now 404s, while the live
//       page at `/report/2027` is never listed. The L5.79 sitemap-route-coverage
//       guard checks the sitemap CONTAINS the report route, but it compares against a
//       hardcoded `/report/2026` expectation of its own — it never pins the YEAR to
//       `REPORT_YEAR`, so a coordinated roll that updated the test's own literal too
//       would sail through. This guard owns the year itself.
//   (c) THE INTERNAL-LINK SPLIT: the footer/not-found `href="/report/2026"` is missed
//       on a roll — the footer "Report" link and the 404's recovery link 404. The
//       L5.64 internal-link guard catches a link that resolves to NO route (link ⊆
//       routes), but if BOTH the old `app/report/2026/` dir and the stale link stay
//       (only `REPORT_YEAR` moved), the link still resolves to a real — but now
//       WRONG-year, canonical-orphaned — page; link⊆routes stays green. This guard
//       pins the link's year to the one true report year.
//
// Also asserts the page's own derivations STAY derivations: `canonical` and the data
// filename must interpolate `${REPORT_YEAR}` (not a re-hardcoded `/report/2026` /
// `most-at-risk-2026.json`), so a future edit can't silently re-freeze them at a year
// and reopen (a)/(b) from inside the source-of-truth file.
//
// A single `2026` anchor pins the current source of truth so a fully-coordinated
// roll across all five surfaces is still a deliberate, test-visible edit here (same
// drop-detector role CANONICAL_SLUG / CORE_GOALS play in the L5.83/L5.82 guards).
//
// Why a text guard: same D-080 wall as the L5.57–L5.83 arc — `page.tsx` imports
// `next` (`Metadata`) and `@/`-aliased modules (`@/components/email-capture`,
// `@/lib/scoring/types`) the bare `.mjs` loader can't resolve and that aren't
// installed for the runner; `sitemap.ts` imports `next` types; footer/not-found
// import `next/link`. So it reads each source as TEXT and regex-extracts the year,
// and reads the `app/report/` directory listing for the served segment. Pure Node
// built-ins, no npm install — identical on the routine laptop and CI. Run via
// `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical source-of-truth report year. Named here as the drop-detector
// anchor: a coordinated roll across all five surfaces would keep the cross-surface
// agreement check green, so this literal forces the roll to be a deliberate,
// reviewed edit here too.
const CANONICAL_YEAR = "2026";

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// (1) The route-segment directory: the numeric child of `app/report/` that holds a
// `page.tsx`. This is the year the page is actually SERVED at. Returns the sole
// four-digit directory name; asserts there is exactly one so a stray `app/report/2027/`
// left behind on a roll is caught as "two report years on disk".
function reportRouteYears() {
  const entries = readdirSync(join(REPO_ROOT, "app", "report"), { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
    .map((e) => e.name);
}

// (2) `const REPORT_YEAR = <year>` — the page's own source of truth.
function reportYearConst(src) {
  const m = /const\s+REPORT_YEAR\s*=\s*(\d{4})\b/.exec(src);
  return m ? m[1] : null;
}

// (3)/(4)/(5) Every `/report/<year>` path literal in a source (sitemap URL, footer
// href, not-found href). Returns the list of four-digit years.
function reportPathYears(src) {
  const re = /\/report\/(\d{4})\b/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

const pageSrc = read("app/report/2026/page.tsx");
const sitemapSrc = read("app/sitemap.ts");
const footerSrc = read("components/site-footer.tsx");
const notFoundSrc = read("app/not-found.tsx");

const routeYears = reportRouteYears();
const constYear = reportYearConst(pageSrc);
const sitemapYears = reportPathYears(sitemapSrc);
const footerYears = reportPathYears(footerSrc);
const notFoundYears = reportPathYears(notFoundSrc);

test("each report-year surface yields a year (vacuous-scan guard)", () => {
  // If any extractor silently returned nothing, the agreement check below would
  // pass for the wrong reason. Assert every source contributed first.
  assert.equal(routeYears.length, 1, `expected exactly one app/report/<year>/ directory, found ${routeYears.length}: ${routeYears.join(", ")}`);
  assert.ok(constYear, "could not extract `const REPORT_YEAR = <year>` from app/report/2026/page.tsx");
  assert.ok(sitemapYears.length >= 1, "app/sitemap.ts yielded no /report/<year> path");
  assert.ok(footerYears.length >= 1, "components/site-footer.tsx yielded no /report/<year> href");
  assert.ok(notFoundYears.length >= 1, "app/not-found.tsx yielded no /report/<year> href");
});

test("the served route directory equals the page's own REPORT_YEAR (no self-contradicting canonical)", () => {
  // The load-bearing check nothing else owns: the directory Next serves the page at
  // must equal the `REPORT_YEAR` the page derives its `alternates.canonical` from.
  // A mismatch is a canonical pointing at a URL the page is not served from — a
  // silent de-index that ships green.
  assert.equal(
    routeYears[0],
    constYear,
    `the report is served at /report/${routeYears[0]} but REPORT_YEAR=${constYear} makes its ` +
      `canonical /report/${constYear} — the canonical must match the served path. Rename the ` +
      `app/report/<year>/ directory and REPORT_YEAR together.`,
  );
});

test("every /report/<year> literal (sitemap, footer, not-found) equals REPORT_YEAR", () => {
  // The advertised sitemap URL and the two internal recovery links are hardcoded
  // years, not derived from REPORT_YEAR — pin each to the source of truth so a roll
  // that misses one (dead sitemap URL / 404ing footer link) fails here.
  const surfaces = [
    { name: "app/sitemap.ts", years: sitemapYears },
    { name: "components/site-footer.tsx", years: footerYears },
    { name: "app/not-found.tsx", years: notFoundYears },
  ];
  for (const { name, years } of surfaces) {
    for (const y of years) {
      assert.equal(
        y,
        constYear,
        `${name} links /report/${y} but REPORT_YEAR=${constYear}. Update every /report/<year> ` +
          `literal together — a stale one is a dead advertised URL or a 404ing link.`,
      );
    }
  }
});

test("all five surfaces resolve to ONE shared report year", () => {
  // Collapses everything to a single set: exactly one year may span the route
  // directory, the const, and the three path literals.
  const all = new Set([routeYears[0], constYear, ...sitemapYears, ...footerYears, ...notFoundYears]);
  assert.equal(
    all.size,
    1,
    `report year is split across surfaces; found ${[...all].join(", ")} (route dir ${routeYears[0]}, ` +
      `REPORT_YEAR ${constYear}, sitemap ${sitemapYears.join("/")}, footer ${footerYears.join("/")}, ` +
      `not-found ${notFoundYears.join("/")})`,
  );
});

test("the shared report year is the canonical 2026 (drop-detector anchor)", () => {
  // Pins the current source of truth literally so a fully-coordinated roll — which
  // the agreement checks alone would let through — is still a deliberate, test-visible
  // edit here.
  assert.equal(constYear, CANONICAL_YEAR, `the report year must be ${CANONICAL_YEAR} (found ${constYear})`);
  assert.equal(routeYears[0], CANONICAL_YEAR, `the report route directory must be ${CANONICAL_YEAR} (found ${routeYears[0]})`);
});

test("the page's canonical and data filename stay derived from ${REPORT_YEAR} (no re-hardcoded year)", () => {
  // The page's own `canonical` and data-file path interpolate `${REPORT_YEAR}` today,
  // so they cannot drift from the const. Assert that promise holds — a future edit that
  // re-freezes them at a literal year (`/report/2026`, `most-at-risk-2026.json`) would
  // reopen the canonical/data drift from inside the source-of-truth file.
  assert.match(
    pageSrc,
    /canonical:\s*`\/report\/\$\{REPORT_YEAR\}`/,
    "app/report/2026/page.tsx must set `alternates.canonical` to `/report/${REPORT_YEAR}` (derived, not a hardcoded year)",
  );
  assert.match(
    pageSrc,
    /most-at-risk-\$\{REPORT_YEAR\}\.json/,
    "app/report/2026/page.tsx must read `most-at-risk-${REPORT_YEAR}.json` (derived, not a hardcoded year)",
  );
});
