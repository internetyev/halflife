import Script from "next/script";

// L2.9 shipped the page-view tag (`script.js`); L5.25 swaps the source to
// `script.tagged-events.js` so the same defer/afterInteractive load *also*
// exposes `window.plausible(eventName, options?)` for the two custom-event
// goals `docs/launch-checklist.md` §2 already names — `form-submit` (fired
// from `app/page.tsx` after a successful `/api/analyze`) and `share-click`
// (fired from `components/share-buttons.tsx` per channel). `tagged-events.js`
// is a strict superset of `script.js`: it still auto-tracks pageviews. The
// L5.7 Content-Security-Policy already allowlists `https://plausible.io`
// (script-src + connect-src), so the filename swap stays inside the existing
// allowlist with zero next.config.ts churn. The "unset domain ⇒ render
// nothing" guard below means the dev laptop and unconfigured previews still
// ship zero analytics traffic (the L5.25 helper's `window.plausible?.(…)`
// optional-call is the parallel no-op on the JS side).
export function PlausibleAnalytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  return (
    <Script
      defer
      data-domain={domain}
      src="https://plausible.io/js/script.tagged-events.js"
      strategy="afterInteractive"
    />
  );
}
