// Anthropic model-id consistency guard: the one Claude model this app calls —
// currently `claude-sonnet-4-6` — must be named identically everywhere a LIVE
// document restates it, both as the wire model id and as the human-readable
// "Claude Sonnet 4.6" phrase, all derived from the single source-of-truth const.
//
// The model is pinned in ONE authoritative place: `const MODEL = "claude-sonnet-4-6"`
// in `lib/anthropic/role-analysis.ts` (D-012/D-016 — the id is a hardcoded const, not
// read from env, precisely so a bump is a deliberate, reviewed code change that moves
// the prompt-cache key and the eval baseline together). But the model is ALSO restated,
// by hand, as prose in every doc that describes the stack or the seed/eval procedure:
//
//   - `lib/anthropic/role-analysis.ts`  — its own header comment "Sonnet 4.6 — pinned…"
//   - `README.md`                       — Stack line: "Claude Sonnet 4.6"
//   - `PLAN.md`                         — Stack line: "Claude Sonnet 4.6 for analysis"
//   - `evals/README.md`                 — the workbench procedure ("Pick `claude-sonnet-4-6`",
//                                         "access to Claude Sonnet 4.6", "at Sonnet 4.6 pricing")
//   - `data/roles/README.md`            — the L3.2b seed run ("`claude-sonnet-4-6`")
//
// Nothing pinned these copies to the const until now. The drift it pins is a silent
// stale-model claim, invisible to `next build`/`tsc --noEmit` (docs are prose; the
// in-file mention is a comment — none is a compiled reference):
//   (a) THE BUMP-SKEW: the human bumps `MODEL` to the next model (e.g. a new Sonnet
//       or an Opus/Haiku/Fable tier) — a deliberate code edit per D-016 — but the
//       README/PLAN/evals/data-roles docs keep advertising "Claude Sonnet 4.6". Now
//       the front-door docs and the eval procedure name a model the app no longer
//       calls: a contributor picks the wrong model in the Console workbench (evals no
//       longer reproduce production), and the README misrepresents the stack. Build
//       stays green — each string is valid on its own. This guard fails on every stale
//       doc, forcing the bump to be the coordinated edit D-016 intends.
//   (b) THE IN-FILE COMMENT SKEW: `role-analysis.ts`'s own "Sonnet 4.6" comment drifts
//       from its `MODEL` const on a bump (the const changes, the comment three lines up
//       does not) — the file lies about itself. Pinned here (case 2).
//   (c) THE ID/NAME SPLIT: a doc updates the human name ("Claude Sonnet 4.7") but not
//       the wire id `claude-sonnet-4-6` in the same file, or vice-versa — the two forms
//       of the same fact disagree within one document. Both forms are derived from the
//       one const, so this cannot pass.
//
// DELIBERATELY EXCLUDES `DECISIONS.md`. That file is an append-only ADR log: D-003,
// D-012, D-016, D-026, D-074 record that `claude-sonnet-4-6` was chosen AT THAT TIME
// and must stay frozen even after a future bump — a model change appends a NEW decision,
// it does not rewrite the old ones. Scanning it would force either rewriting history or
// pinning the model to 4.6 forever. The live docs above are current-state claims; the
// ADR log is a record. (Same "frozen record vs. live claim" line the L5.61 decisions
// guard walks in the other direction.)
//
// DIRECTIONAL by construction: this checks that every model mention in the live-doc set
// AGREES with the source const — the const is the source of truth, the docs derive from
// it. The human-name form ("Sonnet 4.6") is derived from the id by the documented
// naming convention `claude-<tier>-<major>-<minor>` → `<Tier> <major>.<minor>`, so a
// tier or version change in the const invalidates a stale doc phrase without needing a
// second source. Tier vocabulary is the Anthropic set {Opus, Sonnet, Haiku, Fable}, so
// unrelated "<Word> <maj>.<min>" version strings (Next.js 15, TS 5.7, SDK ^0.40) never
// match the display-name scanner — only an actual model tier name does.
//
// Why a text guard: same D-080 wall as the L5.57–L5.84 arc — `role-analysis.ts`
// value-imports `@anthropic-ai/sdk` and `@/`-aliased modules the bare `.mjs` loader
// can't resolve and that aren't installed for the runner; the docs are Markdown. So it
// reads each source as TEXT and regex-extracts the id + display-name mentions. Pure Node
// built-ins, no npm install — identical on the routine laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical source-of-truth model id. Named here as the drop-detector anchor: a
// fully-coordinated bump across the const + every doc would keep the cross-surface
// agreement checks green, so this literal forces the bump to be a deliberate, reviewed
// edit here too (same role CANONICAL_YEAR plays in L5.84 / CANONICAL_SLUG in L5.83).
const CANONICAL_MODEL_ID = "claude-sonnet-4-6";

// The file that hardcodes the model. Its `const MODEL = "…"` is the source of truth.
const SOURCE_FILE = "lib/anthropic/role-analysis.ts";

// The LIVE documents that restate the model (id and/or human name). DECISIONS.md is
// deliberately absent — it is a frozen ADR log, not a current-state claim (see header).
// The source file is included so its own header comment is checked against its const.
const LIVE_DOCS = [
  SOURCE_FILE,
  "README.md",
  "PLAN.md",
  "evals/README.md",
  "data/roles/README.md",
];

// The Anthropic model-tier vocabulary. Scoping the display-name scanner to these words
// keeps unrelated version strings ("Next.js 15", "TS 5.7") from ever matching.
const TIERS = ["Opus", "Sonnet", "Haiku", "Fable"];
const TIER_ALT = TIERS.join("|");

