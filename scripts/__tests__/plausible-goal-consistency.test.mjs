// Plausible custom-event goal consistency guard: the custom-event goals fired
// in code via `trackEvent(...)` must be a 1:1 mirror of the goals the human
// pre-flight `docs/launch-checklist.md` §2 tells the operator to register on
// the Plausible site — same goal NAMES, and same per-goal prop KEYS.
//
// halflife wires exactly two Plausible custom-event goals (L5.25): `form-submit`
// (`app/page.tsx`, after a successful `/api/analyze`, with a `cache` prop) and
// `share-click` (`components/share-buttons.tsx`, per channel, with `channel` +
// `slug` props). The single source of truth on the JS side is
// `lib/analytics/plausible.ts`'s `trackEvent(event, props?)`; its header states
// the contract this guard enforces verbatim — "`docs/launch-checklist.md` §2's
// 'register the goal in Plausible' step stays a 1:1 mirror of
// `git grep \"trackEvent(\"`". Until now nothing pinned the two together.
//
// The drift it pins is a silent analytics no-show, invisible to every build step
// AND to every existing guard, because no guard reads the event STRINGS handed to
// `trackEvent` against the doc that lists the goals to create:
//   (a) a new goal is added in code (`trackEvent("cta-click", …)`) but the
//       operator is never told to register it in §2 — `next build`/`tsc --noEmit`
//       stay green (a string literal is always valid), the event fires into
//       Plausible, but with no matching goal it never surfaces as a named
//       conversion on the dashboard: the metric silently doesn't exist.
//   (b) a goal is renamed in §2 (or in code) on one side only — the dashboard
//       goal and the fired event name diverge, so the goal reads zero forever.
//   (c) a goal's props drift: code starts passing a `variant` prop the doc never
//       names (so the dashboard can't break the goal down by it), or §2 documents
//       a `channel` prop the code stopped sending — the dashboard split the
//       operator was told to expect is empty.
//
// Why a NEW surface, not an existing brand/metadata guard: the L5.57–L5.81 arc
// pins metadata/manifest/json-ld/OG-card/palette/route surfaces; none of them
// reads `trackEvent(...)` call strings or the §2 goal list. This guard owns
// exactly that last hop — fired event NAMES + PROP KEYS ⇄ the goals §2 says to
// register.
//
// Fully extractive (no hard-coded goal list): goals + their prop keys come from
// §2's `` `name` (fired by … `key`/`key: …` …) `` prose; event names + prop keys
// come from the `trackEvent("name", { … })` call sites. A reword/rename on either
// side breaks parity.
//
// Why a text guard: same D-080 wall as the L5.57–L5.81 arc — the call sites
// (`app/page.tsx`, `components/share-buttons.tsx`) import `next` and `@/`-aliased
// modules the bare `.mjs` loader can't resolve and that aren't installed for the
// runner, and the checklist is Markdown — so it reads each source as TEXT,
// paren-matches each `trackEvent(...)` call and each §2 goal parenthetical, and
// extracts the event name + object-literal prop keys / the doc's backtick prop
// tokens. Pure Node built-ins, no npm install — identical on the routine laptop
// and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECKLIST_FILE = "docs/launch-checklist.md";
// Files that may fire a custom-event goal. Kept narrow on purpose — the goals
// are UI events; a new firing surface is itself worth a deliberate edit here.
const CODE_FILES = ["app/page.tsx", "components/share-buttons.tsx"];

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Walk from an opening bracket at `openIdx` to its matching close, returning the
// inner slice (exclusive of the brackets). String literals are skipped so a
// bracket inside a string can't unbalance the count.
function matchedSlice(src, openIdx, open, close) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return null;
}

