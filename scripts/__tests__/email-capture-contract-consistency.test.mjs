// Email-capture contract consistency guard: the L5.4a email-capture feature
// spreads ONE status contract across three hand-maintained files, and nothing
// pinned them to each other until now:
//
//   1. `lib/email/capture.ts` — the `CaptureStatus` union
//      (`"ok" | "invalid-email" | "not-configured" | "upstream-error"`), the
//      set of outcomes `captureEmail()` can return, plus the default `source`
//      attribution value (`source = "report-2026"`).
//   2. `app/api/subscribe/route.ts` — the `switch (result.status)` that MAPS
//      each `CaptureStatus` onto an HTTP status code (ok→200, invalid-email→400,
//      not-configured→503, upstream-error→502).
//   3. `components/email-capture.tsx` — the client form that BRANCHES on those
//      HTTP codes: `res.ok`→success, `res.status === 503`→a calm "opens at
//      launch" note (NOT a red error), anything else→a red error. It also
//      declares its OWN default `source = "report-2026"`.
//
// **The load-bearing drift, invisible to `next build` / `tsc --noEmit`:**
//   (a) The route's `switch` is typed against `CaptureStatus`, but add a new
//       union member (`"rate-limited"`) and forget a `case` for it — tsc does
//       NOT force exhaustiveness here (there is a `default:` arm), so the new
//       status silently falls through to the 502 default and CI stays green.
//   (b) The 503↔pending-launch pairing is the whole point of L5.4a: the page
//       ships BEFORE the human runs L5.4b, so `not-configured` must render as a
//       calm note, not an alarming red error. Retune the route's not-configured
//       arm to some other code (or change the component's `res.status === 503`
//       check) and the unconfigured state renders as a scary failure on a page
//       that is working exactly as designed. Nothing relates the numeric literal
//       in the route to the numeric literal in the component.
//   (c) The default `source` (launch-channel attribution) is written twice — the
//       component sends it, the lib falls back to it when the route forwards
//       `undefined`. If they drift, the two default paths tag contacts with
//       different sources and attribution silently splits.
//
// **Why a text guard (same D-080 wall as the L5.57+ arc):** `capture.ts` and
// `route.ts` value-import `@/`-aliased modules / `next/server` the bare `.mjs`
// loader can't resolve, and the component is a `.tsx` client module — so this
// reads each source as TEXT, strips comments first (all three document the
// contract in prose — `200`/`503`/`report-2026` appear in comments and must not
// be scanned as code), and extracts the union / switch / branch with regexes.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

const CAPTURE_FILE = "lib/email/capture.ts";
const ROUTE_FILE = "app/api/subscribe/route.ts";
const COMPONENT_FILE = "components/email-capture.tsx";

// Strip block + line comments but preserve `://` inside URLs so a stray
// `https://` never eats real code (there is none here, but keep it robust).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const captureSrc = stripComments(read(CAPTURE_FILE));
const routeSrc = stripComments(read(ROUTE_FILE));
const componentSrc = stripComments(read(COMPONENT_FILE));

// --- extract the CaptureStatus union members from capture.ts ---
const UNION_BLOCK_RE = /type\s+CaptureStatus\s*=([\s\S]*?);/;
function captureStatusMembers() {
  const block = captureSrc.match(UNION_BLOCK_RE);
  assert.ok(block, "could not locate the `type CaptureStatus = …;` block");
  return [...block[1].matchAll(/"([a-z][a-z-]*)"/g)].map((m) => m[1]);
}

// --- extract the route's `switch (result.status)` case labels ---
function routeCaseLabels() {
  return [...routeSrc.matchAll(/case\s+"([a-z][a-z-]*)"\s*:/g)].map(
    (m) => m[1],
  );
}

// --- extract the HTTP status a given switch case returns ---
function routeStatusForCase(label) {
  const start = routeSrc.indexOf(`case "${label}"`);
  assert.notEqual(start, -1, `route has no \`case "${label}"\``);
  // slice to the next `case ` / `default:` boundary
  const rest = routeSrc.slice(start + label.length);
  const nextCase = rest.search(/\n\s*(?:case\s+"|default\s*:)/);
  const block = nextCase === -1 ? rest : rest.slice(0, nextCase);
  const status = block.match(/status:\s*(\d{3})/);
  assert.ok(status, `route \`case "${label}"\` returns no { status: NNN }`);
  return Number(status[1]);
}

// --- extract the HTTP code the component special-cases (the calm branch) ---
function componentSpecialStatus() {
  const m = componentSrc.match(/res\.status\s*===\s*(\d{3})/);
  assert.ok(m, "component has no `res.status === NNN` special-case branch");
  return Number(m[1]);
}

// --- extract a default `source = "…"` value from a file ---
function defaultSource(src, file) {
  const m = src.match(/source\s*=\s*"([^"]+)"/);
  assert.ok(m, `${file} has no default \`source = "…"\``);
  return m[1];
}

test("floor: union, switch, and component branches all parse non-vacuously", () => {
  const members = captureStatusMembers();
  const cases = routeCaseLabels();
  assert.ok(
    members.length >= 4,
    `expected ≥4 CaptureStatus members, got ${members.length}`,
  );
  assert.ok(
    cases.length >= 4,
    `expected ≥4 route switch cases, got ${cases.length}`,
  );
  assert.match(componentSrc, /res\.ok/, "component must key success off res.ok");
  assert.match(
    componentSrc,
    /res\.status\s*===\s*\d{3}/,
    "component must special-case an HTTP status",
  );
});

test("every CaptureStatus member is handled by exactly the route switch (set equality)", () => {
  const members = new Set(captureStatusMembers());
  const cases = new Set(routeCaseLabels());
  for (const m of members) {
    assert.ok(
      cases.has(m),
      `CaptureStatus "${m}" has no \`case "${m}"\` in the subscribe route — it falls through to the 502 default`,
    );
  }
  for (const c of cases) {
    assert.ok(
      members.has(c),
      `route handles \`case "${c}"\` but it is not a CaptureStatus member — stale/misspelled case`,
    );
  }
});

test("not-configured maps to 503 in the route AND is the code the component renders calmly", () => {
  const routeCode = routeStatusForCase("not-configured");
  const componentCode = componentSpecialStatus();
  assert.equal(
    routeCode,
    503,
    "the subscribe route must return 503 for not-configured (the L5.4b-not-run state)",
  );
  assert.equal(
    componentCode,
    routeCode,
    `the component special-cases HTTP ${componentCode} but the route returns ${routeCode} for not-configured — the unconfigured state would render as a red error instead of the calm "opens at launch" note`,
  );
});

test("the ok path stays a 2xx: route returns 200 and the component keys success off res.ok", () => {
  assert.equal(
    routeStatusForCase("ok"),
    200,
    "the subscribe route must return 200 for a successful capture",
  );
  assert.match(
    componentSrc,
    /if\s*\(\s*res\.ok\s*\)/,
    "component must treat any 2xx (res.ok) as success — not a hard-coded 200",
  );
});

test("default `source` attribution agrees between the lib and the component", () => {
  const libSource = defaultSource(captureSrc, CAPTURE_FILE);
  const componentSource = defaultSource(componentSrc, COMPONENT_FILE);
  assert.equal(
    libSource,
    componentSource,
    `default source drifted: ${CAPTURE_FILE} falls back to "${libSource}" but ${COMPONENT_FILE} sends "${componentSource}" — the two unconfigured/forwarded paths would tag contacts differently`,
  );
  assert.equal(
    libSource,
    "report-2026",
    'canonical default source anchor changed — update this test intentionally if "report-2026" was renamed',
  );
});
