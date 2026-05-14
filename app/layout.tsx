import type { Metadata } from "next";
import { PlausibleAnalytics } from "@/components/plausible-analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "halflife — AI Job Obsolescence Clock",
    template: "%s · halflife",
  },
  description:
    "How many years until AI replaces your role? Get an obsolescence countdown, survival score, and a concrete pivot roadmap.",
  metadataBase: new URL("https://halflife.work"),
  robots: { index: true, follow: true },
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
