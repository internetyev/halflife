// API request-contract consistency guard: every client-side `fetch("/api/…")`
// call in the app's pages/components must agree with the route handler it
// targets on the WIRE CONTRACT — the path resolves to a real route file, that
// route exports the HTTP method the client uses, every JSON body field the
// client sends is actually read by the handler, and a JSON content-type is
// matched by a handler that parses the body.
//
// halflife has two client→server POST contracts, each split across two modules
// with NO shared wire type:
//   • app/page.tsx          → POST /api/analyze   body { title }
//                             → app/api/analyze/route.ts reads `body.title`
//   • components/email-capture.tsx → POST /api/subscribe body { email, source }
//                             → app/api/subscribe/route.ts reads `body.email`,
//                               `body.source`
// The client builds an untyped JSON object (`JSON.stringify({ email, source })`)
// and the route reads an `unknown`-typed body (`body.email`), so TypeScript
// never sees the two halves of the contract at once.
//
// THE DRIFT THIS PINS is a silent production-only failure, invisible to every
// build step (`next build` / `tsc --noEmit` stay green because client and server
// are separate modules with no shared type for the request body):
//   (a) the route renames a body field (`body.email` → `body.address`) but the
//       client still sends `email` → the handler reads `undefined` → every real
//       signup 400s with "a valid email is required", with nothing in CI to
//       catch it;
//   (b) the route moves (`/api/subscribe` → `/api/notify`) but the client still
//       posts the old path → 404;
//   (c) the route stops exporting the method the client uses (`POST` renamed to
//       `PUT`) → 405;
//   (d) the client declares `content-type: application/json` but the handler no
//       longer parses the body (`request.json()` dropped) → the body is ignored.
//
// This is a genuinely NEW surface — the request-side analogue of L5.64's
// internal-link guard (which resolves `<a href>` strings against the page route
// tree): this resolves `fetch()` strings against the `/api/*` route tree AND
// goes further, checking the method + body fields of the handler it lands on.
// Orthogonal to L5.74's health-probe guard (env-var presence, never request
// shape).
//
// DIRECTIONAL, by design: client ⊆ server. Every field the client SENDS must be
// read by the handler, but NOT the reverse — a handler may read fields no client
// sends (an optional knob, a field only the L3.2 seed script posts), so an
// unread-by-this-client field never fails.
//
// SCOPE — only fully-static inline contracts are checked. A `fetch(url, …)` with
// a computed path, or a body that isn't an inline `JSON.stringify({ … })` object
// literal (a variable, a spread), has no compile-time-constant shape this text
// scan can resolve, so its field set is skipped (path + method still checked
// when the path is a literal).
//
// Like the L5.57–L5.75 arc this reads source as TEXT (no import): it never
// executes a route or renders a component, so it needs no `node_modules`/`@/`-
// alias resolution and runs identically on the routine laptop and CI. Pure Node
// built-ins, no npm install — run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP_DIR = join(REPO_ROOT, "app");
const API_DIR = join(APP_DIR, "api");

// Dirs scanned for client `fetch()` calls. `app/` holds pages; `components/`
// holds the interactive forms (email-capture). `scripts/`, `lib/`, `data/`
// never issue browser fetches to the app's own routes, so they're out of scope.
const FETCH_DIRS = ["app", "components"];
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

// Strip comments so a documentary `fetch("/api/…")` or `body.email` in prose
// isn't scanned as real code. The line-comment strip is guarded against a
// preceding `:` so an external `https://…` URL inside a string isn't mangled.
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

// --- Build the /api route table from the filesystem ------------------------
//
// A route is { matcher, file }: matcher is an array of segment matchers (literal
// dir name, or `[slug]` → dynamic any-segment), file is the absolute path to the
// route handler so its source can be read once a fetch resolves to it. Route
// groups `(group)` contribute no segment.
const DYNAMIC = { dynamic: true };

function segMatcher(name) {
  if (/^\[.+\]$/.test(name)) return DYNAMIC;
  return { literal: name };
}

function collectApiRoutes(dir, segs, routes) {
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
        collectApiRoutes(join(dir, name), segs, routes); // group: no segment
      } else {
        collectApiRoutes(join(dir, name), [...segs, segMatcher(name)], routes);
      }
    } else if (entry.isFile()) {
      const m = entry.name.match(/^route\.(?:t|j)sx?$/);
      if (m) routes.push({ matcher: segs, file: join(dir, entry.name) });
    }
  }
}

