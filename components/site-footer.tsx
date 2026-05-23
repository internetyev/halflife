// Shared site footer (L5.14). Closes the second half of the launch-checklist
// §4 "Privacy note in footer or `/privacy`" gate (L5.13 shipped the page;
// this wires it into a footer that renders on every route) and the §4
// "Methodology link in footer" gate (points at the GitHub-hosted
// `docs/methodology.md` because there is no in-app methodology route).
//
// Server Component — no interactivity, just internal `Link`s plus two
// external GitHub anchors. Rendered from `app/layout.tsx` so every page
// (home, role pages, report, privacy, 404, error boundary) gets the same
// nav footer with zero per-page wiring, the same self-maintaining shape as
// the sitemap / robots / manifest metadata-route family.
//
// Palette/spacing mirror the rest of the static-text surfaces
// (`not-found.tsx` / `privacy/page.tsx`) — CSS vars only, no new tokens.
//
// External link anchors use `rel="noopener noreferrer"` and `target="_blank"`
// (consistent with the existing GitHub link in `app/privacy/page.tsx`).

import Link from "next/link";

const REPO_URL = "https://github.com/internetyev/halflife";
const METHODOLOGY_URL = `${REPO_URL}/blob/main/docs/methodology.md`;

export function SiteFooter() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="mt-16 border-t border-[var(--color-border)] text-sm text-[var(--color-muted-foreground)]">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs uppercase tracking-widest">
          halflife · &copy; {year}
        </p>
        <nav aria-label="Site footer">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            <li>
              <Link
                href="/"
                className="hover:text-[var(--color-foreground)]"
              >
                Analyzer
              </Link>
            </li>
            <li>
              <Link
                href="/report/2026"
                className="hover:text-[var(--color-foreground)]"
              >
                2026 ranking
              </Link>
            </li>
            <li>
              <a
                href={METHODOLOGY_URL}
                className="hover:text-[var(--color-foreground)]"
                rel="noopener noreferrer"
                target="_blank"
              >
                Methodology
              </a>
            </li>
            <li>
              <Link
                href="/privacy"
                className="hover:text-[var(--color-foreground)]"
              >
                Privacy
              </Link>
            </li>
            <li>
              <a
                href={REPO_URL}
                className="hover:text-[var(--color-foreground)]"
                rel="noopener noreferrer"
                target="_blank"
              >
                Source
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
