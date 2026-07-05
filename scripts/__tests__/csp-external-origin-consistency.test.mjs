// CSP external-origin consistency guard: the ONE third-party origin the app
// actually loads must be allowlisted in the Content-Security-Policy, in both the
// directives that gate it, and nothing stale may linger in either.
//
// halflife loads exactly one external resource: the Plausible analytics tag,
// pulled by `components/plausible-analytics.tsx`:
//
//     <Script ... src="https://plausible.io/js/script.tagged-events.js" />
//
// and that same script POSTs its pageview/custom-event beacons back to
// `https://plausible.io/api/event`. For the browser to permit BOTH halves, the
// L5.7 Content-Security-Policy in `next.config.ts` must allowlist the origin in
// TWO directives — `script-src` (to fetch+run the tag) and `connect-src` (to
// send the beacons). The config today does exactly that, and the component's own
// header comment leans on it: "The L5.7 Content-Security-Policy already
// allowlists `https://plausible.io` (script-src + connect-src), so the filename
// swap stays inside the existing allowlist with zero next.config.ts churn." That
// prose promise is the contract this guard makes executable.
//
// The drift this pins is a silent production-only analytics break, invisible to
// `next build` / `tsc --noEmit` (each file holds an independently-valid string):
//
//   (a) Self-host / re-point Plausible. The `<Script src>` host is changed to a
//       self-hosted origin (`https://analytics.halflife.work`) or Plausible moves
//       its CDN, but the CSP is not updated in lockstep. The build stays green.
//       The CSP is Report-Only TODAY so nothing breaks yet — but the deferred
//       nonce-CSP leaf (D-037) flips it to ENFORCE, and then the tag is silently
//       blocked: zero analytics, no error, launch-day telemetry gone.
//   (b) Update only ONE directive. The origin is refreshed in `script-src` but
//       not `connect-src` (or vice-versa). The tag loads but its beacons are
//       blocked (or would be, on enforce) — pageviews vanish while the script
//       appears healthy. The two directives must move together; the component
//       comment names both by hand.
//   (c) Stale allowlist entry. An external origin is removed from the app (a
//       third-party script dropped) but left in the CSP, needlessly widening the
//       policy — a CSP is only as tight as its narrowest necessary allowlist, so
//       a lingering origin is a security smell the build never flags.
//
// The invariant, symmetric so it self-maintains as origins are added/removed:
//   • the external script origin(s) the app LOADS  ==  CSP `script-src` externals
//   • CSP `script-src` externals  ==  CSP `connect-src` externals
//   • that shared set is exactly { https://plausible.io } (canonical anchor /
//     drop-detector, so a wholesale deletion fails too, not just a drift)
//
// A genuinely new surface. No prior guard reads `next.config.ts` at all, nor the
// `<Script src>` host: L5.82's plausible-goal-consistency pins the custom-EVENT
// NAMES (`form-submit`/`share-click`) across the helper + call sites + docs, never
// the transport origin or the CSP; L5.7's headers ship untested for origin
// coherence. This is a code↔code correctness invariant (loaded ⟺ allowlisted),
// the class of L5.63's cache-key and L5.78's route-runtime guards, not the
// doc-prose drift of the L5.57–L5.77 arc.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.86 —
// `plausible-analytics.tsx` imports `next/script` and `next.config.ts` value-
// imports the `NextConfig` type, neither resolvable by the bare `.mjs` loader —
// so this reads both sources as TEXT and compares extracted origin literals.
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

const CONFIG_FILE = "next.config.ts";
const CANONICAL_ORIGIN = "https://plausible.io";

// Directories scanned for `<Script|script src="https://...">` — the App Router
// surfaces + shared components, the only places that emit a script element.
const MARKUP_DIRS = ["app", "components"];

// Normalise a raw URL token to its bare origin (scheme + host[:port]); returns
// null for anything that is not a parseable absolute URL.
function toOrigin(token) {
  try {
    return new URL(token).origin;
  } catch {
    return null;
  }
}

// Walk a directory tree, returning every `.ts`/`.tsx` file path (relative to repo
// root). Skips the test tree itself and any `__pycache__`.
function walkSources(relDir) {
  const out = [];
  const abs = join(REPO_ROOT, relDir);
  for (const entry of readdirSync(abs)) {
    if (entry === "__tests__" || entry === "__pycache__") continue;
    const relPath = join(relDir, entry);
    const st = statSync(join(REPO_ROOT, relPath));
    if (st.isDirectory()) {
      out.push(...walkSources(relPath));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(relPath);
    }
  }
  return out;
}

