// GitHub source-repository URL consistency guard: the canonical source-code home
// `github.com/internetyev/halflife` — the `<owner>/<repo>` this project links to
// as its public source — must be byte-for-byte in step across every hand-written
// surface that carries it as a clickable link, a CI badge, or a disclosure base.
//
// The repo URL is a hardcoded string copied by hand into FOUR files, each with a
// different job, with nothing pinning the copies to one `<owner>/<repo>` until now:
//
//   1. `components/site-footer.tsx` — `REPO_URL` ("Source" link every page's
//      footer shows) AND the `METHODOLOGY_URL` template literal derived from it
//      (`${REPO_URL}/blob/main/docs/methodology.md`, the footer "Methodology"
//      link). This is the CANONICAL const; the other three restate its origin.
//   2. `app/privacy/page.tsx` — the in-page "GitHub" link ("the history is public
//      on GitHub"), a bare repo-root href the reader clicks to audit the source.
//   3. `README.md` — the CI badge: an `img` src (`…/actions/workflows/ci.yml/
//      badge.svg`) AND its link target (`…/actions/workflows/ci.yml`), the green
//      check the repo landing page shows.
//   4. `SECURITY.md` — the GitHub Security Advisories base
//      (`…/security/advisories/new`) a reporter is sent to file a private report.
//
// The drift this pins is a silent dead-link / broken-badge / dead-end-disclosure
// failure, invisible to every build step (none of these files is touched by
// `next build`/`tsc --noEmit`; a URL string is always valid on its own):
//   (a) the GitHub org or repo is renamed — a repo transfer, or the human-gated
//       L1.7b/L5.1 naming pick that renames the repo alongside the product — and
//       the new `<owner>/<repo>` lands in `site-footer.tsx`'s `REPO_URL` but not
//       in `privacy/page.tsx` (or vice-versa): the footer "Source" link works
//       while the privacy-page "GitHub" link 404s, or the reverse. Both files
//       still parse; the split shows only as a dead link a visitor clicks.
//   (b) the README CI badge keeps the OLD `<owner>/<repo>` after a rename — the
//       repo landing page shows a permanently-broken badge image (or a badge for
//       a repo that no longer exists), the first thing a visitor sees.
//   (c) `SECURITY.md`'s advisory base keeps the old repo — a security reporter
//       who reads it is sent to a 404ing advisory form, so a real report lands
//       nowhere. (The L5.75/D-106 security-disclosure guard pins that advisory
//       URL against `security.txt`'s `Contact:` — the disclosure CHANNEL parity —
//       but it never reads the footer "Source" link, the privacy-page GitHub
//       link, or the README badge, so the repo-ROOT origin across those three
//       link/badge surfaces was unguarded; this guard owns exactly that.)
//
// Why a NEW surface, not an existing brand/origin guard: the L5.65/D-095
// site-origin guard pins the SITE origin (`https://halflife.work`) across the
// runtime metadata routes; it never reads a `github.com/…` string. The brand
// family (manifest/json-ld/og-card, L5.68–L5.80) pins the brand NAME/COPY, never
// the source-repo URL. This guard owns the orthogonal `<owner>/<repo>` contract
// across the four files that link to the code itself.
//
// Fully extractive (no per-file hard-coded URL): every `github.com/<owner>/<repo>`
// occurrence is pulled by regex and reduced to its `<owner>/<repo>`; all must
// agree, and the two BARE repo-root links (footer `REPO_URL` + privacy href) must
// be byte-for-byte identical full URLs so a `http`/`https` or trailing-slash drift
// is caught too. A single `internetyev/halflife` anchor pins the current source of
// truth so a coordinated both-sides rename is still a deliberate, test-visible edit.
//
// Why a text guard: same D-080 wall as the L5.57–L5.82 arc — `site-footer.tsx` /
// `privacy/page.tsx` import `next` (`next/link`, `Metadata`) and `@/`-aliased
// modules the bare `.mjs` loader can't resolve and that aren't installed for the
// runner, and README/SECURITY are Markdown — so it reads each source as TEXT and
// regex-extracts the URLs. Pure Node built-ins, no npm install — identical on the
// routine laptop and CI. Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The canonical source-of-truth `<owner>/<repo>`. Named here as the drop-detector
// anchor: a coordinated rename across all four files would keep the cross-file
// agreement check green, so this literal forces the rename to be a deliberate,
// reviewed edit here too (the same role CORE_GOALS / the known-core palette play
// in the L5.81/L5.82 guards).
const CANONICAL_SLUG = "internetyev/halflife";

