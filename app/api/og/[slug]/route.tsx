// GET /api/og/[slug]
//
// Renders the 1200×630 share card for a role. Source of truth is the KV
// cache: a slug that has been analyzed at least once renders a numbers card
// (role title + countdown + score band). A slug that has not been seen — or
// any visit when KV is unconfigured — renders a generic "score your role"
// card so LinkedIn / Twitter previews never break on a fresh slug.
//
// Runtime is `edge` because (a) `next/og` is built for it, (b) the only I/O
// is the KV REST client which is fetch-based and edge-compatible, and
// (c) share previews are latency-sensitive: a crawler that times out drops
// the image silently.

import { ImageResponse } from "next/og";

import { getCachedRoleBySlug } from "@/lib/cache/role-cache";
import type { RoleAnalysisResult } from "@/lib/scoring/types";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

interface Band {
  label: string;
  blurb: string;
  // Hex (not Tailwind classes) because Satori only reads inline styles.
  color: string;
  trackColor: string;
}

// Mirrors the visual taxonomy in `components/result-card.tsx` (D-019) so the
// share card and the on-page card use identical band labels + colours.
function bandFor(score: number): Band {
  if (score < 20)
    return {
      label: "Urgent",
      blurb: "The entry-level version of this role is hollowing out now.",
      color: "#ef4444",
      trackColor: "rgba(239, 68, 68, 0.18)",
    };
  if (score < 40)
    return {
      label: "At risk",
      blurb: "Tools to compress this role are shipping and being adopted.",
      color: "#f97316",
      trackColor: "rgba(249, 115, 22, 0.18)",
    };
  if (score < 60)
    return {
      label: "Contested",
      blurb: "Parts of the role compress; the human still owns the loop.",
      color: "#f59e0b",
      trackColor: "rgba(245, 158, 11, 0.18)",
    };
  if (score < 80)
    return {
      label: "Durable",
      blurb: "Recognisable form persists across the next decade.",
      color: "#10b981",
      trackColor: "rgba(16, 185, 129, 0.18)",
    };
  return {
    label: "Stable",
    blurb: "Irreducibly human work; AI augments more than it replaces.",
    color: "#0ea5e9",
    trackColor: "rgba(14, 165, 233, 0.18)",
  };
}

const BG = "#0a0a0a";
const FG = "#fafafa";
const MUTED = "#a3a3a3";
const BORDER = "#262626";

function RoleCard({ result }: { result: RoleAnalysisResult }) {
  const band = bandFor(result.score);
  const countdownStr = result.countdown_years.toFixed(1);

  return (
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
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 28,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        <span>halflife</span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            border: `1px solid ${band.color}`,
            color: band.color,
            backgroundColor: band.trackColor,
            padding: "8px 20px",
            borderRadius: 999,
            fontSize: 26,
            letterSpacing: 1,
            textTransform: "none",
          }}
        >
          {band.label}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 56,
        }}
      >
        <span style={{ fontSize: 26, color: MUTED, letterSpacing: 1 }}>
          Years until AI plausibly handles ≥50% of the work
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginTop: 12,
            gap: 24,
          }}
        >
          <span
            style={{
              fontSize: 220,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: -4,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {countdownStr}
          </span>
          <span style={{ fontSize: 48, color: MUTED }}>years</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
          fontSize: 40,
          fontWeight: 600,
          textTransform: "capitalize",
        }}
      >
        {result.normalized_title}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: "auto",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 22,
            color: MUTED,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          <span>Survival score</span>
          <span style={{ color: FG, fontSize: 28, fontWeight: 600 }}>
            {result.score} / 100
          </span>
        </div>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 14,
            backgroundColor: BORDER,
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              width: `${result.score}%`,
              height: "100%",
              backgroundColor: band.color,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function GenericCard({ slug }: { slug: string }) {
  const prettySlug = slug.replace(/-/g, " ");
  return (
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
        {prettySlug && (
          <span
            style={{
              display: "flex",
              fontSize: 40,
              color: MUTED,
              textTransform: "capitalize",
            }}
          >
            Score your role — start with “{prettySlug}”.
          </span>
        )}
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
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;
  const safeSlug = (slug ?? "").slice(0, 200);

  const cached = await getCachedRoleBySlug(safeSlug);

  // 1 hour at the edge, 1 day at the CDN, stale-while-revalidate for a week —
  // share-card crawlers re-fetch on a long tail, so cheap re-renders dominate.
  const cacheControl =
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

  if (!cached) {
    return new ImageResponse(<GenericCard slug={safeSlug} />, {
      ...size,
      headers: { "cache-control": cacheControl },
    });
  }

  return new ImageResponse(<RoleCard result={cached.result} />, {
    ...size,
    headers: { "cache-control": cacheControl },
  });
}
