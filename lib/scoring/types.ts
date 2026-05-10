// Tool-use schema and post-processing types for the role-analysis prompt.
//
// Mirrors prompts/role-analysis.md (prompt_version 1) and docs/methodology.md
// (methodology_version 1). The tool schema constant lives in lib/anthropic/
// role-analysis.ts; this file is the runtime-typed view of what the model
// returns and what we hand back to clients.

export const METHODOLOGY_VERSION = 1 as const;
export const PROMPT_VERSION = 1 as const;

export type ConfidenceLevel = "low" | "medium" | "high";

export type DimensionKey =
  | "task_automatability"
  | "tool_maturity"
  | "adoption_velocity"
  | "hitl_necessity"
  | "differentiation_moat"
  | "labor_market_elasticity";

export interface Dimension {
  score: number;
  justification: string;
}

export type Dimensions = Record<DimensionKey, Dimension>;

export interface AiTool {
  name: string;
  vendor: string;
  what_it_automates: string;
}

export interface RoleAnalysisToolInput {
  normalized_title: string;
  dimensions: Dimensions;
  ai_tools: AiTool[];
  pivot_steps: string[];
  confidence: ConfidenceLevel;
  confidence_rationale: string;
  sources_hint: string[];
}

// Public API response — see prompts/role-analysis.md "Server-side post-processing".
// `dimensions` and `confidence_rationale` are intentionally NOT included; they
// are persisted to KV (L2.3) for evals/debugging only. (D-010)
export interface RoleAnalysisResult {
  input_title: string;
  normalized_title: string;
  score: number;
  countdown_years: number;
  ai_tools: AiTool[];
  pivot_steps: string[];
  confidence: ConfidenceLevel;
  sources_hint: string[];
  methodology_version: typeof METHODOLOGY_VERSION;
  prompt_version: typeof PROMPT_VERSION;
}
