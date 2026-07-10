// Subscribe `source`-length consistency guard: the `/api/subscribe` route silently
// CAPS the analytics-attribution `source` field at 64 characters — anything longer is
// coerced to `undefined` and dropped, with NO error surfaced to the caller. This pins
// every `source` value the client can hand to the route to fit under that cap, so a
// too-long label never vanishes into a silent attribution hole.
//
// The subscribe-field analogue of L5.95's title-length guard (that pinned the analyze
// route's 200-char reject cap across server/client/doc). Here the input bound lives —
// independently hard-coded — across THREE hand-maintained sites, and nothing relates them:
//   1. `app/api/subscribe/route.ts` — `const MAX_SOURCE_LENGTH = 64`, the AUTHORITATIVE
//      server cap. The route keeps `source` ONLY when
//      `body.source.length <= MAX_SOURCE_LENGTH`, otherwise it becomes `undefined` — a
//      SILENT drop, not a `400`. (Unlike the title cap, an over-long `source` is not
//      rejected; the request still succeeds, the attribution is just lost.)
//   2. `components/email-capture.tsx` — the `source = "report-2026"` DEFAULT used when a
//      caller mounts `<EmailCapture />` without the prop; whatever this default is gets
//      POSTed verbatim in the `/api/subscribe` body.
//   3. `app/report/2026/page.tsx` — the one live call-site, `<EmailCapture
//      source={`report-${REPORT_YEAR}`} />`, whose runtime value (with `REPORT_YEAR`)
//      is the label real signups carry.
//
// The load-bearing drift this pins, invisible to `next build` / `tsc --noEmit` (each
// literal is a valid string / number on its own, split across two `.tsx` modules and a
// route):
//   (a) THE OVER-CAP SILENT DROP: rename a `source` to something descriptive
//       ("most-at-risk-roles-2026-hero-footer-cta-variant-b…") past 64 chars and the
//       server quietly discards it — every signup from that surface lands with NO
//       `source`, so the launch-analytics attribution the field exists for is a blank,
//       and nothing — not a type error, not a 400 — says so.
//   (b) THE DEFAULT-vs-CALL-SITE SPLIT: the mounted call-site value and the omitted-prop
//       default must be the same label, or a future `<EmailCapture />` mounted without
//       the prop reports a DIFFERENT attribution than the report page's explicit one.
//
// Also asserts the cap const actually REACHES the `.length <=` comparison, and that the
// default `source` is actually SENT in the POST body — so a future edit can't leave the
// const equal-but-unused or the default unwired while the length checks below still pass.
//
// A single 64 anchor (EXPECTED_CAP) pins the current source of truth as a drop-detector:
// a coordinated roll of the cap across surfaces is still a deliberate, test-visible edit
// here — same role EXPECTED_CAP plays in the L5.95 title-length guard.
//
// Why a text guard: same D-080 wall as the L5.57–L5.95 arc — `route.ts` and the two
// `.tsx` files value-import `@/`-aliased modules and `next`/`react` the bare `.mjs`
// node-test loader can't resolve and that aren't installed for the runner. So it reads
// all three as TEXT, strips comments from the sources, and regex-extracts each literal.
// Pure Node built-ins, no npm install — identical on the routine laptop and CI. Run via
// `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical source-of-truth `source` cap. Named here as the drop-detector anchor:
// a coordinated roll across surfaces would keep the cross-surface bound checks green, so
// this literal forces the roll to be a deliberate edit here too.
const EXPECTED_CAP = 64;

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Strip `//` line comments and `/* */` block comments so a commented-out or documentation
// literal never satisfies (or breaks) an extractor. Good enough for these sources — no
// `//` or `/*` appears inside a string literal we scan.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// (1) `const MAX_SOURCE_LENGTH = <n>` — the server's authoritative silent-drop cap.
function serverCap(src) {
  const m = /const\s+MAX_SOURCE_LENGTH\s*=\s*(\d+)\b/.exec(stripComments(src));
  return m ? Number(m[1]) : null;
}

// (2) the `source = "<literal>"` destructuring default in EmailCapture's signature.
function defaultSource(src) {
  const m = /\bsource\s*=\s*"([^"]*)"/.exec(stripComments(src));
  return m ? m[1] : null;
}

// (3a) `const REPORT_YEAR = <n>` from the report page.
function reportYear(src) {
  const m = /const\s+REPORT_YEAR\s*=\s*(\d+)\b/.exec(stripComments(src));
  return m ? Number(m[1]) : null;
}