// `claude-<tier>-<major>-<minor>` — the wire model id form.
const MODEL_ID_RE = new RegExp(`claude-(${TIER_ALT.toLowerCase()})-(\\d+)-(\\d+)`, "gi");
// `[Claude ]<Tier> <major>.<minor>` — the human-readable form (dot, not hyphen, so it
// never collides with the id above).
const DISPLAY_NAME_RE = new RegExp(`\\b(?:Claude )?(${TIER_ALT}) (\\d+)\\.(\\d+)`, "g");

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Parse the source-of-truth id into its parts and the derived human-name form.
// `claude-sonnet-4-6` → { id, tier: "Sonnet", version: "4.6" }.
function parseModelId(id) {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  const [, tierLower, major, minor] = m;
  return {
    id,
    tier: tierLower.charAt(0).toUpperCase() + tierLower.slice(1),
    version: `${major}.${minor}`,
  };
}

// Extract every wire model id literal from a source.
function modelIdMentions(src) {
  return [...src.matchAll(MODEL_ID_RE)].map((m) => m[0].toLowerCase());
}

// Extract every human-readable model-name mention as { tier, version, text }.
function displayNameMentions(src) {
  return [...src.matchAll(DISPLAY_NAME_RE)].map((m) => ({
    tier: m[1],
    version: `${m[2]}.${m[3]}`,
    text: m[0],
  }));
}

// The source of truth.
const sourceSrc = read(SOURCE_FILE);
const modelConst = (() => {
  const m = /const\s+MODEL\s*=\s*["'`](claude-[a-z0-9-]+)["'`]/.exec(sourceSrc);
  return m ? m[1] : null;
})();
const expected = modelConst ? parseModelId(modelConst) : null;

test("the MODEL const parses to a known tier + version (vacuous-parse guard)", () => {
  // If the const could not be read or does not match the id grammar, every check below
  // would be comparing against nothing — assert the source of truth first.
  assert.ok(
    modelConst,
    `could not extract \`const MODEL = "…"\` from ${SOURCE_FILE}`,
  );
  assert.ok(
    expected,
    `MODEL="${modelConst}" does not match the claude-<tier>-<major>-<minor> id grammar`,
  );
  assert.ok(
    TIERS.includes(expected.tier),
    `MODEL tier "${expected.tier}" is not one of the known Anthropic tiers ${TIERS.join(", ")}`,
  );
});

test("the source file's own comment names the same model as its MODEL const", () => {
  // `role-analysis.ts` carries a "Sonnet 4.6" comment three lines above the const. On a
  // bump the const changes but the comment can be forgotten — the file would then lie
  // about itself. Pin every display-name mention in the source file to its own const.
  const names = displayNameMentions(sourceSrc);
  assert.ok(
    names.length >= 1,
    `${SOURCE_FILE} carries no "<Tier> <major>.<minor>" model comment to check against its MODEL const`,
  );
  for (const n of names) {
    assert.equal(
      n.tier,
      expected.tier,
      `${SOURCE_FILE} comment says "${n.text}" but MODEL=${modelConst} (tier ${expected.tier})`,
    );
    assert.equal(
      n.version,
      expected.version,
      `${SOURCE_FILE} comment says "${n.text}" but MODEL=${modelConst} (version ${expected.version})`,
    );
  }
});

test("every model-id literal in the live docs equals the MODEL const", () => {
  // The wire id form (`claude-sonnet-4-6`) is copied verbatim into the eval/seed
  // procedures. Each copy must be byte-identical to the source const — a stale one
  // sends a contributor to the wrong Console model.
  for (const doc of LIVE_DOCS) {
    for (const id of modelIdMentions(read(doc))) {
      assert.equal(
        id,
        expected.id,
        `${doc} names model id "${id}" but the app calls ${expected.id} (${SOURCE_FILE}). ` +
          `Update every doc together on a model bump — D-016.`,
      );
    }
  }
});

test("every human-name model phrase in the live docs matches the MODEL const", () => {
  // The "Claude Sonnet 4.6" prose form must agree with the const's derived tier +
  // version. Scoped to the Anthropic tier vocabulary so only real model names are
  // checked (never "Next.js 15" / "TS 5.7").
  for (const doc of LIVE_DOCS) {
    for (const n of displayNameMentions(read(doc))) {
      assert.equal(
        `${n.tier} ${n.version}`,
        `${expected.tier} ${expected.version}`,
        `${doc} names model "${n.text}" but the app calls ${expected.tier} ${expected.version} ` +
          `(${expected.id}, ${SOURCE_FILE}). Update every doc together on a model bump — D-016.`,
      );
    }
  }
});

test("every live doc carries at least one model mention (drop-detector, per file)", () => {
  // A doc that drops its model reference entirely would pass the agreement checks
  // vacuously. Require each live doc to mention the model as an id OR a human name so a
  // deleted claim fails here.
  for (const doc of LIVE_DOCS) {
    const src = read(doc);
    const has = modelIdMentions(src).length > 0 || displayNameMentions(src).length > 0;
    assert.ok(
      has,
      `${doc} names the model nowhere — it is in the live-doc set and must reference ` +
        `${expected.id} (as an id or the "Claude ${expected.tier} ${expected.version}" name)`,
    );
  }
});

test("the source-of-truth model id is the canonical claude-sonnet-4-6 (anchor)", () => {
  // Pins the current model literally so a fully-coordinated bump — which the agreement
  // checks alone would let through — is still a deliberate, test-visible edit here.
  assert.equal(
    modelConst,
    CANONICAL_MODEL_ID,
    `the app model must be ${CANONICAL_MODEL_ID} (found ${modelConst}); if this is a genuine ` +
      `bump, update this anchor and every live doc together`,
  );
});