const API_ROUTES = [];
collectApiRoutes(API_DIR, [{ literal: "api" }], API_ROUTES);

function pathSegments(p) {
  return p.split("/").filter(Boolean);
}

function matcherMatches(matcher, segs) {
  if (matcher.length !== segs.length) return false;
  return matcher.every((mm, i) => mm === DYNAMIC || mm.literal === segs[i]);
}

function resolveRoute(apiPath) {
  const segs = pathSegments(apiPath);
  return API_ROUTES.find((r) => matcherMatches(r.matcher, segs)) ?? null;
}

// --- Brace/paren matching + top-level comma split --------------------------
//
// Given source and the index of an opening bracket, return the substring
// (exclusive of the outer brackets) up to its match, respecting nesting.
function matchBracket(src, openIndex, open, close) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(openIndex + 1, i);
    }
  }
  return null; // unbalanced
}

// Split an object-literal body into top-level entries, ignoring commas nested
// inside (), [], {} or strings — so `{ a: f(1, 2), b }` splits into `a:…`, `b`.
function splitTopLevel(objText) {
  const parts = [];
  let depth = 0;
  let cur = "";
  let str = null;
  for (let i = 0; i < objText.length; i++) {
    const c = objText[i];
    if (str) {
      if (c === str && objText[i - 1] !== "\\") str = null;
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

// Pull the field names out of an inline object literal. Each entry is either a
// shorthand `email` or a `key: value` pair; spreads (`...x`) and computed keys
// (`[k]: …`) yield no statically-known field name and are skipped.
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

// --- Extract client fetch contracts ----------------------------------------
//
// Each descriptor: { path, method, json, fields, file, line }. `fields` is the
// array of inline body field names, or null when the body isn't an inline
// `JSON.stringify({ … })` literal (skipped from the field check).
const FETCH_CALL = /fetch\(\s*(["'`])(\/api\/[^"'`]+)\1\s*,\s*\{/g;

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function extractFetches(files) {
  const out = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf8"));
    const rel = file.slice(REPO_ROOT.length + 1);
    let m;
    while ((m = FETCH_CALL.exec(code)) !== null) {
      const path = m[2].split(/[?#]/)[0];
      const optsOpen = code.indexOf("{", m.index + m[0].length - 1);
      const opts = matchBracket(code, optsOpen, "{", "}");
      if (opts === null) continue;
      const lower = opts.toLowerCase();

      const methodMatch = opts.match(/\bmethod\s*:\s*["'`]([A-Za-z]+)["'`]/);
      const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";

      const json =
        lower.includes("content-type") && lower.includes("application/json");

      let fields = null;
      const bodyIdx = opts.search(/\bbody\s*:/);
      if (bodyIdx !== -1) {
        const stringifyIdx = opts.indexOf("JSON.stringify", bodyIdx);
        if (stringifyIdx !== -1) {
          const parenOpen = opts.indexOf("(", stringifyIdx);
          // Inline object body iff the first arg of JSON.stringify is `{ … }`.
          const afterParen = opts.slice(parenOpen + 1).match(/^\s*\{/);
          if (afterParen) {
            const objOpen = opts.indexOf("{", parenOpen);
            const objText = matchBracket(opts, objOpen, "{", "}");
            if (objText !== null) fields = objectFieldNames(objText);
          }
        }
      }

      out.push({ path, method, json, fields, file: rel, line: lineOf(code, m.index) });
    }
  }
  return out;
}

const FETCHES = extractFetches(
  FETCH_DIRS.flatMap((d) => collectSourceFiles(join(REPO_ROOT, d))),
);

// --- Route-handler introspection (text) ------------------------------------
const routeSrcCache = new Map();
function routeSource(route) {
  if (!routeSrcCache.has(route.file)) {
    routeSrcCache.set(route.file, stripComments(readFileSync(route.file, "utf8")));
  }
  return routeSrcCache.get(route.file);
}

function exportsMethod(route, method) {
  const src = routeSource(route);
  return (
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(src) ||
    new RegExp(`export\\s+const\\s+${method}\\b`).test(src)
  );
}

function readsField(route, field) {
  return new RegExp(`body\\.${field}\\b`).test(routeSource(route));
}

function parsesBody(route) {
  return /request\.json\s*\(/.test(routeSource(route));
}

function label(f) {
  return `${f.method} ${f.path} (${f.file}:${f.line})`;
}

// ---------------------------------------------------------------------------

test("the client fetch scan and /api route table parse to their anchors", () => {
  // Vacuous-scan guard: if the fetch scan or the route walk found nothing (or
  // missed the two known contracts), every ⊆ check below would pass for the
  // wrong reason.
  assert.ok(API_ROUTES.length > 0, "no /api route handlers discovered");
  assert.ok(FETCHES.length >= 2, `expected ≥2 client fetches, found ${FETCHES.length}`);
  const paths = new Set(FETCHES.map((f) => f.path));
  assert.ok(paths.has("/api/analyze"), "expected a fetch to /api/analyze");
  assert.ok(paths.has("/api/subscribe"), "expected a fetch to /api/subscribe");
  assert.ok(resolveRoute("/api/analyze"), "no route file for /api/analyze");
  assert.ok(resolveRoute("/api/subscribe"), "no route file for /api/subscribe");
});

test("every client /api fetch resolves to a real route handler", () => {
  const broken = FETCHES.filter((f) => !resolveRoute(f.path)).map(label).sort();
  assert.deepEqual(
    broken,
    [],
    `client fetch(es) pointing at no /api route handler (would 404):\n` +
      broken.map((s) => `  ${s}`).join("\n"),
  );
});

test("every client fetch's HTTP method is exported by its target route", () => {
  const bad = FETCHES.filter((f) => {
    const r = resolveRoute(f.path);
    return r && !exportsMethod(r, f.method);
  })
    .map(label)
    .sort();
  assert.deepEqual(
    bad,
    [],
    `client fetch(es) whose method the target route does not export (would 405):\n` +
      bad.map((s) => `  ${s}`).join("\n"),
  );
});

test("every inline body field the client sends is read by the target route", () => {
  const bad = [];
  for (const f of FETCHES) {
    if (f.fields === null) continue; // non-inline body: shape not statically known
    const r = resolveRoute(f.path);
    if (!r) continue; // resolution failure already reported above
    for (const field of f.fields) {
      if (!readsField(r, field)) {
        bad.push(`  ${label(f)} sends \`${field}\` — not read as \`body.${field}\` in ${r.file.slice(REPO_ROOT.length + 1)}`);
      }
    }
  }
  assert.deepEqual(
    bad,
    [],
    `client body field(s) the target route never reads (would silently drop / 400):\n` +
      bad.join("\n"),
  );
});

test("every JSON-content-type fetch targets a route that parses the body", () => {
  const bad = FETCHES.filter((f) => {
    if (!f.json) return false;
    const r = resolveRoute(f.path);
    return r && !parsesBody(r);
  })
    .map(label)
    .sort();
  assert.deepEqual(
    bad,
    [],
    `client declares application/json but the target route never calls request.json():\n` +
      bad.map((s) => `  ${s}`).join("\n"),
  );
});

test("the known request contracts are present and correct (anchors the surface)", () => {
  // Pins today's two contracts so the suite fails loudly if a future edit DROPS
  // a contract (rename/remove a field or the whole fetch), not only when a new
  // bad one is added.
  const want = [
    { path: "/api/analyze", method: "POST", fields: ["title"] },
    { path: "/api/subscribe", method: "POST", fields: ["email", "source"] },
  ];
  for (const w of want) {
    const f = FETCHES.find((x) => x.path === w.path && x.method === w.method);
    assert.ok(f, `expected a ${w.method} fetch to ${w.path}`);
    assert.ok(f.json, `${w.path} fetch should declare content-type application/json`);
    assert.ok(Array.isArray(f.fields), `${w.path} fetch should send an inline JSON body`);
    for (const field of w.fields) {
      assert.ok(
        f.fields.includes(field),
        `${w.path} fetch should send body field \`${field}\` (found: ${f.fields.join(", ")})`,
      );
    }
    const r = resolveRoute(w.path);
    assert.ok(r && exportsMethod(r, w.method), `${w.path} route should export ${w.method}`);
    for (const field of w.fields) {
      assert.ok(readsField(r, field), `${w.path} route should read body.${field}`);
    }
  }
});
