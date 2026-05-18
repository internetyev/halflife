"use client";

// Root-layout error boundary (L5.9). This is the *only* boundary that fires
// when `app/layout.tsx` itself throws (e.g. a bad import or a render-time
// failure in `<PlausibleAnalytics />`). Because the layout has failed, Next.js
// renders this component *instead of* the root layout — so unlike
// `app/error.tsx` it MUST supply its own `<html>` and `<body>`, and it does
// NOT get `app/globals.css` (that import lives in the bypassed layout). Hence
// the palette is inlined as literal hsl() values copied verbatim from the
// light-theme block of `app/globals.css` — no Tailwind class or CSS var
// resolves in this context. Kept deliberately minimal: this path means the
// app shell is broken, so the only safe promise is "reload"; there is no
// `next/link` (routing may be compromised) — a hard `location.reload()` via
// `reset()` and a plain `<a href="/">` are the durable escape hatches.
//
// This is intentionally rare-path defence-in-depth: `app/error.tsx` catches
// the realistic golden-path failures; `global-error.tsx` only covers the
// catastrophic "layout won't even render" case so the user still sees an
// on-brand page instead of a stack trace or a blank document.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 1.5rem",
          textAlign: "center",
          background: "hsl(0 0% 100%)",
          color: "hsl(0 0% 3.9%)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 500,
            letterSpacing: "0.1em",
            color: "hsl(0 0% 45.1%)",
          }}
        >
          SOMETHING BROKE
        </p>
        <h1
          style={{
            marginTop: "0.75rem",
            fontSize: "2rem",
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          halflife hit an error
        </h1>
        <p
          style={{
            marginTop: "1rem",
            maxWidth: "28rem",
            fontSize: "1rem",
            color: "hsl(0 0% 45.1%)",
          }}
        >
          The page failed to load. This is almost always transient — reload to
          try again.
        </p>
        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: "0.375rem",
              border: "none",
              background: "hsl(0 0% 9%)",
              color: "hsl(0 0% 98%)",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          <a
            href="/"
            style={{
              borderRadius: "0.375rem",
              border: "1px solid hsl(0 0% 89.8%)",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "inherit",
              textDecoration: "none",
            }}
          >
            Back to home
          </a>
        </div>
        {error.digest ? (
          <p
            style={{
              marginTop: "2rem",
              fontSize: "0.75rem",
              color: "hsl(0 0% 45.1%)",
            }}
          >
            Reference: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
