// Branded loading skeleton (L5.10). The third App Router special-file in
// the not-found (L5.6) / error (L5.9) / loading trio: Next.js renders this
// as the Suspense fallback while a route segment streams. The realistic
// hit is a navigation to `app/role/[slug]/page.tsx` or
// `app/report/2026/page.tsx` — server components that read committed JSON
// (and, post-L3.2b seed, fall through to a KV round-trip) — where the
// previous behaviour was a blank frame until the server work resolved.
//
// Server Component — no interactivity, pure markup. It renders *inside*
// `app/layout.tsx`, so it must NOT emit its own `<html>`/`<body>`; it
// mirrors the `<main>` shell + CSS-var palette of `app/page.tsx` /
// `not-found.tsx` so the skeleton occupies the same frame the real page
// will, avoiding a layout jump when content swaps in. `--color-muted` is
// the skeleton fill (defined for both light and dark in `globals.css`).
// `role="status"` + `aria-busy` + the sr-only label announce the wait to
// assistive tech; the bars are `aria-hidden` decoration.

export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16"
    >
      <span className="sr-only">Loading…</span>
      <div
        aria-hidden="true"
        className="flex w-full max-w-md flex-col items-center gap-4"
      >
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-muted)]" />
        <div className="h-9 w-3/4 animate-pulse rounded bg-[var(--color-muted)]" />
        <div className="mt-4 h-40 w-full animate-pulse rounded-lg bg-[var(--color-muted)]" />
        <div className="flex w-full gap-3">
          <div className="h-9 flex-1 animate-pulse rounded-md bg-[var(--color-muted)]" />
          <div className="h-9 flex-1 animate-pulse rounded-md bg-[var(--color-muted)]" />
        </div>
      </div>
    </main>
  );
}
