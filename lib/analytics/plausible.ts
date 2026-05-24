// Tiny SSR-safe Plausible custom-event helper (L5.25).
//
// `components/plausible-analytics.tsx` loads `script.tagged-events.js`, which
// exposes `window.plausible(eventName, options?)`. This helper is the only
// thing UI code (`app/page.tsx`, `components/share-buttons.tsx`) should call
// — it centralises three concerns the call sites would otherwise duplicate:
//
//   1. SSR safety: `typeof window === "undefined"` guards the call so it is
//      safe to import from a Server Component module graph even though the
//      actual call only ever fires inside a client event handler today.
//   2. Self-maintaining no-op: when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is unset
//      `<PlausibleAnalytics>` returns null, the script never loads, and
//      `window.plausible` is undefined — the optional-call below is then a
//      no-op. The dev laptop and unconfigured previews ship zero analytics
//      traffic, matching the L2.9 "unset env var = no-op" invariant.
//   3. Type safety: declares the `window.plausible` shape so a typo in an
//      event name or a non-primitive prop value is a build-time error, not a
//      silent dashboard miss. Props are bounded to `string | number | boolean`
//      — exactly what Plausible's custom-property storage accepts and reports
//      on; richer shapes (arrays/objects) get JSON.stringified by the wire
//      and read as opaque blobs in the dashboard, so the type narrows the
//      contract here.
//
// Why not call `window.plausible?.(…)` inline at each call site: putting the
// guard + the type declaration in one module means a future event name lands
// as one new `trackEvent("...")` call instead of four lines of boilerplate,
// and `docs/launch-checklist.md` §2's "register the goal in Plausible" step
// stays a 1:1 mirror of `git grep "trackEvent("`.

export type PlausibleProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: PlausibleProps },
    ) => void;
  }
}

export function trackEvent(event: string, props?: PlausibleProps): void {
  if (typeof window === "undefined") return;
  window.plausible?.(event, props ? { props } : undefined);
}
