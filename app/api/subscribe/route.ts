// POST /api/subscribe  (L5.4a — email capture)
//
// Body: { email: string, source?: string }
// Returns:
//   200 { ok: true }                  contact added at the provider
//   400 { error }                     bad JSON / missing / invalid email
//   503 { error, configured: false }  PLUNK_API_KEY unset (L5.4b not run yet)
//   502 { error }                     provider rejected / network failed
//
// Mirrors app/api/analyze/route.ts conventions verbatim: nodejs runtime, the
// same JSON-parse / validation / 503-when-unconfigured shape, and an env-gated
// no-op so `next dev` and unconfigured previews never 500. The actual provider
// account + `PLUNK_API_KEY` + live verification is the human-gated L5.4b.

import { NextResponse } from "next/server";

import { captureEmail, isValidEmail } from "@/lib/email/capture";

export const runtime = "nodejs";

const MAX_SOURCE_LENGTH = 64;

interface SubscribeRequestBody {
  email?: unknown;
  source?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: SubscribeRequestBody;
  try {
    body = (await request.json()) as SubscribeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "A valid `email` is required." },
      { status: 400 },
    );
  }

  const source =
    typeof body.source === "string" && body.source.length <= MAX_SOURCE_LENGTH
      ? body.source
      : undefined;

  const result = await captureEmail(email, source);

  switch (result.status) {
    case "ok":
      return NextResponse.json({ ok: true }, { status: 200 });
    case "invalid-email":
      return NextResponse.json(
        { error: "A valid `email` is required." },
        { status: 400 },
      );
    case "not-configured":
      return NextResponse.json(
        {
          error: "Email capture is not live yet.",
          configured: false,
        },
        { status: 503 },
      );
    case "upstream-error":
    default:
      return NextResponse.json(
        { error: "Could not record your email — please try again later." },
        { status: 502 },
      );
  }
}
