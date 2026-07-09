// Analyze RESPONSE-contract consistency guard: the `/api/analyze` status-code
// contract must agree with how `app/page.tsx`'s client form branches on it.
//
// This is the response-side complement to `api-request-contract-consistency`
// (which pins only the REQUEST hop: path/method/body-field the client SENDS →
// the handler reads). Nothing there — or anywhere else — relates the codes the
// route RETURNS to the branches the form takes on them. The two halves live in
// separate modules with no shared type:
//   • app/api/analyze/route.ts  maps each outcome onto an HTTP status +, on 200,
//       an `x-halflife-cache: HIT|MISS` header, and every non-2xx body carries
//       an `{ error }` string.
//   • app/page.tsx  gates the success view on `res.ok`, reads `payload.error`
//       for every non-ok response, and reads `res.headers.get("x-halflife-cache")
//       === "HIT"` to label the result cache HIT/MISS.
//
// THE DRIFT THIS PINS is a silent production-only failure invisible to
// `next build` / `tsc --noEmit` (numeric status literals + header-name strings
// in two modules, never checked against each other):
//   (a) the route's success response stops being 2xx (e.g. someone returns a
//       cache-carrying 304) → `res.ok` is false → the form renders the SUCCESS
//       payload as a generic error;
//   (b) the route renames the cache header (`x-halflife-cache` → `x-cache`) →
//       `res.headers.get("x-halflife-cache")` is always null → every result is
//       silently labelled MISS, breaking the form-submit cache-split KPI;
//   (c) the route changes the sentinel value (`"HIT"` → `"hit"`) → the form's
//       `=== "HIT"` never matches → same silent all-MISS drift;
//   (d) a non-2xx response drops its `{ error }` field (renamed to `{ message }`)
//       → the form's `payload.error` read misses → the specific server message
//       is replaced by the generic "Request failed (HTTP nnn)" fallback.
//
// Distinct from the request-contract guard (that resolves fetch → route + body
// fields the client sends; this resolves route status/headers/error-body → the
// form's response branches). The status-code↔form-branch hop is unguarded there.
//
// Like the L5.57–L5.93 arc this reads both files as TEXT (no import): both
// value-import `@/`-aliases / `next` the bare `.mjs` loader can't resolve, so it
// never executes them — it strips comments and scans source. Pure Node built-ins,
// no npm install — run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROUTE_FILE = join(REPO_ROOT, "app", "api", "analyze", "route.ts");
const FORM_FILE = join(REPO_ROOT, "app", "page.tsx");

// Strip comments so a documentary `status: 429` or `x-halflife-cache` in prose
// isn't scanned as real code. Line-comment strip guards a preceding `:` so a
// `https://…` inside a string isn't mangled (mirrors the sibling guard).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const ROUTE_SRC = stripComments(readFileSync(ROUTE_FILE, "utf8"));
const FORM_SRC = stripComments(readFileSync(FORM_FILE, "utf8"));

// --- Brace/paren matching + top-level comma split (as in the sibling) --------
function matchBracket(src, openIndex, open, close) {
  let depth = 0;
  let str = null;
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    if (str) {
      if (c === str && src[i - 1] !== "\\") str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(openIndex + 1, i);
    }
  }
  return null; // unbalanced
}

// Split top-level entries, ignoring commas nested inside (), [], {} or strings.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let cur = "";
  let str = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (str) {
      if (c === str && text[i - 1] !== "\\") str = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      cur += c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// Field names of an inline object literal (`{ error: … }` → ["error"]).
// Spreads and computed keys yield no static name and are skipped.
function objectFieldNames(objText) {
  const fields = [];
  for (const raw of splitTopLevel(objText)) {
    const entry = raw.trim();
    if (!entry || entry.startsWith("...")) continue;
    const key = entry.split(":")[0].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(key)) fields.push(key);
  }
  return fields;
}