// The set of EXTERNAL origins the app loads via a SCRIPT element — the resources
// CSP `script-src` (and, for the beacon, `connect-src`) actually gate. Matches
// only `<Script|script ... src="https://...">` (quoted or `{"..."}`); a navigational
// `<a href>` (governed by other directives) or a relative ref never matches, so
// documentation/anchor links (github.com, useplunk.com) are correctly excluded.
// Returns a Set of origins.
function loadedExternalOrigins() {
  const origins = new Set();
  const attrRe =
    /<[Ss]cript\b[^>]*?\bsrc\s*=\s*\{?\s*["'`](https?:\/\/[^"'`\s]+)["'`]/g;
  for (const dir of MARKUP_DIRS) {
    for (const file of walkSources(dir)) {
      const src = read(file);
      for (const m of src.matchAll(attrRe)) {
        const origin = toOrigin(m[1]);
        if (origin) origins.add(origin);
      }
    }
  }
  return origins;
}

// Parse `next.config.ts`'s CSP into a map: directive-name -> Set<external origin>.
// The policy is authored as an array of directive string literals joined with
// "; " (`CONTENT_SECURITY_POLICY_REPORT_ONLY = [ "script-src ...", ... ]`). We
// slice that array, pull each quoted directive, and collect its http(s) origins.
function cspDirectives() {
  const src = read(CONFIG_FILE);
  const start = src.indexOf("CONTENT_SECURITY_POLICY_REPORT_ONLY");
  assert.ok(
    start !== -1,
    `could not find the \`CONTENT_SECURITY_POLICY_REPORT_ONLY\` array in ${CONFIG_FILE} — ` +
      "renamed or reshaped? this guard slices that array to read the CSP directives; update it here.",
  );
  const open = src.indexOf("[", start);
  const close = src.indexOf("]", open);
  assert.ok(
    open !== -1 && close !== -1 && close > open,
    `could not delimit the CSP array literal in ${CONFIG_FILE}`,
  );
  const body = src.slice(open + 1, close);

  const directives = new Map();
  // Each directive is a DOUBLE-quoted literal; match only `"..."` because the
  // directives embed CSP single-quote keywords (`'self'`, `'unsafe-inline'`) that
  // a `['"]`-class regex would wrongly treat as string delimiters and fragment on.
  for (const m of body.matchAll(/"([^"]+)"/g)) {
    const directive = m[1].trim();
    const tokens = directive.split(/\s+/);
    const name = tokens[0];
    if (!name) continue;
    const origins = new Set();
    for (const t of tokens.slice(1)) {
      if (/^https?:\/\//.test(t)) {
        const origin = toOrigin(t);
        if (origin) origins.add(origin);
      }
    }
    directives.set(name, origins);
  }
  return directives;
}

function sorted(set) {
  return [...set].sort();
}

const loaded = loadedExternalOrigins();
const csp = cspDirectives();
const scriptSrc = csp.get("script-src") ?? new Set();
const connectSrc = csp.get("connect-src") ?? new Set();

test("the app loads exactly one external origin and it parses (vacuous-scan guard)", () => {
  // If the `<Script src>` scan silently matched nothing (a rename of the loader,
  // a regex drift), every set comparison below would collapse to empty===empty
  // and pass vacuously. Anchor the scan to the known-present analytics origin.
  assert.ok(
    loaded.size >= 1,
    `scanned ${MARKUP_DIRS.join("/")} for external \`src\`/\`href\` origins and found NONE — ` +
      "the resource-attribute scan regex or the analytics loader was reshaped; update this guard.",
  );
  assert.ok(
    loaded.has(CANONICAL_ORIGIN),
    `expected the app to load ${CANONICAL_ORIGIN} (the Plausible tag) but scanned origins are ` +
      `${JSON.stringify(sorted(loaded))} — the analytics <Script src> host changed; update this guard.`,
  );
});

