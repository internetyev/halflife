// Countdown-jitter magnitude consistency guard: the ONE ±5% perturbation the
// banded countdown applies lives — independently written — in FOUR hand-maintained
// spots across THREE files, and nothing relates the executable multiplier to the
// prose figure. This pins them equal.
//
// The banded countdown (`bandedCountdown` in `lib/scoring/index.ts`) interpolates a
// base year value inside a score band, then perturbs it by a deterministic slug-hash
// jitter so two roles with identical scores render slightly different countdowns. The
// SIZE of that perturbation is a product-visible promise ("stable per role, ±5%") and
// is stated in four places:
//   1. `lib/scoring/index.ts` — the EXECUTABLE formula
//        `const jitter = ((hashSlug(slug) % 1000) / 1000 - 0.5) * 0.1;`
//      The `(… - 0.5)` term centres the raw fraction on `[-0.5, +0.5)`, so the `* 0.1`
//      SPREAD multiplier yields a symmetric jitter of ±(0.1 / 2) = ±0.05 = ±5%. This is
//      the real behaviour; everything else is documentation of it.
//   2. `lib/scoring/index.ts` — the adjacent code COMMENTS `// ±5% jitter …` and the
//      range annotation `// [-0.05, +0.05)` that document (1) inline.
//   3. `docs/methodology.md` — the "From score to countdown" section: "perturbed by
//      ±5% using a hash of the slug". The human-readable methodology contract.
//   4. `prompts/role-analysis.md` — the post-processing note: "`bandedCountdown` is the
//      deterministic banded function … with ±5% slug-hash jitter". The model-facing copy.
//
// The load-bearing drift this pins, invisible to `next build` / `tsc --noEmit` (a bare
// numeric multiplier in one module vs. a "±N%" phrase in two prose files and one comment,
// each valid on its own):
//   (a) THE CODE-vs-DOC SPLIT: retune the executable spread (`* 0.1` → `* 0.2`, doubling
//       the jitter to ±10%) to make countdowns feel less deterministic, and the published
//       methodology + the prompt still promise ±5% — the documented spread now lies about
//       how much a role's countdown can move between renders.
//   (b) THE STALE-COMMENT SPLIT: change the multiplier but leave the `// ±5%` /
//       `// [-0.05, +0.05)` annotations, and the next reader trusts a comment the code no
//       longer honours (the classic drift the whole L5.56–L5.97 arc pins).
//   (c) THE TWO-DOCS SPLIT: edit one prose figure and miss the other, so methodology and
//       prompt disagree on the spread.
//
// This is a genuinely new surface: L5.56's `methodology-consistency` guard pins the
// DIMENSION_WEIGHTS table and the COUNTDOWN_BANDS score→years table between code and doc,
// but never reads the jitter multiplier — the ±5% spread APPLIED WITHIN a band was
// unguarded. This owns exactly that hop.
//
// The canonical spread is DERIVED from the code multiplier (not hard-coded per side): the
// executable `* 0.1` is the source of truth, halved to the ±percentage the prose states.
// A single EXPECTED_JITTER_PCT anchor pins the current value so a fully coordinated roll
// across all four spots is still a deliberate, test-visible edit here.
//
// Why a text guard: same D-080 wall as the L5.57–L5.97 arc — `lib/scoring/index.ts`
// value-imports `@/`-aliased `./types` the bare `.mjs` node-test loader can't resolve, and
// the other two sources are prose. So it reads all three as TEXT and regex-extracts the
// executable multiplier, the code-comment figures, and the two doc figures. Pure Node
// built-ins, no npm install — identical on the routine laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical source-of-truth jitter spread, as a ± percentage. Named here as the
// drop-detector anchor: a coordinated roll across all four spots would keep the
// cross-surface agreement checks green, so this literal forces the roll to be a
// deliberate edit here too.
const EXPECTED_JITTER_PCT = 5;

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Strip `//` line comments and `/* */` block comments so a commented-out or documentation
// figure never satisfies the EXECUTABLE-multiplier extractor. (The comment figures are
// scanned separately, below, from the raw source.)
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// (1) The executable jitter formula `(( … % 1000) / 1000 - CENTER) * SPREAD`. Captures
// both the centring constant and the spread multiplier so we can (a) confirm the jitter is
// symmetric (centred on 0.5 → the raw fraction spans [-0.5, +0.5)) and (b) derive the ±%.
function execJitter(src) {
  const m =
    /const\s+jitter\s*=\s*\(\(\s*hashSlug\([^)]*\)\s*%\s*1000\s*\)\s*\/\s*1000\s*-\s*(0?\.\d+)\s*\)\s*\*\s*(0?\.\d+)/.exec(
      stripComments(src),
    );
  if (!m) return null;
  return { center: Number(m[1]), spread: Number(m[2]) };
}

// Derive the ± percentage the executable formula actually produces. With the fraction
// centred on `center` its span is 1 unit wide, so `(x - center)` ranges over a full unit
// interval and `* spread` scales it to a `spread`-wide interval — half-width `spread / 2`.
function pctFromExec(exec) {
  return (exec.spread / 2) * 100;
}

