import type { NextConfig } from "next";

// Security response headers (L5.7). The crawl/index trio is now complete
// (`app/sitemap.ts` L3.3, `app/robots.ts` L5.5, `app/not-found.tsx` L5.6); the
// remaining pre-launch hardening gap is HTTP security headers. `next.config.ts`
// is the right place: `headers()` applies at the edge to *every* response
// (pages, API routes, the OG image, static assets) with no per-route wiring and
// no middleware — the same self-maintaining, zero-env-wiring philosophy as the
// metadata-route trio. `docs/launch-checklist.md` can now tick "security
// headers set" without a code change at deploy time.
//
// The split below is deliberate and the central design decision (see D-037):
//
//   - The six headers in `HARDENING_HEADERS` are unambiguously safe to ENFORCE
//     now. None can blank-page the app: they harden transport, sniffing,
//     framing, referrer leakage, and powerful-feature access. Shipping them
//     enforced is pure upside.
//
//   - The Content-Security-Policy is shipped in *Report-Only* mode. The Next.js
//     App Router injects inline bootstrap/hydration `<script>` and inline
//     styles; an ENFORCED `script-src`/`style-src` without a per-request nonce
//     would break hydration and paint a blank page. A correct enforced CSP
//     needs nonce propagation via `middleware.ts` (the Next-documented
//     approach) — a larger, riskier change with its own test surface, so it is
//     deferred to its own future leaf / human deploy step. Report-Only gives
//     the human real violation telemetry from production traffic to tighten the
//     policy against, with zero risk of a broken launch. This mirrors the
//     project-wide "self-maintaining, never ship a state that breaks the live
//     surface" principle (D-027/D-031/D-036) applied to security headers.
//
// `'unsafe-inline'` appears in the Report-Only `script-src`/`style-src` only so
// the *current* nonce-less app would not flood the report endpoint with noise
// that hides real violations; the enforced-CSP leaf will drop it in favour of
// nonces. The single external origin allowed is `https://plausible.io`
// (script + connect) — the L2.9 analytics snippet, the only third-party the app
// loads. `img-src` allows `data:`/`blob:` because the Satori OG route
// (`app/api/og/[slug]/route.tsx`) and Next image pipeline emit those.
const SECURITY_HEADERS = [
  // Force HTTPS for two years incl. subdomains; `preload` opts into the browser
  // preload list. Safe to enforce: the site is HTTPS-only on Vercel (L5.2) and
  // a header on an HTTP response is simply ignored by browsers.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Block MIME-type sniffing — stops a JSON/text response being reinterpreted
  // as executable. No legitimate response in this app relies on sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Disallow framing entirely (clickjacking). Nothing in this product is meant
  // to be embedded; the share primitive is a link, not an iframe widget.
  { key: "X-Frame-Options", value: "DENY" },
  // Send origin only on cross-origin navigations — keeps the analysed job title
  // in the path from leaking in full to third parties via the Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deny powerful features the app never uses (defence-in-depth against an
  // injected script trying to reach them). `browsing-topics=()` also opts the
  // site out of the Topics API.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Allow DNS prefetch — a performance hint, safe and intentional alongside the
  // restrictive set above.
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

// Report-Only: the browser evaluates and reports violations but never blocks,
// so this cannot break the live app. Tighten + flip to enforce in the future
// nonce-based-CSP leaf once `middleware.ts` propagates a per-request nonce.
const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline' https://plausible.io",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://plausible.io",
  "upgrade-insecure-requests",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Every path, including API routes, the OG image, and static assets.
        source: "/:path*",
        headers: [
          ...SECURITY_HEADERS,
          {
            key: "Content-Security-Policy-Report-Only",
            value: CONTENT_SECURITY_POLICY_REPORT_ONLY,
          },
        ],
      },
    ];
  },
};

export default config;