// (3b) the static prefix of the call-site `source={`<prefix>${REPORT_YEAR}`}` template.
function callSitePrefix(src) {
  const m = /source=\{`([^$`]*)\$\{REPORT_YEAR\}`\}/.exec(stripComments(src));
  return m ? m[1] : null;
}

const routeSrc = read("app/api/subscribe/route.ts");
const captureSrc = read("components/email-capture.tsx");
const reportSrc = read("app/report/2026/page.tsx");

const cap = serverCap(routeSrc);
const dflt = defaultSource(captureSrc);
const year = reportYear(reportSrc);
const prefix = callSitePrefix(reportSrc);
// The label a real signup from the report page carries at runtime.
const callSiteValue = prefix !== null && year !== null ? `${prefix}${year}` : null;

test("each source-length surface yields a value (vacuous-scan guard)", () => {
  // If any extractor silently returned null, the bound checks below would pass for the
  // wrong reason (a NaN comparison, or a lone survivor). Assert all four bit first, and
  // that each file is non-trivially sized so a mis-path can't quietly satisfy them.
  assert.ok(routeSrc.length > 400, "app/api/subscribe/route.ts unexpectedly tiny — wrong path?");
  assert.ok(captureSrc.length > 400, "components/email-capture.tsx unexpectedly tiny — wrong path?");
  assert.ok(reportSrc.length > 400, "app/report/2026/page.tsx unexpectedly tiny — wrong path?");
  assert.ok(cap !== null, "could not extract `const MAX_SOURCE_LENGTH = <n>` from app/api/subscribe/route.ts");
  assert.ok(dflt !== null, "could not extract the `source = \"…\"` default from components/email-capture.tsx");
  assert.ok(year !== null, "could not extract `const REPORT_YEAR = <n>` from app/report/2026/page.tsx");
  assert.ok(prefix !== null, "could not extract the `source={`…${REPORT_YEAR}`}` call-site from app/report/2026/page.tsx");
});

test("the cap const actually gates the source length (not a dead const)", () => {
  // MAX_SOURCE_LENGTH only bounds anything if it reaches a `.length <=` comparison. Pin
  // that wiring so a future edit can't leave the const equal-but-unused and silently
  // reopen the over-cap drop while the bound checks below still pass.
  assert.match(
    stripComments(routeSrc),
    /\.length\s*<=\s*MAX_SOURCE_LENGTH/,
    "app/api/subscribe/route.ts must compare `body.source.length <= MAX_SOURCE_LENGTH` — the const alone caps nothing",
  );
});

test("the default source is actually sent in the POST body (not a dead prop)", () => {
  // The default only matters if `source` reaches the /api/subscribe request body. Pin the
  // wiring so the default-vs-call-site equality below can't pass on an unwired prop.
  assert.match(
    stripComments(captureSrc),
    /JSON\.stringify\(\{[^}]*\bsource\b[^}]*\}\)/,
    "components/email-capture.tsx must POST `source` in the /api/subscribe JSON body — the default alone is sent nowhere",
  );
});

test("the default source fits under the server cap (no silent drop)", () => {
  // The load-bearing check for the omitted-prop path: `<EmailCapture />` without a prop
  // POSTs this default; if it exceeds the cap the server discards it and the signup lands
  // with no attribution, no error.
  assert.ok(
    dflt.length <= cap,
    `EmailCapture default source "${dflt}" is ${dflt.length} chars but the server caps source at ${cap}; ` +
      `it would be silently dropped to undefined on every default-prop signup`,
  );
});

test("the call-site source fits under the server cap (no silent drop)", () => {
  // The load-bearing check for the live path: the report page's `report-${REPORT_YEAR}`
  // is the label real signups carry; it must survive the server cap.
  assert.ok(
    callSiteValue.length <= cap,
    `report-page source "${callSiteValue}" is ${callSiteValue.length} chars but the server caps source at ${cap}; ` +
      `it would be silently dropped to undefined on every report-page signup`,
  );
});

test("the omitted-prop default equals the live call-site value", () => {
  // A `<EmailCapture />` mounted without the prop must attribute to the same label the
  // report page passes explicitly — otherwise a future default-prop mount reports a
  // different `source` than the one live surface does.
  assert.equal(
    dflt,
    callSiteValue,
    `EmailCapture default source "${dflt}" must equal the report-page call-site value "${callSiteValue}"; ` +
      `a mismatch means an omitted-prop mount reports a different attribution than the live call-site`,
  );
});

test("the server cap is the canonical 64 (drop-detector anchor)", () => {
  // Pin the current source of truth literally so a coordinated roll of the cap — which the
  // bound checks alone would let through as long as the sources stayed short — is still a
  // deliberate, test-visible edit here.
  assert.equal(cap, EXPECTED_CAP, `server MAX_SOURCE_LENGTH must be ${EXPECTED_CAP} (found ${cap})`);
});