// Files that hand-carry the source-repo URL, and how many `github.com/<owner>/<repo>`
// occurrences each is expected to contribute (a lower bound — an anti-vacuous floor
// so a regex that silently matched nothing in a file fails loudly).
const FILES = [
  { path: "components/site-footer.tsx", min: 1 }, // REPO_URL (METHODOLOGY_URL is a ${REPO_URL} template — no 2nd literal)
  { path: "app/privacy/page.tsx", min: 1 }, // the in-page "GitHub" link
  { path: "README.md", min: 2 }, // CI badge img src + its link target
  { path: "SECURITY.md", min: 1 }, // advisory base
];

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

// Every `github.com/<owner>/<repo>` in `src`, returned as { slug, url } where slug
// is `<owner>/<repo>` and url is the full matched `https?://github.com/<owner>/<repo>`
// (path tail beyond the repo dropped). `[\w.-]+` stops at the next `/` or non-path
// char, so `…/halflife/actions/…` yields `internetyev/halflife`, and a bare
// `…/halflife"` yields the same.
function repoRefs(src) {
  const re = /(https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+))/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ url: m[1], slug: `${m[2]}/${m[3]}` });
  }
  return out;
}

// Map file → its extracted refs.
const perFile = new Map(FILES.map(({ path }) => [path, repoRefs(read(path))]));

test("each source-linking file yields its expected github.com/<owner>/<repo> occurrences (vacuous-scan guard)", () => {
  // If a file's scan silently returned nothing, the agreement check below would
  // pass for the wrong reason. Assert the per-file floor first.
  for (const { path, min } of FILES) {
    const refs = perFile.get(path);
    assert.ok(
      refs.length >= min,
      `${path}: expected ≥${min} github.com/<owner>/<repo> occurrence(s), found ${refs.length}`,
    );
  }
});

test("the source-repo scan is substantive and spans all four files (anti-vacuous)", () => {
  // Guards against a regex that collapsed to one match in one file: the agreement
  // check is only meaningful if every file actually contributed.
  const filesWithRefs = [...perFile.values()].filter((refs) => refs.length > 0).length;
  assert.equal(
    filesWithRefs,
    FILES.length,
    `expected all ${FILES.length} files to carry a repo URL, only ${filesWithRefs} did`,
  );
  const total = [...perFile.values()].reduce((n, refs) => n + refs.length, 0);
  assert.ok(total >= 5, `expected ≥5 total repo-URL occurrences across the four files, found ${total}`);
});

test("every github.com repo URL resolves to ONE shared <owner>/<repo>", () => {
  // The load-bearing check: a rename applied to one file but not another leaves two
  // competing <owner>/<repo> slugs — a dead "Source"/GitHub link, a broken CI
  // badge, or a 404ing advisory base. All must agree.
  const bySlug = new Map();
  for (const [path, refs] of perFile) {
    for (const { slug } of refs) {
      if (!bySlug.has(slug)) bySlug.set(slug, new Set());
      bySlug.get(slug).add(path);
    }
  }
  const slugs = [...bySlug.keys()];
  assert.equal(
    slugs.length,
    1,
    `all github.com URLs must share one <owner>/<repo>; found ${slugs.length}: ` +
      slugs.map((s) => `${s} (in ${[...bySlug.get(s)].join(", ")})`).join(" vs "),
  );
});

test("the shared <owner>/<repo> is the canonical internetyev/halflife (drop-detector anchor)", () => {
  // Pins the current source of truth literally so a coordinated both-sides rename
  // — which the agreement check alone would let through — is still a deliberate,
  // test-visible edit here.
  const slugs = new Set();
  for (const refs of perFile.values()) for (const { slug } of refs) slugs.add(slug);
  assert.deepEqual([...slugs], [CANONICAL_SLUG], `every repo URL must point at ${CANONICAL_SLUG}`);
});

test("the two bare repo-root links (footer + privacy) are byte-for-byte identical", () => {
  // Footer `REPO_URL` and the privacy-page "GitHub" href both link to the repo
  // ROOT (no path tail). Beyond agreeing on <owner>/<repo>, their full URLs must
  // match exactly — so a `http`/`https` scheme drift or a trailing-slash mismatch
  // between the two clickable "here is our source" links is caught too.
  const footer = read("components/site-footer.tsx");
  const privacy = read("app/privacy/page.tsx");
  const footerRoot = /REPO_URL\s*=\s*["'`](https?:\/\/github\.com\/[\w.-]+\/[\w.-]+)["'`]/.exec(footer);
  const privacyRoot = /href=["'`](https?:\/\/github\.com\/[\w.-]+\/[\w.-]+)["'`]/.exec(privacy);
  assert.ok(footerRoot, "could not find a bare-root REPO_URL literal in components/site-footer.tsx");
  assert.ok(privacyRoot, "could not find a bare-root github.com href in app/privacy/page.tsx");
  assert.equal(
    footerRoot[1],
    privacyRoot[1],
    `the footer "Source" link (${footerRoot[1]}) and the privacy-page "GitHub" link ` +
      `(${privacyRoot[1]}) must be the identical repo-root URL`,
  );
});
