// Branded 404 (L5.6). Next.js serves this for `notFound()` and any
// unmatched path. The dominant caller is `app/role/[slug]/page.tsx`, which
// `notFound()`s every slug that has no precomputed JSON and no KV hit —
// i.e. *every* role slug until the human-gated seed pass (L3.2b) lands, so
// until launch this is the most-hit role-page state for crawlers and early
// or mistyped share links. Next's bare default not-found UI wastes that
// traffic; this routes the visitor straight to the core conversion action
// (the home analyzer).
//
// Server Component — no interactivity, just an internal `Link` home. It
// renders *inside* `app/layout.tsx`, so it must NOT emit its own
// `<html>`/`<body>`; it mirrors the `<main>` shell of `app/page.tsx` for a
// consistent frame. Next.js already sets HTTP 404 for this file (a real
// 404, not a soft-404 — good for SEO); `metadata.robots` below is
// defence-in-depth so a crawler that ignores status never indexes the
// not-found body as a thin page (the root layout otherwise sets
// index:true).

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium tracking-widest text-[var(--color-muted-foreground)]">
        404
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        No reading for that role yet
      </h1>
      <p className="mt-4 max-w-md text-base text-[var(--color-muted-foreground)]">
        That page doesn&rsquo;t exist, or the role hasn&rsquo;t been analyzed
        yet. Type any job title on the home page to get its obsolescence
        countdown, survival score, and a concrete pivot roadmap.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90"
        >
          Analyze a role
        </Link>
        <Link
          href="/report/2026"
          className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:border-[var(--color-foreground)]"
        >
          See the 2026 ranking
        </Link>
      </div>
    </main>
  );
}
