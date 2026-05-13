"use client";

// Share buttons for a per-role result (L2.8). LinkedIn-first because the
// roadmap calls out LinkedIn as the primary distribution channel for the
// "is my role obsolete?" angle; X (Twitter) second; copy-link last as a
// universal fallback.
//
// The share target is always the canonical `/role/<slug>` URL so the
// recipient lands on a page the OG image (L2.6) and per-role metadata
// (L2.7) were built for — never the home form. The absolute origin is
// read from `window.location.origin` at click time, which keeps the
// component decoupled from any `NEXT_PUBLIC_SITE_URL` env wiring that
// isn't in place yet.

import { useState } from "react";

interface ShareButtonsProps {
  slug: string;
  title: string;
  score: number;
  countdownYears: number;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildShareUrl(slug: string): string {
  if (typeof window === "undefined") return `/role/${slug}`;
  return `${window.location.origin}/role/${slug}`;
}

function buildShareText({
  title,
  score,
  countdownYears,
}: Omit<ShareButtonsProps, "slug">): string {
  return `${titleCase(title)} — survival score ${score}/100, ~${countdownYears.toFixed(
    1,
  )} years until AI plausibly handles ≥50% of the work. (halflife)`;
}

function openShare(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer,width=620,height=520");
}

const BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40";

export function ShareButtons(props: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  function onLinkedIn() {
    const url = buildShareUrl(props.slug);
    openShare(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
        url,
      )}`,
    );
  }

  function onTwitter() {
    const url = buildShareUrl(props.slug);
    const text = buildShareText(props);
    openShare(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        text,
      )}&url=${encodeURIComponent(url)}`,
    );
  }

  async function onCopy() {
    const url = buildShareUrl(props.slug);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers / insecure contexts: degrade silently. The user
      // can still grab the URL from the page's address bar on a role
      // page, or right-click the LinkedIn/X buttons.
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Share this result"
    >
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        Share
      </span>
      <button type="button" onClick={onLinkedIn} className={BUTTON_CLASS}>
        LinkedIn
      </button>
      <button type="button" onClick={onTwitter} className={BUTTON_CLASS}>
        X
      </button>
      <button
        type="button"
        onClick={onCopy}
        className={BUTTON_CLASS}
        aria-live="polite"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
