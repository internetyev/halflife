// Structured data for per-role pages (L3.4).
//
// Emits two schema.org types as a single JSON-LD `@graph`:
//
//   1. `Article` — lets the role page surface as a rich result and gives
//      crawlers explicit headline/description/author/image/dateModified
//      instead of inferring them from the DOM.
//   2. `FAQPage` — the four questions a visitor actually types ("will AI
//      replace a <role>?", "how many years?", "which AI tools?", "how do I
//      stay relevant?"). Each answer is built from the SAME fields the
//      `ResultCard` renders on the page, so the structured answer never
//      contradicts the visible one (a Google FAQ-rich-result requirement).
//
// Base URL mirrors `app/sitemap.ts` (D-027): `NEXT_PUBLIC_SITE_URL` is the
// deploy-time override for the final domain (human-gated L1.7b / L5.1),
// defaulting to the same `https://halflife.work` literal `app/layout.tsx`'s
// `metadataBase` uses, so JSON-LD `@id`/`url` values agree with the
// canonical origin the page metadata advertises. Trailing slash stripped so
// `${SITE_URL}/role/x` never doubles up.

import type { RoleAnalysisResult } from "@/lib/scoring/types";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://halflife.work"
).replace(/\/+$/, "");

function displayTitle(result: RoleAnalysisResult): string {
  return result.normalized_title.replace(/\b\w/g, (c) => c.toUpperCase());
}

// One year-figure phrasing reused across answers so the FAQ reads
// consistently and matches the metadata description in `page.tsx`.
function countdownPhrase(result: RoleAnalysisResult): string {
  const years = result.countdown_years.toFixed(1);
  return `about ${years} years until AI plausibly handles at least 50% of the work`;
}

function faqAnswers(result: RoleAnalysisResult): { q: string; a: string }[] {
  const role = displayTitle(result);
  const tools = result.ai_tools;
  const toolSentence =
    tools.length > 0
      ? `Tools already pressuring this role include ${tools
          .map((t) => `${t.name} (${t.vendor}) — ${t.what_it_automates}`)
          .join("; ")}.`
      : `No specific commercial AI tools were identified as directly targeting this role yet.`;

  const pivotSentence =
    result.pivot_steps.length > 0
      ? `Recommended pivot steps: ${result.pivot_steps
          .map((s, i) => `${i + 1}. ${s}`)
          .join(" ")}`
      : `No specific pivot steps were generated for this role.`;

  return [
    {
      q: `Will AI replace a ${role}?`,
      a: `A ${role} has an AI-obsolescence survival score of ${result.score}/100 — ${countdownPhrase(
        result,
      )}. This is a forecast of automation pressure, not a guarantee; confidence in this estimate is ${result.confidence}.`,
    },
    {
      q: `How many years until AI can do the job of a ${role}?`,
      a: `The countdown estimate is ${result.countdown_years.toFixed(
        1,
      )} years — ${countdownPhrase(result)} of a ${role}.`,
    },
    {
      q: `Which AI tools affect a ${role}?`,
      a: toolSentence,
    },
    {
      q: `How can a ${role} stay relevant as AI advances?`,
      a: pivotSentence,
    },
  ];
}

// Returns the value for a single `<script type="application/ld+json">` —
// an `@graph` so the Article can reference the FAQPage by `@id` and both
// share one publisher/Organization node.
export function buildRoleJsonLd(
  result: RoleAnalysisResult,
  canonicalSlug: string,
): Record<string, unknown> {
  const role = displayTitle(result);
  const pageUrl = `${SITE_URL}/role/${canonicalSlug}`;
  const imageUrl = `${SITE_URL}/api/og/${canonicalSlug}`;
  const orgId = `${SITE_URL}/#organization`;
  const articleId = `${pageUrl}#article`;
  const faqId = `${pageUrl}#faq`;

  // No real publication date is tracked (forecasts are regenerated on
  // prompt-version bumps, not edited in place). Use the build/render time
  // so `dateModified` is honest rather than fabricating a fixed date.
  const now = new Date().toISOString();

  const organization = {
    "@type": "Organization",
    "@id": orgId,
    name: "halflife",
    url: `${SITE_URL}/`,
  };

  const article = {
    "@type": "Article",
    "@id": articleId,
    headline: `${role} — AI obsolescence countdown`,
    description: `Survival score ${result.score}/100 — ${countdownPhrase(
      result,
    )} of a ${role}. Includes the AI tools applying pressure and a pivot roadmap.`,
    datePublished: now,
    dateModified: now,
    author: { "@id": orgId },
    publisher: { "@id": orgId },
    image: imageUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
    about: { "@type": "Thing", name: role },
    isAccessibleForFree: true,
  };

  const faqPage = {
    "@type": "FAQPage",
    "@id": faqId,
    mainEntity: faqAnswers(result).map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, article, faqPage],
  };
}

// Serialize for inlining in a `<script type="application/ld+json">`.
// `JSON.stringify` does NOT escape `<`, so model-generated prose in
// `ai_tools`/`pivot_steps` containing a literal `</script>` (or `<!--`)
// would break out of the element. Escaping `<` to its `<` JSON
// unicode form is the standard, parser-transparent fix.
export function serializeRoleJsonLd(
  result: RoleAnalysisResult,
  canonicalSlug: string,
): string {
  return JSON.stringify(buildRoleJsonLd(result, canonicalSlug)).replace(
    /</g,
    "\\u003c",
  );
}
