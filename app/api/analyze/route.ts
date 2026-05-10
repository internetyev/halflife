// POST /api/analyze
//
// Body: { title: string }
// Returns: RoleAnalysisResult (see lib/scoring/types.ts)
//
// Flow: validate input → KV lookup → on miss, call Claude via analyzeRole()
// → derive score/countdown via buildResult() → write to KV → return.
// The cache is a no-op when KV env vars are absent (see lib/cache/role-cache),
// so the route still serves live results in `next dev` without a linked store.
//
// `x-halflife-cache: HIT|MISS` is set on every 200 response — useful for
// eyeballing cache behaviour from the browser devtools and for the L3.2
// programmatic-seed script to count Claude calls vs. KV reads.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import {
  RoleAnalysisToolMissingError,
  analyzeRole,
} from "@/lib/anthropic/role-analysis";
import { getCachedRole, setCachedRole } from "@/lib/cache/role-cache";
import { buildResult } from "@/lib/scoring";
import type { RoleAnalysisToolInput } from "@/lib/scoring/types";

export const runtime = "nodejs";

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

  const cached = await getCachedRole(rawTitle);
  if (cached) {
    return NextResponse.json(cached.result, {
      status: 200,
      headers: { "x-halflife-cache": "HIT" },
    });
  }

  let toolInput: RoleAnalysisToolInput;
  try {
    toolInput = await analyzeRole(client, rawTitle);
  } catch (err) {
    if (err instanceof RoleAnalysisToolMissingError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message =
      err instanceof Error ? err.message : "Unknown upstream error.";
    return NextResponse.json(
      { error: `Claude request failed: ${message}` },
      { status: 502 },
    );
  }

  const result = buildResult(rawTitle, toolInput);
  await setCachedRole(rawTitle, toolInput, result);

  return NextResponse.json(result, {
    status: 200,
    headers: { "x-halflife-cache": "MISS" },
  });
}
