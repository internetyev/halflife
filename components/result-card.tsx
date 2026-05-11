import type { ConfidenceLevel, RoleAnalysisResult } from "@/lib/scoring/types";

type CacheState = "HIT" | "MISS";

interface ResultCardProps {
  result: RoleAnalysisResult;
  cache: CacheState;
}

interface ScoreBand {
  label: string;
  blurb: string;
  // Tailwind utility for the gauge fill — kept as plain class strings so the
  // JIT picks them up without a safelist.
  fill: string;
  pill: string;
}

// Bands mirror docs/methodology.md "From score to countdown" so the visual
// label and the numeric countdown agree.
function bandFor(score: number): ScoreBand {
  if (score < 20)
    return {
      label: "Urgent",
      blurb: "The entry-level version of this role is hollowing out now.",
      fill: "bg-red-500",
      pill: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
    };
  if (score < 40)
    return {
      label: "At risk",
      blurb: "Tools to compress this role are shipping and being adopted.",
      fill: "bg-orange-500",
      pill: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    };
  if (score < 60)
    return {
      label: "Contested",
      blurb: "Parts of the role compress; the human still owns the loop.",
      fill: "bg-amber-500",
      pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    };
  if (score < 80)
    return {
      label: "Durable",
      blurb: "Recognisable form persists across the next decade.",
      fill: "bg-emerald-500",
      pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    };
  return {
    label: "Stable",
    blurb: "Irreducibly human work; AI augments more than it replaces.",
    fill: "bg-sky-500",
    pill: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
  };
}

const CONFIDENCE_COPY: Record<ConfidenceLevel, string> = {
  high: "Well-known role with an unambiguous AI-tool landscape.",
  medium: "Recognisable role; the displacement story is still unfolding.",
  low: "Rare or jargon-heavy title — treat the countdown as directional.",
};

export function ResultCard({ result, cache }: ResultCardProps) {
  const band = bandFor(result.score);
  const countdownStr = result.countdown_years.toFixed(1);
  const isLowConfidence = result.confidence === "low";

  return (
    <article className="flex flex-col gap-7 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-6 shadow-sm">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Analysed role
          </p>
          <h2 className="mt-1 truncate text-xl font-semibold capitalize sm:text-2xl">
            {result.normalized_title}
          </h2>
          {result.normalized_title.toLowerCase() !==
            result.input_title.trim().toLowerCase() && (
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              You typed “{result.input_title}” — collapsed to a canonical form.
            </p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${band.pill}`}
        >
          {band.label}
        </span>
      </header>

      <section
        aria-labelledby="countdown-heading"
        className="flex flex-col gap-1"
      >
        <p
          id="countdown-heading"
          className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]"
        >
          Years until AI plausibly handles ≥50% of the work
        </p>
        <p className="flex items-baseline gap-2">
          <span className="text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
            {countdownStr}
          </span>
          <span className="text-base text-[var(--color-muted-foreground)]">
            years
          </span>
        </p>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {band.blurb}
        </p>
      </section>

      <section aria-labelledby="score-heading" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          <span id="score-heading">Survival score</span>
          <span>
            <span className="text-base font-semibold tabular-nums text-[var(--color-foreground)]">
              {result.score}
            </span>
            <span> / 100</span>
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={result.score}
          aria-label={`Survival score: ${result.score} of 100 (${band.label})`}
        >
          <div
            className={`h-full rounded-full transition-[width] ${band.fill}`}
            style={{ width: `${result.score}%` }}
          />
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Higher = more durable. Lower = more compressible by current-gen AI.
        </p>
      </section>

      <section
        aria-labelledby="confidence-heading"
        className="flex flex-col gap-1"
      >
        <p
          id="confidence-heading"
          className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]"
        >
          Confidence
        </p>
        <p className="text-sm">
          <span className="font-medium capitalize">{result.confidence}</span>
          <span className="text-[var(--color-muted-foreground)]">
            {" "}
            — {CONFIDENCE_COPY[result.confidence]}
          </span>
        </p>
        {isLowConfidence && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Low-confidence result. The numbers are directional — verify against
            the sources hint below before quoting them.
          </p>
        )}
      </section>

      {result.ai_tools.length > 0 && (
        <section aria-labelledby="tools-heading">
          <h3
            id="tools-heading"
            className="text-sm font-semibold"
          >
            AI tools already chipping away
          </h3>
          <ul className="mt-3 flex flex-col gap-3">
            {result.ai_tools.map((t) => (
              <li
                key={`${t.vendor}:${t.name}`}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)]/40 px-3 py-2"
              >
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {t.vendor}
                  </span>
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {t.what_it_automates}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.pivot_steps.length > 0 && (
        <section aria-labelledby="pivot-heading">
          <h3 id="pivot-heading" className="text-sm font-semibold">
            Pivot steps
          </h3>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {result.pivot_steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[10px] font-semibold tabular-nums text-[var(--color-muted-foreground)]"
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {result.sources_hint.length > 0 && (
        <section aria-labelledby="sources-heading">
          <h3
            id="sources-heading"
            className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]"
          >
            Verify against
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {result.sources_hint.map((s) => (
              <li
                key={s}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/40 px-2.5 py-1 text-xs text-[var(--color-muted-foreground)]"
              >
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--color-border)] pt-3 text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        <span>cache {cache}</span>
        <span aria-hidden="true">·</span>
        <span>methodology v{result.methodology_version}</span>
        <span aria-hidden="true">·</span>
        <span>prompt v{result.prompt_version}</span>
      </footer>
    </article>
  );
}
