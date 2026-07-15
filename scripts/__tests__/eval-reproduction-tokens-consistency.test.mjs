// Eval-reproduction token-budget consistency guard: the `max_tokens` the
// production role-analysis call sends must equal the `max tokens` figure the
// L1.5b eval-reproduction procedure tells a human to set in the Anthropic
// workbench. If they drift, the eval reproduces a DIFFERENT call than
// production and its baseline no longer predicts shipped behaviour.
//
// The two sites:
//   1. `lib/anthropic/role-analysis.ts` — `const MAX_TOKENS = 2048`, wired into
//      the real `client.messages.create({ … max_tokens: MAX_TOKENS … })` forced
//      tool-use call in `analyzeRole`. This is the token budget production spends.
//   2. `evals/README.md` — Path A step 1 of the L1.5b procedure: "Pick
//      `claude-sonnet-4-6` as the model, temperature `0`, max tokens 2048." This
//      is the figure a human types into the Console workbench to reproduce the
//      call and fill `role-analysis-baseline.csv`.
//
// The load-bearing drift this pins, invisible to `next build` / `tsc --noEmit`
// (a bare integer in a `.ts` module vs. a prose figure in a `.md` file, each
// valid on its own):
//   - Retune `MAX_TOKENS` (2048 → 4096 to give the model more room, or → 1024 to
//     trim cost) and the eval README still tells the human "max tokens 2048". The
//     baseline is then generated at a token ceiling production no longer uses — a
//     role whose tool call would truncate at 1024 in production looks complete in
//     an eval run at 2048, so a real regression passes the eval. The eval's whole
//     job (predict production) silently breaks with no build or type error.
//
// Why NOT the L5.x model-id guard (model-id-consistency): it pins the MODEL id
// (`claude-sonnet-4-6`) across the source + this same README line, but reads only
// the model string — the `max tokens` figure two words later on the very same
// line was unguarded. This owns exactly that token-budget hop.
//
// NOTE on temperature: the same README line also pins `temperature 0`. When this
// guard shipped, production set no explicit `temperature` and fell back to the SDK
// default (1.0), so eval and prod disagreed — flagged in D-129 and left unasserted
// here. L5.100 / D-130 resolved it: production now sends `temperature: TEMPERATURE`
// (0), and `eval-reproduction-temperature-consistency.test.mjs` owns that hop. This
// file stays scoped to the token budget.
//
// A single 2048 anchor (EXPECTED_MAX_TOKENS) pins the current source of truth so a
// coordinated roll across both surfaces is still a deliberate, test-visible edit
// here — the same drop-detector role EXPECTED_CAP plays in the L5.95 title guard.
//
// Why a text guard: same D-080 wall as the L5.57–L5.98 arc — `role-analysis.ts`
// value-imports the `@/`-aliased `RoleAnalysisToolInput` and the `@anthropic-ai`
// SDK the bare `.mjs` node-test loader can't resolve and that aren't installed for
// the runner, and the README is prose. So it reads both as TEXT, strips comments
// from the `.ts` source, and regex-extracts each figure. Pure Node built-ins, no
// npm install — identical on the routine laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical source-of-truth token budget. Named here as the drop-detector
// anchor: a coordinated roll across both surfaces would keep the cross-surface
// agreement check green, so this literal forces the roll to be a deliberate edit here too.
const EXPECTED_MAX_TOKENS = 2048;

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Strip `//` line comments and `/* */` block comments so a commented-out or
// documentation literal never satisfies (or breaks) an extractor. Good enough for
// this source — no `//` or `/*` appears inside a string literal we scan.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// (1) `const MAX_TOKENS = <n>` — the production call's token budget.
function codeMaxTokens(src) {
  const m = /const\s+MAX_TOKENS\s*=\s*(\d+)\b/.exec(stripComments(src));
  return m ? Number(m[1]) : null;
}

// (2) `max tokens <n>` from the eval README's Path A step 1.
function docMaxTokens(src) {
  const m = /max\s*tokens?\s*`?(\d+)`?/i.exec(src);
  return m ? Number(m[1]) : null;
}

const sourceSrc = read("lib/anthropic/role-analysis.ts");
const readmeSrc = read("evals/README.md");

const code = codeMaxTokens(sourceSrc);
const doc = docMaxTokens(readmeSrc);

test("each max-tokens surface yields a number (vacuous-scan guard)", () => {
  // If either extractor silently returned null, the equality check below would pass
  // for the wrong reason (null === null). Assert both bit first.
  assert.ok(code !== null, "could not extract `const MAX_TOKENS = <n>` from lib/anthropic/role-analysis.ts");
  assert.ok(doc !== null, "could not extract `max tokens <n>` from evals/README.md's Path A step 1");
});

test("the MAX_TOKENS const is actually wired into the messages.create call", () => {
  // The const only bounds the API call if it reaches `max_tokens:` in the create
  // payload. Pin that wiring so a future edit can't leave the const equal-but-unused
  // (e.g. inline a literal, or drop the field) while the equality check below still passes.
  assert.match(
    stripComments(sourceSrc),
    /max_tokens\s*:\s*MAX_TOKENS\b/,
    "lib/anthropic/role-analysis.ts must pass `max_tokens: MAX_TOKENS` into client.messages.create — the const alone caps nothing",
  );
});

test("the eval README token budget equals the production call's (eval reproduces prod)", () => {
  // The load-bearing check: the human running the L1.5b eval must set the same token
  // ceiling production spends, or the baseline is generated against a call production
  // does not make and stops predicting shipped behaviour.
  assert.equal(
    doc,
    code,
    `evals/README.md says "max tokens ${doc}" but the production call sends max_tokens=${code}; ` +
      `the eval would reproduce a different call than production — update both together`,
  );
});

test("both surfaces resolve to ONE shared token budget", () => {
  // Collapse to a single set: exactly one value may span the code const and the
  // documented figure.
  const all = new Set([code, doc]);
  assert.equal(
    all.size,
    1,
    `max_tokens is split across surfaces; found ${[...all].join(", ")} (code ${code}, doc ${doc})`,
  );
});

test("the shared token budget is the canonical 2048 (drop-detector anchor)", () => {
  // Pin the current source of truth literally so a fully-coordinated roll — which the
  // agreement check alone would let through — is still a deliberate, test-visible edit here.
  assert.equal(code, EXPECTED_MAX_TOKENS, `code MAX_TOKENS must be ${EXPECTED_MAX_TOKENS} (found ${code})`);
  assert.equal(doc, EXPECTED_MAX_TOKENS, `documented max tokens must be ${EXPECTED_MAX_TOKENS} (found ${doc})`);
});