// (2) The code COMMENT figures that document (1): the `± N%` phrase and the numeric range
// annotation `[-a, +b)`. Scanned from RAW source (they live in comments).
function commentPct(src) {
  const m = /±\s*(\d+(?:\.\d+)?)\s*%\s*jitter/.exec(src);
  return m ? Number(m[1]) : null;
}
function commentRange(src) {
  // `[-0.05, +0.05)` — the two magnitudes should be equal and === spread / 2.
  const m = /\[\s*-\s*(0?\.\d+)\s*,\s*\+?\s*(0?\.\d+)\s*\)/.exec(src);
  return m ? { lo: Number(m[1]), hi: Number(m[2]) } : null;
}

// (3)/(4) A `± N%` figure from a prose file (methodology / prompt). Both state it once, in
// a jitter/perturbation sentence; take the first `± N%`.
function prosePct(src) {
  const m = /±\s*(\d+(?:\.\d+)?)\s*%/.exec(src);
  return m ? Number(m[1]) : null;
}

const scoringSrc = read("lib/scoring/index.ts");
const methodologySrc = read("docs/methodology.md");
const promptSrc = read("prompts/role-analysis.md");

const exec = execJitter(scoringSrc);
const commentP = commentPct(scoringSrc);
const range = commentRange(scoringSrc);
const methodologyP = prosePct(methodologySrc);
const promptP = prosePct(promptSrc);

test("each jitter-magnitude surface yields a number (vacuous-scan guard)", () => {
  // If any extractor silently returned null, the equality checks below would pass for the
  // wrong reason (null === null, or a lone survivor). Assert all bit first.
  assert.ok(
    exec !== null,
    "could not extract the executable `const jitter = ((hashSlug(…) % 1000) / 1000 - <c>) * <spread>` formula from lib/scoring/index.ts",
  );
  assert.ok(commentP !== null, "could not extract the `± N% jitter` comment figure from lib/scoring/index.ts");
  assert.ok(range !== null, "could not extract the `[-a, +b)` range comment from lib/scoring/index.ts");
  assert.ok(methodologyP !== null, "could not extract a `± N%` figure from docs/methodology.md");
  assert.ok(promptP !== null, "could not extract a `± N%` figure from prompts/role-analysis.md");
});

test("the executable jitter is centred (symmetric ± spread)", () => {
  // The ±% derivation assumes the raw fraction is centred on 0.5 so `(x - 0.5)` spans
  // [-0.5, +0.5) and the jitter is symmetric. Pin the centring constant so a future edit
  // to an off-centre value (which would make the jitter one-sided) can't slip through while
  // the pctFromExec math keeps reporting a symmetric ±.
  assert.equal(
    exec.center,
    0.5,
    `jitter must be centred on 0.5 for the ± derivation to hold; found (x - ${exec.center}) * ${exec.spread}`,
  );
});

test("the code comment figures match the executable multiplier (no stale comment)", () => {
  // The adjacent `// ±5%` and `// [-0.05, +0.05)` annotations document the formula; pin
  // them to what it actually computes so a multiplier change can't leave a lying comment.
  const derived = pctFromExec(exec);
  assert.equal(
    commentP,
    derived,
    `the \`// ±${commentP}% jitter\` comment must match the executable spread (± ${derived}% from * ${exec.spread})`,
  );
  const half = exec.spread / 2;
  assert.equal(range.lo, half, `the range comment's lower magnitude ${range.lo} must equal spread/2 = ${half}`);
  assert.equal(range.hi, half, `the range comment's upper magnitude ${range.hi} must equal spread/2 = ${half}`);
});

test("the documented methodology spread matches the executable jitter (code doesn't lie)", () => {
  // The load-bearing check: docs/methodology.md promises the reader a ±% spread; it must
  // equal what the code actually applies. A drift here means the published methodology
  // misstates how much a role's countdown can move between renders.
  const derived = pctFromExec(exec);
  assert.equal(
    methodologyP,
    derived,
    `docs/methodology.md states ±${methodologyP}% but the executable jitter is ±${derived}% (from * ${exec.spread}); update code and doc together`,
  );
});

test("the two prose figures agree (methodology and prompt)", () => {
  // methodology.md and role-analysis.md independently state the spread; a one-sided edit
  // leaves them disagreeing about the same behaviour.
  assert.equal(
    promptP,
    methodologyP,
    `prompts/role-analysis.md states ±${promptP}% but docs/methodology.md states ±${methodologyP}%`,
  );
});

test("the shared spread is the canonical ±5% (drop-detector anchor)", () => {
  // Pin the current source of truth literally so a fully coordinated roll — which the
  // agreement checks alone would let through — is still a deliberate, test-visible edit here.
  const derived = pctFromExec(exec);
  assert.equal(derived, EXPECTED_JITTER_PCT, `executable jitter must be ±${EXPECTED_JITTER_PCT}% (found ±${derived}%)`);
  assert.equal(commentP, EXPECTED_JITTER_PCT, `code comment must state ±${EXPECTED_JITTER_PCT}% (found ±${commentP}%)`);
  assert.equal(methodologyP, EXPECTED_JITTER_PCT, `methodology must state ±${EXPECTED_JITTER_PCT}% (found ±${methodologyP}%)`);
  assert.equal(promptP, EXPECTED_JITTER_PCT, `prompt must state ±${EXPECTED_JITTER_PCT}% (found ±${promptP}%)`);
});
