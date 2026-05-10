// POST /api/analyze
//
// Body: { title: string }
// Returns: RoleAnalysisResult (see lib/scoring/types.ts)
//
// L2.2 scope: live Claude call, no cache. KV cache lands in L2.3 — when it
// does, the wrapper sits in front of analyzeRole() and the route body shrinks
// to (lookup → miss → analyzeRole → store → return).
//
// Tool-use is forced via `tool_choice`; non-tool model output is discarded
// per D-010. Prompt caching is enabled on the system prompt and tool block
// so repeat calls inside the 5-minute TTL skip re-sending the rubric.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import {
  ROLE_ANALYSIS_SYSTEM_PROMPT,
  ROLE_ANALYSIS_TOOL,
  ROLE_ANALYSIS_TOOL_NAME,
  buildUserMessage,
} from "@/lib/anthropic/role-analysis";
import { buildResult } from "@/lib/scoring";
import type { RoleAnalysisToolInput } from "@/lib/scoring/types";

export const runtime = "nodejs";

// Sonnet 4.6 — fixed in D-012. A model bump is a deliberate code change so
// the cache key (methodology_version × prompt_version) reflects it; pinning
// here keeps a stray env var from silently changing the production model.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const MAX_TITLE_LENGTH = 200;

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

interface AnalyzeRequestBody {
  title?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  if (!client) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this deployment." },
      { status: 503 },
    );
  }

  let body: AnalyzeRequestBody;
  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const rawTitle =
    typeof body.title === "string" ? body.title.trim() : "";
  if (rawTitle.length === 0) {
    return NextResponse.json(
      { error: "`title` is required and must be a non-empty string." },
      { status: 400 },
    );
  }
  if (rawTitle.length > MAX_TITLE_LENGTH) {
    return NextResponse.json(
      {
        error: `\`title\` must be ${MAX_TITLE_LENGTH} characters or fewer.`,
      },
      { status: 400 },
    );
  }

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: ROLE_ANALYSIS_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          ...ROLE_ANALYSIS_TOOL,
          cache_control: { type: "ephemeral" },
        },
      ],
      tool_choice: { type: "tool", name: ROLE_ANALYSIS_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: buildUserMessage(rawTitle),
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upstream error.";
    return NextResponse.json(
      { error: `Claude request failed: ${message}` },
      { status: 502 },
    );
  }

  const toolUse = response.content.find(
    (block) =>
      block.type === "tool_use" && block.name === ROLE_ANALYSIS_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json(
      { error: "Model did not invoke the submit_role_analysis tool." },
      { status: 502 },
    );
  }

  const toolInput = toolUse.input as RoleAnalysisToolInput;
  const result = buildResult(rawTitle, toolInput);
  return NextResponse.json(result, { status: 200 });
}
