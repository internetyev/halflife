// GET /api/health  (L5.8 — deploy-verification probe)
//
// A zero-cost, zero-secret-leak readiness endpoint the human curls right
// after `vercel --prod` to confirm production env wiring is correct WITHOUT
// submitting a paid Claude call. Directly supports docs/launch-checklist.md
// §2 (infrastructure env wiring) and §5 (day-of-deploy verification).
//
// Returns:
//   200 { status: "ok", time, config }   always — the app is up
//
// `config` reports only PRESENCE BOOLEANS for secret-bearing vars
// (`Boolean(process.env.X)`), never their values, so this route is safe to
// leave publicly reachable. The one literal value echoed, `siteUrl`, is the
// `NEXT_PUBLIC_*` canonical origin — public by definition (it ships in every
// OG tag and the sitemap). `/api/*` is already `Disallow`-ed in app/robots.ts
// so crawlers never index this. `Cache-Control: no-store` so a CDN/Vercel
// edge never serves a stale readiness snapshot.
//
// Detection mirrors each consumer's own env check verbatim so "configured
// here" means "that feature will actually work":
//   - anthropic  app/api/analyze/route.ts        ANTHROPIC_API_KEY
//   - kv         lib/cache/role-cache.ts         KV_REST_API_URL + _TOKEN
//   - plunk      lib/email/capture.ts            PLUNK_API_KEY
//   - plausible  components/plausible-analytics  NEXT_PUBLIC_PLAUSIBLE_DOMAIN
//   - siteUrl    app/sitemap.ts / robots.ts      NEXT_PUBLIC_SITE_URL fallback

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    kv:
      Boolean(process.env.KV_REST_API_URL) &&
      Boolean(process.env.KV_REST_API_TOKEN),
    plunk: Boolean(process.env.PLUNK_API_KEY),
    plausible: Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://halflife.work",
  };

  return NextResponse.json(
    {
      status: "ok" as const,
      time: new Date().toISOString(),
      config,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
