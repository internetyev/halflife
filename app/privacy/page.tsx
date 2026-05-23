// Privacy notice (L5.13). Closes the `docs/launch-checklist.md` §4 gate
// that wants a privacy note at `/privacy` (or in a footer). Plain
// Server Component, no `<html>`/`<body>` (renders inside `app/layout.tsx`),
// mirrors the `<main>` shell + CSS-var palette of `app/not-found.tsx` so
// every static-text surface reads the same.
//
// What this page commits to is constrained by what the codebase actually
// does — not what a generic CYA template would say:
//
//   - Plausible (L2.9 / D-012) is cookieless and IP-anonymised, so we do
//     not ship a cookie banner and do not need GDPR consent for analytics.
//   - The analyze flow (L2.2/L2.3 / D-005, D-008, D-009) takes a job title,
//     sends it to Anthropic for scoring, and caches the public result fields
//     in Vercel KV for 30 days keyed by the slugified title — no IP, no
//     account, no fingerprint persisted with the result.
//   - The email capture (L5.4a / D-034) only stores an address in Plunk
//     when the visitor opts in by submitting the report-page form, and is
//     a no-op (`status: "not-configured"`) until L5.4b sets PLUNK_API_KEY.
//
// `metadata.robots: { index: true, follow: true }` (the layout default) is
// fine — a privacy page is a legitimately indexable page, unlike the 404.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What halflife collects, what we don't, and where data goes — Plausible (cookieless), Vercel KV (30-day role cache), Anthropic (role analysis), Plunk (opt-in email).",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-[var(--color-muted-foreground)]">
        Privacy
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        What we collect, and what we don&rsquo;t
      </h1>
      <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
        Plain English. If anything below stops being true, the change lands in
        the same commit that changes the behaviour.
      </p>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          What halflife does not collect
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-base text-[var(--color-foreground)]">
          <li>No account, no login, no password.</li>
          <li>No tracking cookies. No third-party advertising pixels.</li>
          <li>
            No name, employer, salary, location, or any other personal field
            beyond the job title you type and (optionally) an email address you
            type into the launch-list form.
          </li>
          <li>
            No fingerprinting (canvas, font, audio, WebGL). No cross-site
            trackers.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          What halflife does collect
        </h2>
        <dl className="space-y-6 text-base">
          <div>
            <dt className="font-medium">The job title you analyze.</dt>
            <dd className="mt-1 text-[var(--color-muted-foreground)]">
              When you submit a role on the home page, the title is sent to
              Anthropic for scoring and the resulting analysis is cached for
              30 days in Vercel KV, keyed by a slug of the title (e.g.{" "}
              <code>radiologist</code>). The cache stores the public result
              fields (score, countdown, tools, pivot steps, confidence) plus
              the model&rsquo;s internal dimension justifications used for
              evaluation. It does not store who submitted the title — there
              is no &ldquo;who&rdquo; recorded with it.
            </dd>
          </div>
          <div>
            <dt className="font-medium">
              Anonymous, cookieless analytics via Plausible.
            </dt>
            <dd className="mt-1 text-[var(--color-muted-foreground)]">
              We use{" "}
              <a
                className="underline hover:text-[var(--color-foreground)]"
                href="https://plausible.io/data-policy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Plausible
              </a>{" "}
              for page-view counts. Plausible does not set cookies, does not
              persist your IP address, and does not build a per-visitor
              profile. That is why this site has no cookie banner — no consent
              is required for traffic that fits the EU&rsquo;s ePrivacy
              &ldquo;strictly necessary&rdquo; carve-out.
            </dd>
          </div>
          <div>
            <dt className="font-medium">
              Your email — only if you submit the launch-list form.
            </dt>
            <dd className="mt-1 text-[var(--color-muted-foreground)]">
              The optional email-capture form on the 2026 report page sends the
              address to{" "}
              <a
                className="underline hover:text-[var(--color-foreground)]"
                href="https://docs.useplunk.com"
                rel="noopener noreferrer"
                target="_blank"
              >
                Plunk
              </a>{" "}
              so we can email you when the live ranking lands. We use it for
              that and nothing else; you can ask us to delete it at any time
              (see &ldquo;Your rights&rdquo; below). Until the launch wave goes
              out the endpoint runs in a deliberately unconfigured no-op state
              and your submission is dropped without being stored.
            </dd>
          </div>
          <div>
            <dt className="font-medium">
              Standard server logs at the hosting provider.
            </dt>
            <dd className="mt-1 text-[var(--color-muted-foreground)]">
              Like any website, our host (Vercel) records short-lived request
              logs (timestamp, path, response code, approximate region) for
              operational debugging and abuse prevention. We do not export
              these into a separate analytics system.
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Who else sees the data
        </h2>
        <p className="text-base text-[var(--color-muted-foreground)]">
          The third parties involved are limited to the ones that make the
          product run:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>
            <span className="font-medium">Anthropic</span> — receives the job
            title you submit to produce the analysis. Anthropic&rsquo;s
            commercial terms apply.
          </li>
          <li>
            <span className="font-medium">Vercel</span> — hosting and the KV
            store that caches role results.
          </li>
          <li>
            <span className="font-medium">Plausible</span> — anonymous page
            views.
          </li>
          <li>
            <span className="font-medium">Plunk</span> — only the email
            addresses you choose to submit to the launch-list form.
          </li>
        </ul>
        <p className="text-base text-[var(--color-muted-foreground)]">
          We do not sell data. We do not share it with advertisers or data
          brokers.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Your rights</h2>
        <p className="text-base text-[var(--color-muted-foreground)]">
          The only personal data we hold is an email address, and only if you
          submitted one. To have it deleted, or to ask what is stored against
          it, email us at{" "}
          <a
            className="underline hover:text-[var(--color-foreground)]"
            href="mailto:privacy@halflife.work"
          >
            privacy@halflife.work
          </a>
          . We aim to respond within 14 days.
        </p>
        <p className="text-base text-[var(--color-muted-foreground)]">
          Cached role analyses are not linked to a person, but they do expire
          on their own after 30 days as part of the normal cache lifecycle.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Changes</h2>
        <p className="text-base text-[var(--color-muted-foreground)]">
          If we change anything about what is collected or who it goes to, the
          change ships in the same commit that updates this page. The history
          is public on{" "}
          <a
            className="underline hover:text-[var(--color-foreground)]"
            href="https://github.com/internetyev/halflife"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub
          </a>
          .
        </p>
      </section>

      <div className="mt-12 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90"
        >
          Back to the analyzer
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