// --- Parse every NextResponse.json(...) response in the route ---------------
//
// Each response: { status, bodyFields, cacheHeader:{name,value}|null }. status
// defaults to 200 when the options arg omits it (Next's default). bodyFields is
// the field set of an inline `{ … }` first arg, or null for a variable body
// (`result`, `cached.result`), which has no statically-known shape.
function extractResponses(src) {
  const out = [];
  const CALL = /NextResponse\.json\(/g;
  let m;
  while ((m = CALL.exec(src)) !== null) {
    const parenOpen = m.index + m[0].length - 1;
    const argsText = matchBracket(src, parenOpen, "(", ")");
    if (argsText === null) continue;
    const args = splitTopLevel(argsText);
    const body = (args[0] ?? "").trim();
    const opts = (args[1] ?? "").trim();

    let bodyFields = null;
    if (body.startsWith("{")) {
      const inner = matchBracket(body, 0, "{", "}");
      if (inner !== null) bodyFields = objectFieldNames(inner);
    }

    const statusMatch = opts.match(/\bstatus:\s*(\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : 200;

    const headerMatch = opts.match(
      /["']([A-Za-z][A-Za-z0-9-]*)["']\s*:\s*["'](HIT|MISS)["']/,
    );
    const cacheHeader = headerMatch
      ? { name: headerMatch[1], value: headerMatch[2] }
      : null;

    out.push({ status, bodyFields, cacheHeader });
  }
  return out;
}

const RESPONSES = extractResponses(ROUTE_SRC);
const CODES = new Set(RESPONSES.map((r) => r.status));
const is2xx = (n) => n >= 200 && n < 300;

// --- Parse the form's response branches -------------------------------------
const FORM_HEADER_GET = FORM_SRC.match(
  /res\.headers\.get\(\s*["']([^"']+)["']\s*\)/,
);
const FORM_CACHE_SENTINEL = FORM_SRC.match(
  /res\.headers\.get\(\s*["'][^"']+["']\s*\)\s*===\s*["']([^"']+)["']/,
);
const FORM_HAS_OK_GATE = /!\s*res\.ok/.test(FORM_SRC) && /\bres\.ok\b/.test(FORM_SRC);
const FORM_READS_ERROR = /\.error\b/.test(FORM_SRC);
const FORM_HARDCODES_2XX = /res\.status\s*===\s*2\d\d/.test(FORM_SRC);

// Header names + sentinel values the route actually emits.
const ROUTE_CACHE_NAMES = new Set(
  RESPONSES.filter((r) => r.cacheHeader).map((r) => r.cacheHeader.name),
);
const ROUTE_CACHE_VALUES = new Set(
  RESPONSES.filter((r) => r.cacheHeader).map((r) => r.cacheHeader.value),
);

// ---------------------------------------------------------------------------

test("both contract halves parse to their anchors (vacuous-scan guard)", () => {
  // If either scan came up empty every ⊆ check below would pass vacuously.
  assert.ok(
    RESPONSES.length >= 4,
    `expected ≥4 NextResponse.json responses, found ${RESPONSES.length}`,
  );
  for (const code of [200, 400, 502, 503]) {
    assert.ok(CODES.has(code), `route no longer returns HTTP ${code}`);
  }
  assert.ok(FORM_HEADER_GET, "form no longer reads res.headers.get(<header>)");
  assert.ok(FORM_CACHE_SENTINEL, "form no longer compares the cache header to a sentinel");
  assert.ok(FORM_HAS_OK_GATE, "form no longer branches on res.ok / !res.ok");
  assert.ok(FORM_READS_ERROR, "form no longer reads an `.error` field off the payload");
});

test("responses carrying the cache header are 2xx (form's res.ok success gate)", () => {
  const withHeader = RESPONSES.filter((r) => r.cacheHeader);
  assert.ok(
    withHeader.length >= 1,
    "no response sets the cache header — the success path lost its cache signal",
  );
  const notOk = withHeader.filter((r) => !is2xx(r.status)).map((r) => r.status);
  assert.deepEqual(
    notOk,
    [],
    `cache-carrying response(s) with a non-2xx status — the form's res.ok gate ` +
      `would render the SUCCESS payload as a generic error: ${notOk.join(", ")}`,
  );
});

test("the form gates success on res.ok, not a brittle hardcoded status code", () => {
  // A `res.status === 200` gate silently breaks if the route's success code
  // ever changes (200 → 201/304); res.ok tracks the whole 2xx range.
  assert.ok(FORM_HAS_OK_GATE, "form must gate the success view on res.ok");
  assert.ok(
    !FORM_HARDCODES_2XX,
    "form hardcodes `res.status === 2xx` as the success gate — use res.ok so a " +
      "future success-code change (200 → 201) does not fall through to the error view",
  );
});

test("every non-2xx route response carries an { error } body the form reads", () => {
  // The form renders `payload.error` for every !res.ok response; a non-2xx body
  // that drops `error` (renamed to `message`) degrades to the generic fallback.
  const bad = [];
  for (const r of RESPONSES) {
    if (is2xx(r.status)) continue;
    if (r.bodyFields === null) continue; // non-inline body: shape not statically known
    if (!r.bodyFields.includes("error")) {
      bad.push(`HTTP ${r.status} body has {${r.bodyFields.join(", ")}} — no \`error\` field`);
    }
  }
  assert.deepEqual(
    bad,
    [],
    `non-2xx response(s) the form cannot surface via payload.error:\n  ${bad.join("\n  ")}`,
  );
  assert.ok(FORM_READS_ERROR, "form must read the `.error` field for non-ok responses");
});

test("the cache header name + sentinel value match on both sides", () => {
  assert.equal(ROUTE_CACHE_NAMES.size, 1, `route sets >1 cache header name: ${[...ROUTE_CACHE_NAMES]}`);
  const routeName = [...ROUTE_CACHE_NAMES][0];
  assert.equal(
    FORM_HEADER_GET[1],
    routeName,
    `form reads header \`${FORM_HEADER_GET[1]}\` but route sets \`${routeName}\` — a rename ` +
      `makes headers.get() always null (every result silently labelled MISS)`,
  );
  assert.ok(
    ROUTE_CACHE_VALUES.has(FORM_CACHE_SENTINEL[1]),
    `form compares the header to \`${FORM_CACHE_SENTINEL[1]}\` but route only emits ` +
      `{${[...ROUTE_CACHE_VALUES].join(", ")}} — the compare would never match`,
  );
  // Both HIT (cache hit) and MISS (fresh) must still be emitted so the split is real.
  for (const v of ["HIT", "MISS"]) {
    assert.ok(ROUTE_CACHE_VALUES.has(v), `route no longer emits cache value \`${v}\``);
  }
});

test("the known analyze status contract is present and correct (anchors the surface)", () => {
  // Pins today's exact contract so a future edit that DROPS a code (not only one
  // that adds a bad one) fails loudly.
  const byCode = new Map();
  for (const r of RESPONSES) byCode.set(r.status, r);

  // 200 is the success code and carries the cache header.
  const ok = RESPONSES.find((r) => r.status === 200 && r.cacheHeader);
  assert.ok(ok, "expected a 200 response carrying the x-halflife-cache header");
  assert.equal(ok.cacheHeader.name, "x-halflife-cache");

  // 400 (bad input), 502 (upstream/Claude), 503 (no key) all return { error }.
  for (const code of [400, 502, 503]) {
    const r = byCode.get(code);
    assert.ok(r, `expected an HTTP ${code} response`);
    assert.ok(
      r.bodyFields && r.bodyFields.includes("error"),
      `HTTP ${code} response should carry an { error } body`,
    );
  }

  // Form side of the anchor.
  assert.equal(FORM_HEADER_GET[1], "x-halflife-cache");
  assert.equal(FORM_CACHE_SENTINEL[1], "HIT");
});
