// Unit tests for the L3.4/L5.16 schema.org JSON-LD builders (lib/seo/json-ld.ts).
//
// Second lib/ suite after L5.50's plausible coverage. json-ld.ts is the next
// cleanly-testable runtime module: its ONLY import is `import type { RoleAnalysisResult }`
// — a type-only import Node's type-stripper removes before resolution, so the
// extensionless `@/lib/scoring/types` specifier never hits the loader (the same
// problem that still defers lib/scoring/index.ts; see D-080). All four exports
// are pure, env-only-at-import functions, so `import … from "../json-ld.ts"`
// resolves with no TS loader and no source churn.
//
// The load-bearing invariant is in `serializeRoleJsonLd`: model-generated prose
// in `ai_tools`/`pivot_steps` is inlined into a `<script type="application/ld+json">`,
// so a literal `</script>` in that prose MUST be escaped to `<…` or it breaks
// out of the element (the source's own warning). These tests pin that escape, the
// `@graph` shape (Organization/Article/FAQPage, four FAQ questions), the shared
// Organization `@id` that lets Google merge the role + site graphs, and the
// empty-tools / empty-pivots answer branches.
//
// Run via `npm test` (the glob already covers lib/**/__tests__). Pure Node
// built-ins, no npm install — identical on the routine laptop and CI.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRoleJsonLd,
  serializeRoleJsonLd,
  buildSiteJsonLd,
  serializeSiteJsonLd,
} from "../json-ld.ts";

const SITE_URL = "https://halflife.work"; // env-unset default (routine + CI path)

// Minimal result matching the RoleAnalysisResult shape buildRoleJsonLd reads.
function makeResult(overrides = {}) {
  return {
    input_title: "registered nurse",
    normalized_title: "registered nurse",
    score: 42,
    countdown_years: 5.3,
    ai_tools: [
      {
        name: "Tempus",
        vendor: "Tempus AI",
        what_it_automates: "diagnostic triage",
      },
    ],
    pivot_steps: ["Specialize in palliative care", "Learn AI-assisted charting"],
    confidence: "medium",
    sources_hint: ["bls.gov"],
    methodology_version: 1,
    prompt_version: 1,
    ...overrides,
  };
}

// Pull a node out of the @graph by its "@type".
function nodeOfType(graph, type) {
  return graph.find((n) => n["@type"] === type);
}

test("buildRoleJsonLd emits the schema.org @graph with org, article and FAQ nodes", () => {
  const doc = buildRoleJsonLd(makeResult(), "registered-nurse");
  assert.equal(doc["@context"], "https://schema.org");
  const graph = doc["@graph"];
  assert.ok(Array.isArray(graph));
  assert.equal(graph.length, 3);
  assert.ok(nodeOfType(graph, "Organization"));
  assert.ok(nodeOfType(graph, "Article"));
  assert.ok(nodeOfType(graph, "FAQPage"));
});

test("Article urls/ids derive from SITE_URL and the canonical slug", () => {
  const doc = buildRoleJsonLd(makeResult(), "registered-nurse");
  const article = nodeOfType(doc["@graph"], "Article");
  const pageUrl = `${SITE_URL}/role/registered-nurse`;
  assert.equal(article["@id"], `${pageUrl}#article`);
  assert.equal(article.image, `${SITE_URL}/api/og/registered-nurse`);
  assert.equal(article.mainEntityOfPage["@id"], pageUrl);
  // Title-cased role surfaces in the headline.
  assert.match(article.headline, /Registered Nurse/);
  // Score is woven into the description verbatim.
  assert.match(article.description, /42\/100/);
});

test("Article author and publisher both point at the Organization @id", () => {
  const doc = buildRoleJsonLd(makeResult(), "registered-nurse");
  const graph = doc["@graph"];
  const org = nodeOfType(graph, "Organization");
  const article = nodeOfType(graph, "Article");
  const orgId = `${SITE_URL}/#organization`;
  assert.equal(org["@id"], orgId);
  assert.equal(article.author["@id"], orgId);
  assert.equal(article.publisher["@id"], orgId);
});

test("FAQPage carries exactly the four canonical questions, answers reflect the role", () => {
  const doc = buildRoleJsonLd(makeResult(), "registered-nurse");
  const faq = nodeOfType(doc["@graph"], "FAQPage");
  assert.equal(faq.mainEntity.length, 4);
  for (const q of faq.mainEntity) {
    assert.equal(q["@type"], "Question");
    assert.equal(q.acceptedAnswer["@type"], "Answer");
    assert.ok(q.name.includes("Registered Nurse"));
  }
  // The countdown figure (one decimal) shows up in the year answer.
  const yearsAnswer = faq.mainEntity[1].acceptedAnswer.text;
  assert.match(yearsAnswer, /5\.3 years/);
  // Tool answer names the populated tool.
  const toolAnswer = faq.mainEntity[2].acceptedAnswer.text;
  assert.match(toolAnswer, /Tempus \(Tempus AI\) — diagnostic triage/);
});

test("empty ai_tools and pivot_steps fall back to the no-data phrasings", () => {
  const doc = buildRoleJsonLd(
    makeResult({ ai_tools: [], pivot_steps: [] }),
    "registered-nurse",
  );
  const faq = nodeOfType(doc["@graph"], "FAQPage");
  const toolAnswer = faq.mainEntity[2].acceptedAnswer.text;
  const pivotAnswer = faq.mainEntity[3].acceptedAnswer.text;
  assert.match(toolAnswer, /No specific commercial AI tools/);
  assert.match(pivotAnswer, /No specific pivot steps/);
});

test("serializeRoleJsonLd escapes < so injected prose cannot break out of <script>", () => {
  const doc = serializeRoleJsonLd(
    makeResult({
      pivot_steps: ["</script><script>alert(1)</script>"],
    }),
    "registered-nurse",
  );
  // No raw "<" survives the escape; the breakout sequence is neutralised.
  assert.ok(!doc.includes("<"));
  assert.ok(!doc.includes("</script>"));
  assert.ok(doc.includes("\\u003c"));
  // Still valid JSON that round-trips back to the literal prose.
  const parsed = JSON.parse(doc);
  const faq = nodeOfType(parsed["@graph"], "FAQPage");
  assert.match(
    faq.mainEntity[3].acceptedAnswer.text,
    /<\/script><script>alert\(1\)<\/script>/,
  );
});

test("buildSiteJsonLd emits Organization + WebSite sharing the role graph's Organization @id", () => {
  const doc = buildSiteJsonLd();
  assert.equal(doc["@context"], "https://schema.org");
  const graph = doc["@graph"];
  assert.equal(graph.length, 2);
  const org = nodeOfType(graph, "Organization");
  const website = nodeOfType(graph, "WebSite");
  const orgId = `${SITE_URL}/#organization`;
  // Same @id buildRoleJsonLd uses → Google merges the duplicated node (L5.16).
  assert.equal(org["@id"], orgId);
  assert.equal(website.publisher["@id"], orgId);
  assert.equal(website.inLanguage, "en");
  assert.equal(website.url, `${SITE_URL}/`);
});

test("serializeSiteJsonLd produces escaped, parseable JSON", () => {
  const doc = serializeSiteJsonLd();
  assert.ok(!doc.includes("<"));
  const parsed = JSON.parse(doc);
  assert.equal(parsed["@graph"].length, 2);
});
