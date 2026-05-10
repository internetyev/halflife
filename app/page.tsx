"use client";

import { useState, type FormEvent } from "react";

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

        {view.status === "result" && <ResultPreview view={view} />}
      </section>

      <footer className="mt-auto pt-12 text-xs text-[var(--color-muted-foreground)]">
        Polished result card lands in L2.5. This page renders the raw fields
        so the L2.4 form is end-to-end testable against `/api/analyze`.
      </footer>
    </main>
  );
}

function ResultPreview({
  view,
}: {
  view: { status: "result"; result: RoleAnalysisResult; cache: "HIT" | "MISS" };
}) {
  const r = view.result;
  return (
    <article className="flex flex-col gap-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {r.normalized_title}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-3xl font-semibold">
            {r.countdown_years} <span className="text-base font-normal">years</span>
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            survival score{" "}
            <span className="font-medium text-[var(--color-foreground)]">
              {r.score}/100
            </span>{" "}
            · confidence {r.confidence}
          </p>
        </div>
      </div>

      {r.ai_tools.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">AI tools already chipping away</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {r.ai_tools.map((t) => (
              <li key={`${t.vendor}:${t.name}`}>
                <span className="font-medium">{t.name}</span>{" "}
                <span className="text-[var(--color-muted-foreground)]">
                  ({t.vendor}) — {t.what_it_automates}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.pivot_steps.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">Pivot steps</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {r.pivot_steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        cache {view.cache} · methodology v{r.methodology_version} · prompt v
        {r.prompt_version}
      </p>
    </article>
  );
}
