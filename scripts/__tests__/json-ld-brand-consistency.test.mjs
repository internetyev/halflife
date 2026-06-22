// JSON-LD brand-entity consistency guard: the schema.org structured data the
// site emits must advertise ONE brand entity — the same brand short name, one
// mergeable Organization `@id`, and the canonical-origin `url` form — across
// both builders in `lib/seo/json-ld.ts`, and that brand name must match the
// human-facing brand short name the rest of the chrome shows.
//
// `lib/seo/json-ld.ts` has TWO `@graph` builders that hand-copy the brand
// entity:
//
//   1. `buildRoleJsonLd` (L3.4) — emitted on every `/role/:slug` page. Its
//      `@graph` carries an `Organization` node: `name: "halflife"`,
//      `@id: ${SITE_URL}/#organization`, `url: ${SITE_URL}/`.
//   2. `buildSiteJsonLd` (L5.16) — injected from `app/layout.tsx` on every
//      other route (home, `/report/2026`, `/privacy`, `/not-found`). Its
//      `@graph` carries the SAME `Organization` node PLUS a `WebSite` node
//      (`name: "halflife"`, `@id: ${SITE_URL}/#website`, `url: ${SITE_URL}/`).
//
// `buildSiteJsonLd`'s own header is explicit that the Organization `@id` is
// "identical to the one `buildRoleJsonLd` uses (`${SITE_URL}/#organization`),
// so role pages still ship the richer Article + FAQPage graph and Google
// merges the duplicated Organization node by `@id` rather than treating it as
// two separate entities." That merge is the load-bearing invariant — and
// nothing pins the two copies together until now.
//
// The brand short name "halflife" is the SAME string the page metadata shows:
// `app/layout.tsx`'s OpenGraph `siteName` (the `%s · halflife` title-template
// suffix / OG attribution) and `app/manifest.ts`'s `short_name` (the launcher
// caption). L5.68 pins manifest↔layout; this pins json-ld↔that same brand
// short name, so all three brand-name surfaces move together.
//
// The drift this pins is a silent structured-data / knowledge-graph failure,
// invisible to every build step:
//   (a) the human-gated L1.7b/L5.1 naming pick changes the brand short name and
//       it lands in `app/layout.tsx`'s `siteName` + `app/manifest.ts`'s
//       `short_name` (the surfaces L5.68 watches) but NOT in `json-ld.ts`'s
//       `Organization`/`WebSite` `name`. `next build`/`tsc --noEmit` stay green
//       (each string literal is valid alone) but the structured-data brand
//       entity Google ingests still advertises the OLD name while every visible
//       surface shows the new one: a split brand entity in the knowledge graph.
//   (b) the Organization `@id` fragment drifts between the two builders
//       (`#organization` in one, `#org` in the other). Both compile, but role
//       pages and the site-level graph now emit two DIFFERENT `@id`s for the
//       same brand — Google can no longer merge them by `@id` and registers two
//       competing Organization entities, the exact merge `buildSiteJsonLd`'s
//       comment depends on, silently broken.
//   (c) the `WebSite` `@id` fragment collides with the `Organization` one (both
//       `#organization`) — two different `@type`s sharing one `@id` in the same
//       `@graph`, an ambiguous node Google may drop or mis-merge.
//   (d) an entity `url` drifts from the `${SITE_URL}/` composition form (a bare
//       `${SITE_URL}` with no slash, or a typo'd interpolation) so the brand
//       entity's `url` no longer resolves to the canonical origin + exactly one
//       slash that `app/sitemap.ts`/`app/robots.ts` advertise.
//
// Why a text guard, not an import: same D-080 wall as L5.57–L5.68 —
// `lib/seo/json-ld.ts` imports the `@/lib/scoring/types` alias and
// `app/layout.tsx`/`app/manifest.ts` pull `next` types the `.mjs` loader can't
// resolve — so this reads the three sources as TEXT and compares the extracted
// literals, exactly the technique L5.57–L5.68 use on their surfaces. New
// consistency surface — the structured-data brand entity across the two
// json-ld builders, anchored to the L5.68 brand short name — not a continuation
// of the L5.65 site-origin arc (which pins the `SITE_URL` ORIGIN literal, not
// the entity `name`/`@id` fragments this checks) or the L5.68 manifest arc
// (which never touches `json-ld.ts`).
//
// Pure Node built-ins, no npm install — identical on the routine laptop and CI.
// Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

