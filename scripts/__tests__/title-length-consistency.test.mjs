// Max-title-length consistency guard: the ONE 200-character input cap on the job
// title lives — independently hard-coded — in THREE hand-maintained sites, and
// nothing relates the three literals. This pins them equal.
//
// The three sites:
//   1. `app/api/analyze/route.ts` — `const MAX_TITLE_LENGTH = 200`, the server's
//      AUTHORITATIVE cap: a title longer than this is rejected with `400` ("`title`
//      must be 200 characters or fewer"). This is the real contract.
//   2. `app/page.tsx` — `const TITLE_MAX_LENGTH = 200`, spread onto the search
//      `<input maxLength={TITLE_MAX_LENGTH}>` so the browser stops the user typing
//      past the cap client-side (the affordance that keeps a too-long title from
//      ever being submitted).
//   3. `docs/architecture.md` — the request-flow "Validate" step documents the body
//      must be a non-empty `title` **≤ 200 chars**. This is the human-readable
//      contract other work is planned against.
//
// The load-bearing drift this pins, invisible to `next build` / `tsc --noEmit`
// (three unrelated literals, each valid on its own, in two `.ts` modules and one
// `.md` prose file):
//   (a) THE CLIENT-vs-SERVER SPLIT: raise the client `maxLength` above the server
//       cap (or lower the server cap below the client `maxLength`) and a user can
//       type a title the form happily accepts but the route then `400`-rejects as
//       "too long" — a dead-end with no client affordance explaining why. The
//       inverse (client cap below server) needlessly blocks input the server would
//       take. Only equal caps give a coherent UX.
//   (b) THE DOC-vs-CODE SPLIT: edit either code literal and leave the doc at 200
//       (or the reverse) and the documented "≤ 200 chars" contract lies — the next
//       leaf planned against the doc builds to the wrong bound.
//
// Also asserts the client const actually REACHES `maxLength=` — so a future edit
// can't neuter the client affordance (leaving the const equal but unused, which the
// equality check alone would not catch) and silently reopen (a).
//
// A single 200 anchor (EXPECTED_CAP) pins the current source of truth: a fully
// coordinated roll across all three surfaces is still a deliberate, test-visible
// edit here — same drop-detector role CANONICAL_YEAR plays in the L5.86 guard.
//
// Why a text guard: same D-080 wall as the L5.57–L5.94 arc — `route.ts` and
// `page.tsx` value-import `@/`-aliased modules and `next`/`@anthropic-ai` the bare
// `.mjs` node-test loader can't resolve and that aren't installed for the runner,
// and the doc is prose. So it reads all three as TEXT, strips comments from the
// `.ts` sources, and regex-extracts each literal. Pure Node built-ins, no npm
// install — identical on the routine laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical source-of-truth title cap. Named here as the drop-detector anchor:
// a coordinated roll across all three surfaces would keep the cross-surface
// agreement check green, so this literal forces the roll to be a deliberate edit here too.
const EXPECTED_CAP = 200;

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Strip `//` line comments and `/* */` block comments so a commented-out or
// documentation literal never satisfies (or breaks) an extractor. Good enough for
// these sources — no `//` or `/*` appears inside a string literal we scan.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// (1) `const MAX_TITLE_LENGTH = <n>` — the server's authoritative reject cap.
function serverCap(src) {
  const m = /const\s+MAX_TITLE_LENGTH\s*=\s*(\d+)\b/.exec(stripComments(src));
  return m ? Number(m[1]) : null;
}

// (2) `const TITLE_MAX_LENGTH = <n>` — the client const spread onto the input.
function clientCap(src) {
  const m = /const\s+TITLE_MAX_LENGTH\s*=\s*(\d+)\b/.exec(stripComments(src));
  return m ? Number(m[1]) : null;
}

// (3) `≤ <n> chars` from the architecture doc's Validate step.
function docCap(src) {
  const m = /≤\s*(\d+)\s*chars/.exec(src);
  return m ? Number(m[1]) : null;
}

const routeSrc = read("app/api/analyze/route.ts");
const pageSrc = read("app/page.tsx");
const docSrc = read("docs/architecture.md");

const server = serverCap(routeSrc);
const client = clientCap(pageSrc);
const doc = docCap(docSrc);

test("each title-cap surface yields a number (vacuous-scan guard)", () => {
  // If any extractor silently returned null, the equality check below would pass
  // for the wrong reason (null === null, or a lone survivor). Assert all three bit first.
  assert.ok(server !== null, "could not extract `const MAX_TITLE_LENGTH = <n>` from app/api/analyze/route.ts");
  assert.ok(client !== null, "could not extract `const TITLE_MAX_LENGTH = <n>` from app/page.tsx");
  assert.ok(doc !== null, "could not extract `≤ <n> chars` from docs/architecture.md's Validate step");
});

test("the client const is actually applied to the input's maxLength", () => {
  // The client cap only constrains input if the const reaches `maxLength=`. Pin that
  // wiring so a future edit can't leave the const equal-but-unused and silently drop
  // the client affordance while the equality check below still passes.
  assert.match(
    stripComments(pageSrc),
    /maxLength=\{\s*TITLE_MAX_LENGTH\s*\}/,
    "app/page.tsx must spread TITLE_MAX_LENGTH onto the title <input maxLength={…}> — the const alone caps nothing",
  );
});

test("the client cap equals the server cap (no dead-end too-long UX)", () => {
  // The load-bearing check: the browser must stop input at exactly the length the
  // server will accept. A client cap above the server's lets the user type a title
  // the route then 400-rejects with no affordance; a client cap below needlessly
  // blocks input the server would take.
  assert.equal(
    client,
    server,
    `client TITLE_MAX_LENGTH=${client} must equal server MAX_TITLE_LENGTH=${server}; a mismatch is ` +
      `either a too-long title the form accepts but the route 400-rejects, or input the client blocks needlessly`,
  );
});

test("the documented cap equals the code cap (doc doesn't lie)", () => {
  // The architecture doc's "≤ N chars" is the contract next leaves are planned
  // against; pin it to the server's authoritative cap.
  assert.equal(
    doc,
    server,
    `docs/architecture.md documents ≤ ${doc} chars but the server cap is ${server}; update the doc and code together`,
  );
});

test("all three surfaces resolve to ONE shared cap", () => {
  // Collapse to a single set: exactly one cap may span the server const, the client
  // const, and the documented figure.
  const all = new Set([server, client, doc]);
  assert.equal(
    all.size,
    1,
    `title cap is split across surfaces; found ${[...all].join(", ")} (server ${server}, client ${client}, doc ${doc})`,
  );
});

test("the shared cap is the canonical 200 (drop-detector anchor)", () => {
  // Pin the current source of truth literally so a fully-coordinated roll — which the
  // agreement checks alone would let through — is still a deliberate, test-visible edit here.
  assert.equal(server, EXPECTED_CAP, `server MAX_TITLE_LENGTH must be ${EXPECTED_CAP} (found ${server})`);
  assert.equal(client, EXPECTED_CAP, `client TITLE_MAX_LENGTH must be ${EXPECTED_CAP} (found ${client})`);
  assert.equal(doc, EXPECTED_CAP, `documented cap must be ${EXPECTED_CAP} (found ${doc})`);
});
