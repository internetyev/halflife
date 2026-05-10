// Score + countdown derivation. Matches docs/methodology.md v1 and the
// post-processing pseudocode in prompts/role-analysis.md.
//
// The model returns dimensions; this module returns the user-facing
// `score` and `countdown_years`. Keeping the math here means a weight or
// band change is a one-file edit (plus a methodology_version bump).

import type {
  DimensionKey,
  Dimensions,
  RoleAnalysisResult,
  RoleAnalysisToolInput,
} from "./types";
import { METHODOLOGY_VERSION, PROMPT_VERSION } from "./types";

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  task_automatability: 0.3,
  tool_maturity: 0.2,
  adoption_velocity: 0.15,
  hitl_necessity: 0.15,
  differentiation_moat: 0.1,
  labor_market_elasticity: 0.1,
};

const COUNTDOWN_BANDS: ReadonlyArray<{
  scoreMin: number;
  scoreMax: number;
  yearsMin: number;
  yearsMax: number;
}> = [
  { scoreMin: 0, scoreMax: 19, yearsMin: 0.5, yearsMax: 2.0 },
  { scoreMin: 20, scoreMax: 39, yearsMin: 2.0, yearsMax: 4.0 },
  { scoreMin: 40, scoreMax: 59, yearsMin: 4.0, yearsMax: 7.0 },
  { scoreMin: 60, scoreMax: 79, yearsMin: 7.0, yearsMax: 12.0 },
  { scoreMin: 80, scoreMax: 100, yearsMin: 12.0, yearsMax: 20.0 },
];

export function computeScore(dimensions: Dimensions): number {
  let raw = 0;
  for (const key of Object.keys(DIMENSION_WEIGHTS) as DimensionKey[]) {
    const weight = DIMENSION_WEIGHTS[key];
    const dim = dimensions[key];
    raw += dim.score * weight;
  }
  return Math.round(raw * 10);
}

// FNV-1a 32-bit. Stable, dependency-free, plenty for ±5% jitter.
function hashSlug(slug: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function bandedCountdown(score: number, slug: string): number {
  const clamped = Math.max(0, Math.min(100, score));
  const band =
    COUNTDOWN_BANDS.find(
      (b) => clamped >= b.scoreMin && clamped <= b.scoreMax,
    ) ?? COUNTDOWN_BANDS[COUNTDOWN_BANDS.length - 1]!;

  const bandWidth = band.scoreMax - band.scoreMin || 1;
  const t = (clamped - band.scoreMin) / bandWidth;
  const interpolated = band.yearsMin + t * (band.yearsMax - band.yearsMin);

  // ±5% jitter from slug hash, deterministic per slug.
  const jitter = ((hashSlug(slug) % 1000) / 1000 - 0.5) * 0.1; // [-0.05, +0.05)
  const years = interpolated * (1 + jitter);

  return Math.round(years * 10) / 10;
}

// `slug` for jitter is derived from the model's normalized_title, not the raw
// input — two different inputs that collapse to the same role get the same
// countdown (and the same KV cache key in L2.3).
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildResult(
  inputTitle: string,
  tool: RoleAnalysisToolInput,
): RoleAnalysisResult {
  const score = computeScore(tool.dimensions);
  const slug = slugify(tool.normalized_title);
  const countdown_years = bandedCountdown(score, slug);

  return {
    input_title: inputTitle,
    normalized_title: tool.normalized_title,
    score,
    countdown_years,
    ai_tools: tool.ai_tools,
    pivot_steps: tool.pivot_steps,
    confidence: tool.confidence,
    sources_hint: tool.sources_hint,
    methodology_version: METHODOLOGY_VERSION,
    prompt_version: PROMPT_VERSION,
  };
}
