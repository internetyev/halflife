// Per-role static page (L2.7). Resolves a result for `:slug` from two
// sources, in order:
//
//   1. Precomputed JSON at `data/roles/<slug>.json` — the Phase 3 seed
//      (L3.2) of curated top job titles, enabling true SSG.
//   2. KV cache via `getCachedRoleBySlug` — for roles a visitor just
//      analyzed via the home form. Lets a freshly minted share URL work
//      immediately, before Phase 3 lands.
//
// Falls through to `notFound()` when neither has data, so unknown slugs
// return a real 404 rather than a bare skeleton. Phase 3 will switch this
// to `generateStaticParams` over the precomputed set.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResultCard } from "@/components/result-card";
import { getCachedRoleBySlug } from "@/lib/cache/role-cache";
import { slugify } from "@/lib/scoring";
import type { RoleAnalysisResult } from "@/lib/scoring/types";

interface RouteParams {
  slug: string;
}

interface LoadedRole {
  result: RoleAnalysisResult;
  source: "precomputed" | "kv";
}

async function loadPrecomputed(
  slug: string,
): Promise<RoleAnalysisResult | null> {
  try {
    const filePath = path.join(process.cwd(), "data", "roles", `${slug}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as RoleAnalysisResult;
  } catch {
    return null;
  }
}

async function loadRole(rawSlug: string): Promise<LoadedRole | null> {
  // Defensive: a visitor may type `/role/Paralegal` even though the
  // canonical form is lowercase. Slugify before any lookup so KV keys and
  // file paths match.
  const slug = slugify(rawSlug).slice(0, 200);
  if (!slug) return null;

  const precomputed = await loadPrecomputed(slug);
  if (precomputed) return { result: precomputed, source: "precomputed" };

  const cached = await getCachedRoleBySlug(slug);
  if (cached) return { result: cached.result, source: "kv" };

  return null;
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadRole(slug);

  const displayTitle = data
    ? data.result.normalized_title.replace(/\b\w/g, (c) => c.toUpperCase())
    : titleCaseFromSlug(slug);

  const description = data
    ? `Survival score ${data.result.score}/100 — ${data.result.countdown_years.toFixed(
        1,
      )} years until AI plausibly handles ≥50% of the work of a ${displayTitle}.`
    : `How many years until AI replaces a ${displayTitle}? Get the countdown, survival score, and pivot steps.`;

  return {
    title: `${displayTitle} — AI obsolescence countdown`,
    description,
    openGraph: {
      title: `${displayTitle} · halflife`,
      description,
      type: "article",
      images: [{ url: `/api/og/${slug}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayTitle} · halflife`,
      description,
      images: [`/api/og/${slug}`],
    },
  };
}

export default async function RolePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const data = await loadRole(slug);
  if (!data) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <header>
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          halflife
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight capitalize sm:text-4xl">
          {data.result.normalized_title}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          AI obsolescence countdown, survival score, and a pivot roadmap.
        </p>
      </header>

      <section className="mt-10">
        <ResultCard result={data.result} cache="HIT" />
      </section>

      <footer className="mt-auto pt-12 text-xs text-[var(--color-muted-foreground)]">
        <a
          href="/"
          className="underline decoration-dotted underline-offset-4 hover:text-[var(--color-foreground)]"
        >
          Score another role →
        </a>
      </footer>
    </main>
  );
}
