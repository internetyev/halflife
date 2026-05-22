// Default site-level Open Graph share card.
//
// Next.js serves this file-convention image at `/opengraph-image` and injects
// the `og:image` tags into every route that does not define its own image —
// i.e. the home page (`app/page.tsx`, a Client Component that can't export
// `metadata`) and the annual report (`app/report/2026/page.tsx`, which sets
// `openGraph`/`twitter` text but no image). Role pages keep their own dynamic
// card via `generateMetadata` → `/api/og/[slug]` and are unaffected (a child
// segment's explicit image wins over this inherited default).
//
// The frame deliberately mirrors the generic card in `app/api/og/[slug]/route.tsx`
// (dark palette + eyebrow + headline + tagline) so every halflife share — role
// card, report, homepage — reads as one brand. Palette is duplicated as inline
// hex because Satori only reads inline styles and the codebase prefers small
// duplication over a shared OG helper (D-027). Edge runtime to match the OG route.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "halflife — How many years until AI replaces your role?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0a0a0a";
const FG = "#fafafa";
const MUTED = "#a3a3a3";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: BG,
          color: FG,
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          halflife
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            marginBottom: "auto",
            gap: 24,
          }}
        >
          <span
            style={{
              fontSize: 96,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            How many years until AI replaces your role?
          </span>
          <span
            style={{
              display: "flex",
              fontSize: 40,
              color: MUTED,
            }}
          >
            Get an obsolescence countdown, survival score, and a pivot roadmap.
          </span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: MUTED,
            letterSpacing: 1,
          }}
        >
          AI Job Obsolescence Clock — countdown, score, pivot.
        </div>
      </div>
    ),
    { ...size },
  );
}
