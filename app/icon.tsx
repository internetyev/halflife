// Default site-level favicon.
//
// Next.js serves this file-convention image at `/icon` and injects the
// `<link rel="icon">` tags into every route — closing the only metadata-route
// gap left after L5.5/L5.11/L5.12 (robots / manifest / opengraph-image): the
// bare-default browser-tab icon. A favicon is what every browser bookmark,
// open-tab strip, and history entry renders as the brand's smallest visual
// surface, and "the bare globe / first-letter circle" is the launch state
// L5.11/D-041 explicitly noted needed a follow-up.
//
// Mechanism mirrors L5.12's `app/opengraph-image.tsx` (D-042): Satori via
// `next/og`, edge runtime, returned by a default export. This is the
// "fabricate from code" path D-041 ring-fenced explicitly against the
// "fabricate a binary brand asset" boundary — the icon is generated each
// build/edge-cache miss from the same inline-hex palette the OG cards already
// use, so there is no committed `.png`/`.ico` byte payload and no human
// design call. A future human-supplied brand mark drops in by replacing this
// file with `app/icon.png` (Next's same file convention picks either).
//
// The 32×32 surface is too small for the OG card's "halflife" wordmark, so
// the icon renders the wordmark's initial — a filled square with a bold
// lowercase `h` — using the dark/light palette of the OG card. This stays
// recognisable in both light- and dark-mode browser chrome (the square's
// `#0a0a0a` background reads as a stable shape against a white tab bar; the
// `#fafafa` `h` reads against any dark tab bar). One layer, no gradients —
// Satori at this size is happiest with solid fills.

import { ImageResponse } from "next/og";

export const runtime = "edge";
// 32×32 is the de-facto browser-tab favicon size; Chrome/Firefox/Safari all
// scale up cleanly from this for the address-bar / bookmark surfaces.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const BG = "#0a0a0a";
const FG = "#fafafa";

export default function Icon() {
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
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: -1,
        }}
      >
        h
      </div>
    ),
    { ...size },
  );
}
