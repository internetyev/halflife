// Web app manifest (L5.11). Next.js serves this at `/manifest.webmanifest`
// from the default export and auto-injects `<link rel="manifest">` into every
// page's `<head>` — no layout wiring needed. This is the fourth member of the
// self-maintaining metadata-route family (`sitemap.ts` L3.3 / `robots.ts` L5.5
// / this), so a launch checklist can tick "PWA manifest present" and the
// install / Add-to-Home-Screen prompt shows the brand name + colours instead
// of a raw URL.
//
// Self-maintaining like the sitemap/robots: zero env wiring needed today, and
// the final domain flows in automatically via `NEXT_PUBLIC_SITE_URL` (`id`/
// `start_url` track the canonical origin) when the human-gated naming pick
// (L1.7b / L5.1) lands — no code edit.
//
// Icons are deliberately omitted: there is no committed icon asset and the
// routine must not fabricate binary brand artwork (a design/human step, same
// boundary as the L5.1 domain pick). An icon-less manifest is still valid and
// still drives the name/colours/display mode; the human adds `icons` (192 +
// 512 PNG + a maskable variant) alongside the L5.2 deploy. Documented here so
// a future edit does not "fix" the absence by inventing placeholder art.

import type { MetadataRoute } from "next";

// Base URL mirrors `app/sitemap.ts`/`app/robots.ts` (D-027) and
// `app/layout.tsx`'s `metadataBase` default so `id`/`start_url` agree with the
// canonical origin the rest of the metadata advertises. Trailing slash
// stripped so `${SITE_URL}/` never doubles up. The literal is duplicated
// across `sitemap.ts`/`robots.ts`/`json-ld.ts`/`layout.tsx`/here deliberately
// — small reads beat a shared-helper refactor that churns shipped Phase-2
// code (same scope-control call as D-027/D-028).
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://halflife.work"
).replace(/\/+$/, "");

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "halflife — AI Job Obsolescence Clock",
    short_name: "halflife",
    description:
      "How many years until AI replaces your role? Get an obsolescence countdown, survival score, and a concrete pivot roadmap.",
    id: `${SITE_URL}/`,
    start_url: `${SITE_URL}/`,
    display: "standalone",
    // Single-value fields (no media-query support in the manifest spec): use
    // the light-theme surface from `app/globals.css` so the splash/chrome
    // matches the app's default frame. `--color-background` hsl(0 0% 100%) =
    // #ffffff; `--color-primary` hsl(0 0% 9%) ≈ #171717 (the foreground/CTA
    // ink, identical to the value `app/loading.tsx`/`not-found.tsx` paint
    // against) reads as the brand accent in the OS task switcher.
    background_color: "#ffffff",
    theme_color: "#171717",
  };
}
