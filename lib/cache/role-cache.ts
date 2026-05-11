// Vercel KV cache for /api/analyze role results.
//
// Cache key: `role:m${methodology_version}:p${prompt_version}:${slug}`. Both
// versions are part of the key (D-008/D-009/D-012) so a methodology weight
// tweak or a prompt edit invalidates every entry on next read without a
// manual purge — no separate cache-busting step at deploy.
//
// TTL is 30 days (D-005). What we store is `CachedRoleAnalysis`: the public
// `RoleAnalysisResult` plus the model's raw `tool_input` (dimensions and
// confidence_rationale, persisted for evals/debugging per D-016 but stripped
// from the API response per D-010), plus a `cached_at` ISO timestamp.
//
// Synonym handling: on a fresh miss the route writes the entry under both
// the raw input slug AND the model's normalized_title slug, so two raw
// inputs that the prompt collapses to the same canonical role share an
// entry on subsequent reads. The first-time miss for a new alias still pays
// for one Claude call; deduplicating those would need an alias-resolution
// table that L2.3 deliberately doesn't ship.
//
// Graceful degradation: when KV env vars are absent (typical for `next dev`
// without a linked KV store) the cache is a no-op — every lookup misses,
// every write is dropped, the route still serves live results. KV runtime
// errors are swallowed for the same reason: a dead cache must never break
// the analyze endpoint.

import { createClient, type VercelKV } from "@vercel/kv";

import { slugify } from "@/lib/scoring";
import {
  METHODOLOGY_VERSION,
  PROMPT_VERSION,
  type RoleAnalysisResult,
  type RoleAnalysisToolInput,
} from "@/lib/scoring/types";

const TTL_SECONDS = 60 * 60 * 24 * 30;

export interface CachedRoleAnalysis {
  result: RoleAnalysisResult;
  tool_input: RoleAnalysisToolInput;
  cached_at: string;
}

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const client: VercelKV | null =
  url && token ? createClient({ url, token }) : null;

export const isCacheConfigured = client !== null;

export function roleCacheKey(slug: string): string {
  return `role:m${METHODOLOGY_VERSION}:p${PROMPT_VERSION}:${slug}`;
}

export async function getCachedRole(
  rawTitle: string,
): Promise<CachedRoleAnalysis | null> {
  return getCachedRoleBySlug(slugify(rawTitle));
}

// Direct lookup by an already-slugified key. Used by share routes
// (`/api/og/[slug]`, L2.6) where the route param is the slug itself.
export async function getCachedRoleBySlug(
  slug: string,
): Promise<CachedRoleAnalysis | null> {
  if (!client) return null;
  if (!slug) return null;
  try {
    const value = await client.get<CachedRoleAnalysis>(roleCacheKey(slug));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setCachedRole(
  rawTitle: string,
  toolInput: RoleAnalysisToolInput,
  result: RoleAnalysisResult,
): Promise<void> {
  if (!client) return;
  const payload: CachedRoleAnalysis = {
    result,
    tool_input: toolInput,
    cached_at: new Date().toISOString(),
  };
  const inputSlug = slugify(rawTitle);
  const normalizedSlug = slugify(toolInput.normalized_title);
  try {
    await client.set(roleCacheKey(normalizedSlug), payload, {
      ex: TTL_SECONDS,
    });
    if (inputSlug && inputSlug !== normalizedSlug) {
      await client.set(roleCacheKey(inputSlug), payload, { ex: TTL_SECONDS });
    }
  } catch {
    // A failed write is non-fatal; the live result is already on its way back.
  }
}
