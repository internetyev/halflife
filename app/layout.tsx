import type { Metadata, Viewport } from "next";
import { PlausibleAnalytics } from "@/components/plausible-analytics";
import { SiteFooter } from "@/components/site-footer";
import { serializeSiteJsonLd } from "@/lib/seo/json-ld";
import "./globals.css";

const TITLE = "halflife — AI Job Obsolescence Clock";
const DESCRIPTION =
  "How many years until AI replaces your role? Get an obsolescence countdown, survival score, and a concrete pivot roadmap.";

// Media-aware mobile-chrome tint and color-scheme hint. The manifest's
// `theme_color` (L5.11/D-041) is single-value and pins the *splash screen*
// brand accent; this `themeColor` array tints the per-page browser chrome
// (Chrome Android address bar, Safari iOS status bar) to match the page
// surface in either theme, so the top of viewport blends into the page
// background instead of clashing on dark-mode loads. Hex values match the
// `--color-background` tokens in `app/globals.css` light/dark blocks.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: "%s · halflife",
  },
  description: DESCRIPTION,
  metadataBase: new URL("https://halflife.work"),
  robots: { index: true, follow: true },
  // Base share metadata for the home page (a Client Component that can't export
  // its own `metadata`) and the default for any route that doesn't override it.
  // The `og:image`/`twitter:image` come from the file conventions
  // `app/opengraph-image.tsx` / `app/twitter-image.tsx`, inherited site-wide.
  openGraph: {
    type: "website",
    siteName: "halflife",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <PlausibleAnalytics />
        {/* Site-level brand-entity JSON-LD (L5.16). Every route inherits
            this Organization + WebSite graph from the root layout; role
            pages add their own richer Article + FAQPage graph on top
            (Google merges the Organization node by `@id`). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeSiteJsonLd() }}
        />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