test("the CSP defines both script-src and connect-src with origins (vacuous-parse guard)", () => {
  // Guard the CSP parse itself: an array-slice or regex drift that dropped a
  // directive must fail loudly here, not shrink the checks below to no-ops.
  assert.ok(
    csp.has("script-src"),
    `no \`script-src\` directive parsed from ${CONFIG_FILE}'s CSP — parse drift or the directive was removed.`,
  );
  assert.ok(
    csp.has("connect-src"),
    `no \`connect-src\` directive parsed from ${CONFIG_FILE}'s CSP — parse drift or the directive was removed.`,
  );
  assert.ok(
    scriptSrc.size >= 1 && connectSrc.size >= 1,
    `expected script-src and connect-src to each allowlist ≥1 external origin, got ` +
      `script-src=${JSON.stringify(sorted(scriptSrc))} connect-src=${JSON.stringify(sorted(connectSrc))}.`,
  );
});

test("every external origin the app LOADS is allowlisted in CSP script-src", () => {
  // The load-bearing half of (a): a script host not in `script-src` is fetched
  // fine while the CSP is Report-Only, then silently blocked the moment the
  // deferred nonce-CSP leaf flips it to enforce.
  const missing = sorted(loaded).filter((o) => !scriptSrc.has(o));
  assert.deepEqual(
    missing,
    [],
    `these loaded origins are NOT in CSP script-src (${JSON.stringify(sorted(scriptSrc))}): ` +
      `${JSON.stringify(missing)}. A loaded <Script src> host must be allowlisted in ${CONFIG_FILE} ` +
      "or it is blocked once the CSP is enforced — update them together.",
  );
});

test("every external origin the app LOADS is allowlisted in CSP connect-src", () => {
  // Half (b): the Plausible tag beacons its events to the SAME origin
  // (`/api/event`), so the origin must also sit in `connect-src` or the pageview
  // fires-and-drops. The component comment names script-src AND connect-src.
  const missing = sorted(loaded).filter((o) => !connectSrc.has(o));
  assert.deepEqual(
    missing,
    [],
    `these loaded origins are NOT in CSP connect-src (${JSON.stringify(sorted(connectSrc))}): ` +
      `${JSON.stringify(missing)}. The analytics beacon endpoint is same-origin as its script; ` +
      "both directives must allowlist it.",
  );
});

test("CSP script-src and connect-src allowlist the SAME external origin set", () => {
  // Pins (b) from the CSP side: updating one directive but not the other (add a
  // new origin to script-src, forget connect-src) leaves the two out of step.
  // They move together by design in this app (one third-party, gated by both).
  assert.deepEqual(
    sorted(scriptSrc),
    sorted(connectSrc),
    `CSP script-src externals ${JSON.stringify(sorted(scriptSrc))} != connect-src externals ` +
      `${JSON.stringify(sorted(connectSrc))}. The two directives must allowlist the same third-party ` +
      "set — a script that loads but can't beacon (or vice-versa) is a half-broken integration.",
  );
});

test("the CSP allowlist has no stale origin — it is EXACTLY what the app loads", () => {
  // Reverse direction (c): an origin left in the CSP after its script was removed
  // needlessly widens the policy. script-src === loaded (both ways) means adding
  // a script + its CSP entry both pass, but a CSP entry with no loader fails.
  assert.deepEqual(
    sorted(scriptSrc),
    sorted(loaded),
    `CSP script-src externals ${JSON.stringify(sorted(scriptSrc))} != the origins the app loads ` +
      `${JSON.stringify(sorted(loaded))}. Every allowlisted external must correspond to a loaded ` +
      "resource (and vice-versa) — a stale entry widens the policy, a missing one blocks a load.",
  );
});

test("the single external origin is exactly https://plausible.io (canonical anchor)", () => {
  // Drop-detector: without a pinned expected value the set-equality checks above
  // all pass on an empty===empty collapse if the analytics integration is torn
  // out wholesale. Anchor both the loaded set and both CSP directives to it.
  assert.deepEqual(
    sorted(loaded),
    [CANONICAL_ORIGIN],
    `expected the app to load exactly [${CANONICAL_ORIGIN}], got ${JSON.stringify(sorted(loaded))}. ` +
      "If a third-party origin was intentionally added/removed, update this anchor AND the CSP together.",
  );
  assert.deepEqual(
    sorted(scriptSrc),
    [CANONICAL_ORIGIN],
    `CSP script-src externals should be exactly [${CANONICAL_ORIGIN}], got ${JSON.stringify(sorted(scriptSrc))}.`,
  );
  assert.deepEqual(
    sorted(connectSrc),
    [CANONICAL_ORIGIN],
    `CSP connect-src externals should be exactly [${CANONICAL_ORIGIN}], got ${JSON.stringify(sorted(connectSrc))}.`,
  );
});
