// Sitemap (L3.3). Next.js serves this at `/sitemap.xml` from the default
// export. We list two kinds of URL:
//
//   1. The home page `/` — always present.
//   2. One `/role/<slug>` per *seeded* role: a file `data/roles/<slug>.json`
//      that actually exists.
//
// Why derive from `data/roles/*.json` and NOT from the 308/200-title corpus
// in `data/job-titles/top-200.json`: a corpus slug only resolves to a real
// 200 page once it has precomputed JSON (or a live KV hit) — see
// `app/role/[slug]/page.tsx`, which `notFound()`s otherwise (D-021). Listing
// not-yet-seeded slugs would fill the sitemap with 404s, which search engines
// penalize. This makes the sitemap self-maintaining: it currently emits just
// `/` (the seed pass L3.2b is human-gated and hasn't run), and every role
// JSON the human commits in L3.2b appears automatically with no code change.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { MetadataRoute } from "next";

// Base URL mirrors `app/layout.tsx`'s `metadataBase` default
// (`https://halflife.work`) so absolute sitemap URLs match the canonical
// origin the metadata advertises. `NEXT_PUBLIC_SITE_URL` is the deploy-time
// override for the final domain (decided in the human-gated L1.7b / L5.1) so
// no code edit is needed when the name lands. Trailing slash stripped so
// `${SITE_URL}/role/x` never doubles up.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://halflife.work"
).replace(/\/+$/, "");

async function seededRoleSlugs(): Promise<string[]> {
  const dir = path.join(process.cwd(), "data", "roles");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    // No `data/roles/` directory yet (or unreadable): just the home page.
    return [];
  }
  return entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .filter(Boolean)
    .sort();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const home: MetadataRoute.Sitemap[number] = {
    url: `${SITE_URL}/`,
    lastModified,
    changeFrequency: "weekly",
    priority: 1,
  };

  // The annual report (L4.2). Always present and always 200 — it renders a
  // self-maintaining empty state until the post-seed ranking (L4.1b) lands —
  // so unlike a not-yet-seeded `/role/<slug>` it is always safe to advertise.
  const report: MetadataRoute.Sitemap[number] = {
    url: `${SITE_URL}/report/2026`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.8,
  };

  // The privacy notice (L5.13). Static text page (`app/privacy/page.tsx`),
  // always 200, indexable — listing it is the "make findable" half of the
  // launch-checklist §4 gate that wants a privacy note at `/privacy`.
  const privacy: MetadataRoute.Sitemap[number] = {
    url: `${SITE_URL}/privacy`,
    lastModified,
    changeFrequency: "yearly",
    priority: 0.3,
  };

  const roles: MetadataRoute.Sitemap = (await seededRoleSlugs()).map(
    (slug) => ({
      url: `${SITE_URL}/role/${slug}`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    }),
  );

  return [home, report, privacy, ...roles];
}
