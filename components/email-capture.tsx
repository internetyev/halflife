"use client";

// Email-capture form (L5.4a). Posts to /api/subscribe and renders
// idle / loading / success / soft-error states inline. Styling reuses the
// CSS-variable palette and plain-bordered-control convention established by
// `components/share-buttons.tsx` (D-022) — no shadcn primitive pulled in
// just for this (D-015).
//
// Graceful when capture is not live: a 503 `{ configured: false }` (the
// PLUNK_API_KEY-unset state until the human runs L5.4b) is shown as a calm
// "opens at launch" note, NOT a red error — the routine ships the page now
// and it starts working the instant the key lands, no code change.

import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "pending-launch" } // 503: not configured yet
  | { kind: "error"; message: string };

export function EmailCapture({ source = "report-2026" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (res.ok) {
        setState({ kind: "ok" });
        setEmail("");
        return;
      }
      if (res.status === 503) {
        setState({ kind: "pending-launch" });
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setState({
        kind: "error",
        message: data?.error ?? "Something went wrong — please try again.",
      });
    } catch {
      setState({
        kind: "error",
        message: "Network error — please try again.",
      });
    }
  }

  if (state.kind === "ok") {
    return (
      <p className="text-sm text-[var(--color-foreground)]">
        You&rsquo;re on the list — we&rsquo;ll email you when the ranking
        updates.
      </p>
    );
  }

  if (state.kind === "pending-launch") {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Email updates open at launch — check back shortly.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <label htmlFor="capture-email" className="sr-only">
        Email address
      </label>
      <input
        id="capture-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@work.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-foreground)]"
      />
      <button
        type="submit"
        disabled={state.kind === "loading"}
        className="shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-2 text-sm font-medium hover:border-[var(--color-foreground)] disabled:opacity-60"
      >
        {state.kind === "loading" ? "Adding…" : "Notify me"}
      </button>
      {state.kind === "error" && (
        <p
          role="alert"
          className="text-xs text-red-600 dark:text-red-400 sm:basis-full"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