// Pull the object-literal prop KEYS from a `trackEvent` argument list slice like
// `"form-submit", { cache }` or `"share-click", { channel: "x", slug: props.slug }`.
// Returns { name, props } with props a sorted unique key array (empty if no obj).
function parseTrackEventArgs(argSlice) {
  const nameMatch = /^\s*["'`]([^"'`]+)["'`]/.exec(argSlice);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  const braceIdx = argSlice.indexOf("{");
  if (braceIdx === -1) return { name, props: [] };
  const objInner = matchedSlice(argSlice, braceIdx, "{", "}");
  if (objInner === null) return { name, props: [] };
  // A key is an identifier that starts the object or follows a top-level comma,
  // up to its `:` (long form) or the next `}`/`,` (shorthand). The `[{,]`-anchor
  // means a value identifier (`props.slug` after `slug:`) is never captured.
  const props = new Set();
  const keyRe = /[{,]\s*([A-Za-z_$][\w$]*)\s*[:},]/g;
  // Re-wrap so the first key (no leading comma) is anchored by a synthetic `{`.
  const wrapped = `{${objInner},`;
  let m;
  while ((m = keyRe.exec(wrapped)) !== null) {
    props.add(m[1]);
    keyRe.lastIndex--; // allow `,k1,k2` style overlap on the shared comma
  }
  return { name, props: [...props].sort() };
}

// Every `trackEvent(...)` call across CODE_FILES → map name → { props, files }.
function codeGoals() {
  const out = new Map();
  for (const file of CODE_FILES) {
    const src = read(file);
    const callRe = /\btrackEvent\s*\(/g;
    let m;
    while ((m = callRe.exec(src)) !== null) {
      const parenIdx = src.indexOf("(", m.index);
      const argSlice = matchedSlice(src, parenIdx, "(", ")");
      if (argSlice === null) continue;
      const parsed = parseTrackEventArgs(argSlice);
      if (!parsed) continue;
      const prev = out.get(parsed.name) ?? { props: new Set(), files: new Set() };
      parsed.props.forEach((p) => prev.props.add(p));
      prev.files.add(file);
      out.set(parsed.name, prev);
    }
  }
  return out;
}

// Slice §2 of the launch checklist: from its `## 2.` heading to the next `## `.
function section2() {
  const src = read(CHECKLIST_FILE);
  const start = src.search(/^##\s+2\./m);
  assert.ok(start > -1, `could not find a "## 2." heading in ${CHECKLIST_FILE}`);
  const rest = src.slice(start + 3);
  const nextHeading = rest.search(/^##\s/m);
  return nextHeading > -1 ? rest.slice(0, nextHeading) : rest;
}

// A backtick code-span counts as a PROP token only if its content is a bare
// lower-kebab identifier (`slug`) or `identifier: …` (`cache: HIT|MISS`). This
// excludes file paths / URLs / filenames (they contain `.` or `/`) and env-var
// names (uppercase), so only true prop keys survive.
function docPropToken(spanContent) {
  const m = /^([a-z][a-z-]*)(?::.*)?$/.exec(spanContent.trim());
  return m ? m[1] : null;
}

// Parse §2's "register … custom-event goals: `name` (fired by … `prop` …)"
// prose → map goal name → sorted unique prop-key array.
function docGoals() {
  const sec = section2();
  const out = new Map();
  // Each goal is a backtick name immediately followed by " (fired by".
  const goalRe = /`([a-z][a-z-]*)`\s*\(fired by/g;
  let m;
  while ((m = goalRe.exec(sec)) !== null) {
    const name = m[1];
    const parenIdx = sec.indexOf("(", m.index);
    const inner = matchedSlice(sec, parenIdx, "(", ")");
    if (inner === null) continue;
    const props = new Set();
    const spanRe = /`([^`]+)`/g;
    let s;
    while ((s = spanRe.exec(inner)) !== null) {
      const tok = docPropToken(s[1]);
      if (tok) props.add(tok);
    }
    out.set(name, [...props].sort());
  }
  return out;
}

const code = codeGoals();
const doc = docGoals();
// Known-core anchor: the two goals L5.25 shipped. A drop on either side must fail
// even if some future goal is added, so the equality checks can't pass vacuously
// against an empty set.
const CORE_GOALS = ["form-submit", "share-click"];

test("both surfaces parse to non-empty goal sets with the known-core anchors (vacuous-parse guard)", () => {
  // If either extraction silently returned nothing, the set-equality below would
  // pass for the wrong reason. Anchor presence + non-emptiness first.
  assert.ok(code.size > 0, "no trackEvent(...) calls parsed from the code surface");
  assert.ok(doc.size > 0, `no custom-event goals parsed from ${CHECKLIST_FILE} §2`);
  for (const g of CORE_GOALS) {
    assert.ok(code.has(g), `code surface is missing the known-core goal "${g}"`);
    assert.ok(doc.has(g), `${CHECKLIST_FILE} §2 is missing the known-core goal "${g}"`);
  }
});

test("the goals fired in code are a 1:1 mirror of the goals §2 says to register", () => {
  // The load-bearing check: a goal added in code without a §2 entry fires into
  // Plausible with no named goal (silent metric), and a §2 goal with no code
  // firing reads zero forever.
  const codeNames = [...code.keys()].sort();
  const docNames = [...doc.keys()].sort();
  assert.deepEqual(
    codeNames,
    docNames,
    `trackEvent(...) goal names ${JSON.stringify(codeNames)} must exactly match the ` +
      `custom-event goals named in ${CHECKLIST_FILE} §2 ${JSON.stringify(docNames)}.`,
  );
});

test("each shared goal's prop keys match between code and §2", () => {
  // A prop the code sends but §2 never names = a dashboard breakdown the operator
  // wasn't told to expect; a §2-named prop the code stopped sending = an empty
  // split. Compare per goal.
  for (const name of code.keys()) {
    if (!doc.has(name)) continue; // name mismatch already failed the test above
    const codeProps = [...code.get(name).props].sort();
    const docProps = doc.get(name);
    assert.deepEqual(
      codeProps,
      docProps,
      `goal "${name}": code prop keys ${JSON.stringify(codeProps)} must match the prop ` +
        `keys named for it in ${CHECKLIST_FILE} §2 ${JSON.stringify(docProps)}.`,
    );
  }
});

test("the known-core goals carry their expected prop keys (drop-detector anchor)", () => {
  // Pins the L5.25 contract literally so a rename of `cache`/`channel`/`slug` on
  // BOTH sides at once (which the mirror check would let through) still fails here.
  assert.deepEqual([...code.get("form-submit").props].sort(), ["cache"], "form-submit must carry exactly a `cache` prop");
  assert.deepEqual(
    [...code.get("share-click").props].sort(),
    ["channel", "slug"],
    "share-click must carry exactly `channel` + `slug` props",
  );
});

test("the trackEvent scan is substantive and cross-file (anti-vacuous)", () => {
  // Guards against a regex that collapsed every call to one synthetic match: real
  // goals come from ≥2 distinct files and at least one goal carries ≥1 prop.
  assert.ok(code.size >= 2, `expected ≥2 distinct goals fired in code, found ${code.size}`);
  const allFiles = new Set();
  let withProps = 0;
  for (const { props, files } of code.values()) {
    files.forEach((f) => allFiles.add(f));
    if (props.size > 0) withProps++;
  }
  assert.ok(allFiles.size >= 2, `expected goals fired from ≥2 files, saw ${allFiles.size}`);
  assert.ok(withProps >= 1, "expected at least one goal to carry a prop key");
});
