"use client";

import { useState, type FormEvent } from "react";

import { ResultCard } from "@/components/result-card";
import { ShareButtons } from "@/components/share-buttons";
import { trackEvent } from "@/lib/analytics/plausible";
import { slugify } from "@/lib/scoring";
import type { RoleAnalysisResult } from "@/lib/scoring/types";

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "result"; result: RoleAnalysisResult; cache: "HIT" | "MISS" };

const TITLE_MAX_LENGTH = 200;

export default function HomePage() {
  const [title, setTitle] = useState("");
  const [view, setView] = useState<ViewState>({ status: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0 || view.status === "loading") return;

    setView({ status: "loading" });

    let res: Response;
    try {
      res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch (err) {
      setView({
        status: "error",
        message:
          err instanceof Error ? err.message : "Network request failed.",
      });
      return;
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      setView({
        status: "error",
        message: `Unexpected response (HTTP ${res.status}).`,
      });
      return;
    }

    if (!res.ok) {
      const message =
        typeof (payload as { error?: unknown })?.error === "string"
          ? (payload as { error: string }).error
          : `Request failed (HTTP ${res.status}).`;
      setView({ status: "error", message });
      return;
    }

    const cache = res.headers.get("x-halflife-cache") === "HIT" ? "HIT" : "MISS";
    setView({
      status: "result",
      result: payload as RoleAnalysisResult,
      cache,
    });
    // L5.25 — fires the `form-submit` goal docs/launch-checklist.md §2 stubs.
    // Fired *only* on a successful 200 (after the early returns above), so the
    // dashboard counts completed analyses, not abandoned/errored submits;
    // `cache` lets the dashboard distinguish a paid Claude call from a free
    // KV-cached one, which is the single most useful split for the p50
    // cost-per-result KPI in PLAN.md (§ Phase-1 success metric).
    trackEvent("form-submit", { cache });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          halflife
        </h1>
        <p className="mt-3 text-base text-[var(--color-muted-foreground)] sm:text-lg">
          AI job obsolescence clock — countdown, survival score, and a pivot
          roadmap for any role.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-3">
        <label
          htmlFor="role-title"
          className="text-sm font-medium"
        >
          Job title
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="role-title"
            name="title"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="e.g. paralegal, junior copywriter, radiologist"
            maxLength={TITLE_MAX_LENGTH}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={view.status === "loading"}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              view.status === "loading" || title.trim().length === 0
            }
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {view.status === "loading" ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </form>

      <section className="mt-10" aria-live="polite">
        {view.status === "idle" && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Enter a role to see its obsolescence countdown, the AI tools
            already chipping away at it, and concrete pivot steps.
          </p>
        )}

        {view.status === "loading" && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Asking Claude… first analysis of a role takes ~10 seconds.
          </p>
        )}

        {view.status === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {view.message}
          </p>
        )}

        {view.status === "result" && (
          <div className="flex flex-col gap-4">
            <ResultCard result={view.result} cache={view.cache} />
            <ShareButtons
              slug={slugify(view.result.normalized_title).slice(0, 200)}
              title={view.result.normalized_title}
              score={view.result.score}
              countdownYears={view.result.countdown_years}
            />
          </div>
        )}
      </section>

      <footer className="mt-auto pt-12 text-xs text-[var(--color-muted-foreground)]">
        Share buttons link to <code>/role/[slug]</code> so the OG image
        and metadata travel with the link.
      </footer>
    </main>
  );
}
