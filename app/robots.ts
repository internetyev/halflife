// Robots policy (L5.5). Next.js serves this at `/robots.txt` from the default
// export. It is the crawl-policy companion to `app/sitemap.ts` (L3.3):
//
//   - Allow every user-agent to crawl the site.
//   - Disallow `/api/` — the `analyze`/`subscribe`/`og` routes return JSON or
//     a generated image, not indexable content. (Social-card scrapers fetch
//     `/api/og/<slug>` via the page's OG `<meta>` tags and largely ignore
//     robots.txt anyway, so this does not break share previews; it only keeps
//     search engines from indexing the raw endpoint as a thin "page".)
//   - Publish the `Sitemap:` directive so crawlers discover the
//     self-maintaining sitemap without guessing the path. This is the exact
//     deferred concern D-027 named: "a `Sitemap:` directive / indexing policy
//     is an L5 launch-checklist concern" — landing here in Phase 5, not bolted
//     onto the sitemap-only L3.3.
//
// Self-maintaining like the sitemap: zero env wiring needed today, and the
// final domain flows in automatically via `NEXT_PUBLIC_SITE_URL` when the
// human-gated naming pick (L1.7b / L5.1) lands — no code edit.

import type { MetadataRoute } from "next";

// Base URL mirrors `app/sitemap.ts` (D-027) and `app/layout.tsx`'s
// `metadataBase` default so the `Sitemap:` and `host` lines agree with the
// canonical origin the metadata and sitemap advertise. `NEXT_PUBLIC_SITE_URL`
// is the deploy-time override for the final domain. Trailing slash stripped so
// `${SITE_URL}/sitemap.xml` never doubles up. The literal is duplicated across
// `sitemap.ts`/`json-ld.ts`/`layout.tsx`/here deliberately — four small reads
// beat a shared-helper refactor that churns shipped Phase-2 code (same
// scope-control call as D-027/D-028).
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://halflife.work"
).replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
