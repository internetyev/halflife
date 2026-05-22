import type { Metadata } from "next";
import { PlausibleAnalytics } from "@/components/plausible-analytics";
import "./globals.css";

const TITLE = "halflife — AI Job Obsolescence Clock";
const DESCRIPTION =
  "How many years until AI replaces your role? Get an obsolescence countdown, survival score, and a concrete pivot roadmap.";

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
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
