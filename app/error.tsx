"use client";

// Branded route-segment error boundary (L5.9). Next.js renders this when a
// Server or Client Component below `app/layout.tsx` throws at request/render
// time. The realistic caller is the golden path: `app/page.tsx` → fetch
// `/api/analyze`, or `app/role/[slug]/page.tsx` / `app/report/2026/page.tsx`
// reading committed JSON — any of which can throw on a transient upstream
// (Claude/KV) failure or a malformed data file. Without this file Next.js
// shows its bare default error UI; on a launch surface that is a dead end.
// This is the runtime-error parallel of L5.6's `app/not-found.tsx`: same
// `<main>` shell + CSS-var palette, same "route the visitor to the core
// conversion action" intent, so a failed analyze still lands on a usable,
// on-brand page with a way forward.
//
// Must be a Client Component (Next.js error boundaries are client-only) and
// it renders *inside* `app/layout.tsx`, so it must NOT emit its own
// `<html>`/`<body>` — `app/global-error.tsx` is the separate boundary for a
// throw in the root layout itself. `reset()` re-renders the failed segment
// in place, which clears transient upstream blips (a timed-out Claude call)
// without a full navigation; the `Link` home is the durable escape hatch.
// Not indexable by construction (error responses are not crawled), so no
// `metadata` is needed — `error.tsx` cannot export `metadata` anyway.

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console / Plausible-adjacent error pipeline.
    // No PII: `error.message` here is our own thrown text, never user input.
    console.error("halflife route error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium tracking-widest text-[var(--color-muted-foreground)]">
        SOMETHING BROKE
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        That reading didn&rsquo;t come through
      </h1>
      <p className="mt-4 max-w-md text-base text-[var(--color-muted-foreground)]">
        A step failed while analyzing — usually a brief upstream hiccup, not
        your role. Try again; if it keeps failing, head back and start a fresh
        analysis.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:border-[var(--color-foreground)]"
        >
          Back to the analyzer
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-8 text-xs text-[var(--color-muted-foreground)]">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