const JSON_LD_FILE = "lib/seo/json-ld.ts";
const LAYOUT_FILE = "app/layout.tsx";
const MANIFEST_FILE = "app/manifest.ts";

// The brand short name the page metadata shows in two human-facing places.
// `app/layout.tsx`'s OpenGraph `siteName` is the canonical brand short name
// (the `%s · halflife` title-template suffix / OG attribution); `app/manifest.ts`'s
// `short_name` is the install-prompt / launcher caption. Both must equal the
// `name` the JSON-LD brand entity advertises.
function layoutSiteName() {
  const src = read(LAYOUT_FILE);
  const m = /siteName:\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    m,
    `could not find \`siteName: "..."\` in ${LAYOUT_FILE} — renamed or reshaped? ` +
      "this is the canonical brand short name the JSON-LD entity name must match; update this guard with it.",
  );
  return m[1];
}

function manifestShortName() {
  const src = read(MANIFEST_FILE);
  const m = /short_name:\s*["']([^"']+)["']/.exec(src);
  assert.ok(
    m,
    `could not find \`short_name: "..."\` in ${MANIFEST_FILE} — renamed or reshaped? ` +
      "this is the launcher-caption brand short name; update this guard with it.",
  );
  return m[1];
}

// Every literal `name: "..."` in the json-ld builders. The only string-literal
// `name:` values in the file are the three brand-entity names (the role-page
// Organization, the site Organization, the site WebSite); the FAQ `name: item.q`
// and `about` `name: role` are expressions, not literals, so this captures the
// brand names exactly without sweeping in dynamic content.
function jsonLdEntityNames(src) {
  return [...src.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
}

// Every `const orgId = `${SITE_URL}/<fragment>`` definition — one per builder.
// Captures the fragment after the origin so the two copies can be compared.
function orgIdFragments(src) {
  return [...src.matchAll(/const orgId\s*=\s*`\$\{SITE_URL\}\/([^`]+)`/g)].map(
    (m) => m[1],
  );
}

// The single `const websiteId = `${SITE_URL}/<fragment>`` in `buildSiteJsonLd`.
function websiteIdFragment(src) {
  const m = /const websiteId\s*=\s*`\$\{SITE_URL\}\/([^`]+)`/.exec(src);
  return m ? m[1] : null;
}

// Every entity `url:` value in the builders. Each must be the bare
// `${SITE_URL}/` composition form (origin + exactly one slash).
function entityUrlLiterals(src) {
  return [...src.matchAll(/url:\s*`([^`]*)`/g)].map((m) => m[1]);
}

const jsonLdSrc = read(JSON_LD_FILE);
const siteName = layoutSiteName();
const shortName = manifestShortName();
const entityNames = jsonLdEntityNames(jsonLdSrc);
const orgFragments = orgIdFragments(jsonLdSrc);
const websiteFragment = websiteIdFragment(jsonLdSrc);
const urlLiterals = entityUrlLiterals(jsonLdSrc);

// The two builders define three brand-entity names, two `orgId`s (one per
// builder), one `websiteId`, and three entity `url`s. Anchor those counts so a
// regex drift or a refactor that drops a node fails the vacuous-scan guard
// below rather than silently shrinking a later check into a no-op.
const EXPECTED_ENTITY_NAMES = 3;
const EXPECTED_ORG_IDS = 2;
const EXPECTED_URLS = 3;

test("the brand-entity literals were actually parsed (vacuous-scan guard)", () => {
  // If any extraction silently returned nothing, every equality check below
  // would trivially pass over an empty set. Anchor the counts and non-emptiness
  // so a reshaped builder (or a regex that stopped matching) fails loudly first.
  assert.ok(siteName.length > 0, `extracted siteName from ${LAYOUT_FILE} is empty`);
  assert.ok(
    shortName.length > 0,
    `extracted short_name from ${MANIFEST_FILE} is empty`,
  );
  assert.equal(
    entityNames.length,
    EXPECTED_ENTITY_NAMES,
    `expected ${EXPECTED_ENTITY_NAMES} \`name: "..."\` brand-entity literals in ${JSON_LD_FILE}, ` +
      `found ${entityNames.length} (${JSON.stringify(entityNames)}) — a node was added/removed or the regex drifted.`,
  );
  assert.equal(
    orgFragments.length,
    EXPECTED_ORG_IDS,
    `expected ${EXPECTED_ORG_IDS} \`const orgId = ...\` definitions in ${JSON_LD_FILE} (one per builder), ` +
      `found ${orgFragments.length} (${JSON.stringify(orgFragments)}).`,
  );
  assert.ok(
    websiteFragment && websiteFragment.length > 0,
    `could not find \`const websiteId = \\\`\${SITE_URL}/<fragment>\\\`\` in ${JSON_LD_FILE}`,
  );
  assert.equal(
    urlLiterals.length,
    EXPECTED_URLS,
    `expected ${EXPECTED_URLS} entity \`url: \\\`...\\\`\` literals in ${JSON_LD_FILE}, ` +
      `found ${urlLiterals.length} (${JSON.stringify(urlLiterals)}).`,
  );
});

test("the brand short name is byte-for-byte identical in layout siteName and manifest short_name", () => {
  // The two human-facing brand-short-name sources L5.68 already pins; re-anchored
  // here because the JSON-LD entity name is checked against this same string —
  // if these two ever disagree, there is no single brand short name to match.
  assert.equal(
    siteName,
    shortName,
    `OpenGraph siteName in ${LAYOUT_FILE} (${JSON.stringify(siteName)}) and short_name in ` +
      `${MANIFEST_FILE} (${JSON.stringify(shortName)}) disagree — the brand short name must be one string.`,
  );
});

test("every JSON-LD brand-entity name equals the brand short name", () => {
  // The load-bearing check: a naming pick (L1.7b/L5.1) updated in layout/manifest
  // but not here ships structured data whose Organization/WebSite name is the OLD
  // brand while every visible surface shows the new one — a split knowledge-graph
  // entity, green build.
  const wrong = entityNames
    .filter((n) => n !== siteName)
    .map((n) => JSON.stringify(n));
  assert.deepEqual(
    wrong,
    [],
    `these JSON-LD entity \`name\` literals disagree with the brand short name ${JSON.stringify(siteName)}: ` +
      `${wrong.join(", ")}. The Organization/WebSite name must match the layout siteName / manifest short_name — ` +
      "update them together so the structured-data brand entity matches the visible brand.",
  );
});

test("the Organization @id fragment is byte-for-byte identical across both builders", () => {
  // `buildSiteJsonLd`'s comment depends on this: role pages and the site-level
  // graph must emit the SAME Organization `@id` so Google merges the duplicated
  // node by `@id` instead of registering two competing brand entities. A fragment
  // drift between the two builders silently breaks that merge.
  const [first, ...rest] = orgFragments;
  for (const frag of rest) {
    assert.equal(
      frag,
      first,
      `the two \`const orgId\` fragments in ${JSON_LD_FILE} disagree (${JSON.stringify(orgFragments)}) — ` +
        "both builders must use the same Organization `@id` so Google merges the duplicated node by `@id`.",
    );
  }
});

test("the WebSite @id fragment is distinct from the Organization @id fragment", () => {
  // Two different `@type`s (Organization, WebSite) must NOT share one `@id` in the
  // same `@graph` — a collision yields an ambiguous node Google may drop or
  // mis-merge. The fragments are intentionally `#organization` vs `#website`.
  assert.notEqual(
    websiteFragment,
    orgFragments[0],
    `the WebSite \`@id\` fragment (${JSON.stringify(websiteFragment)}) collides with the Organization one ` +
      `(${JSON.stringify(orgFragments[0])}) in ${JSON_LD_FILE} — they must be distinct so the two entities don't merge.`,
  );
});

test("every brand-entity url is the bare `${SITE_URL}/` composition form", () => {
  // The entity `url` must resolve to the canonical origin + exactly one slash
  // (the same origin app/sitemap.ts/app/robots.ts advertise). A bare `${SITE_URL}`
  // with no slash, or a typo'd interpolation, drifts the brand entity's url off
  // the canonical origin.
  const EXPECTED_URL = "${SITE_URL}/";
  const wrong = urlLiterals
    .filter((u) => u !== EXPECTED_URL)
    .map((u) => JSON.stringify(u));
  assert.deepEqual(
    wrong,
    [],
    `these entity \`url\` literals in ${JSON_LD_FILE} are not the expected ${JSON.stringify(EXPECTED_URL)} form: ` +
      `${wrong.join(", ")}. Each Organization/WebSite url must be \`\${SITE_URL}/\` so it resolves to the ` +
      "canonical origin plus exactly one slash.",
  );
});
