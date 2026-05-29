// Default site-level Apple touch icon — the 180×180 companion to L5.31's
// `app/icon.tsx` (D-061).
//
// Next.js serves this file-convention image at `/apple-icon` and auto-injects
// `<link rel="apple-touch-icon" sizes="180x180" href="/apple-icon">` into
// every route's `<head>` — no `app/layout.tsx` wiring. This is the iOS
// home-screen / iPadOS / macOS-Safari pinned-tab surface that the 32×32
// favicon cannot serve: when a user "Add to Home Screen"s the site, Safari
// reads this image (not the favicon or the L5.11 manifest icon) for the app
// icon, and renders the bare-default 60×60 generic page snapshot if absent —
// the same gap the bare-default favicon was for browser tabs before L5.31.
//
// Mechanism mirrors `app/icon.tsx` (L5.31/D-061) and `app/opengraph-image.tsx`
// (L5.12/D-042): Satori via `next/og`, edge runtime, returned by a default
// export. Stays inside D-041's "no fabricated binary brand artwork" boundary
// by going through the same code path as L5.12/L5.31 — generated each
// build/edge-cache miss from the same inline-hex palette literals; a future
// human-supplied brand mark drops in by replacing this file with
// `app/apple-icon.png` (Next's same file convention picks either, no other
// code edit needed).
//
// 180×180 is Apple's de-facto current size (covers every iOS device since the
// 6 Plus retina @3x; older devices downscale cleanly — Apple's own guidance
// is to ship one 180×180 and let the OS scale). Renders the same filled
// `#0a0a0a` square + bold lowercase `#fafafa` `h` as the 32×32 favicon so the
// two surfaces read as one brand at every scale, with the font size scaled
// proportionally (favicon 22/32 ≈ 0.69 of the side → 180×0.69 ≈ 124 here).
// iOS does NOT apply its rounded-corner mask to PNGs from `apple-touch-icon`
// since iOS 7, so this ships as a square just like every modern iOS app
// icon — Safari/iPadOS/macOS dock all render it directly.
//
// Why this is a separate file from `app/icon.tsx`, not a shared export: the
// `size` and `fontSize` differ by an order of magnitude (32×32 vs. 180×180),
// and Next's file-convention resolver reads each `*-icon.tsx` independently
// for its `size`/`contentType` exports — sharing the JSX would still require
// two distinct module files with different `size` constants, so one file
// per surface is the cleanest expression.

import { ImageResponse } from "next/og";

export const runtime = "edge";
// 180×180 is Apple's standard apple-touch-icon size since iOS 7; older
// devices downscale cleanly from this single source.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BG = "#0a0a0a";
const FG = "#fafafa";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: BG,
          color: FG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 124,
          fontWeight: 700,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: -6,
        }}
      >
        h
      </div>
    ),
    { ...size },
  );
}
