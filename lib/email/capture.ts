// Email-capture helper (L5.4a). Adds a contact to Plunk
// (https://docs.useplunk.com) via its REST API.
//
// Provider choice (Plunk vs ConvertKit/Kit) is recorded in DECISIONS.md
// D-034. Plunk was picked for a single-bearer-token config surface, an
// open-source / no-lock-in posture, and because it is a notification/list
// primitive rather than an audience-funnel CRM — consistent with PLAN.md's
// explicit anti-audience framing (see D-032/D-033).
//
// Self-maintaining + env-gated, same philosophy as the L2.9 Plausible
// snippet and the analyze route's `ANTHROPIC_API_KEY` guard: when
// `PLUNK_API_KEY` is unset (the routine laptop, unconfigured previews) this
// returns `{ status: "not-configured" }` and makes NO network call, so the
// build is correct today and starts capturing the instant the human sets the
// key in the human-gated L5.4b — no code change.
//
// No SDK dependency (no `npm install` per ROUTINE): plain global `fetch`.

const PLUNK_CONTACTS_ENDPOINT = "https://api.useplunk.com/v1/contacts";

// Conservative RFC-5322-ish check: one `@`, a dot in the domain, no spaces.
// Intentionally not exhaustive — the provider is the source of truth for
// deliverability; this only rejects obvious junk before spending a request.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CaptureStatus =
  | "ok" // contact created/subscribed at the provider
  | "invalid-email" // failed local validation, no request made
  | "not-configured" // PLUNK_API_KEY unset, no request made (L5.4b not done)
  | "upstream-error"; // provider rejected or network failed

export interface CaptureResult {
  status: CaptureStatus;
  /** Human-readable detail, safe to log. Never includes the API key. */
  detail?: string;
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

/**
 * Subscribe `email` to the Plunk contact list. Pure server-side — never
 * import this into a client component (it reads the secret env var).
 *
 * `source` is stored as Plunk contact data so launch-channel attribution
 * (report page vs. a future home-page block) survives without a second list.
 */
export async function captureEmail(
  email: string,
  source = "report-2026",
): Promise<CaptureResult> {
  if (!isValidEmail(email)) {
    return { status: "invalid-email", detail: "Email failed validation." };
  }

  const apiKey = process.env.PLUNK_API_KEY;
  if (!apiKey) {
    return {
      status: "not-configured",
      detail: "PLUNK_API_KEY is unset; capture is a no-op until L5.4b.",
    };
  }

  try {
    const res = await fetch(PLUNK_CONTACTS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        subscribed: true,
        data: { source },
      }),
    });

    if (!res.ok) {
      // Don't surface the provider's raw body to the client; log-safe detail.
      return {
        status: "upstream-error",
        detail: `Plunk responded ${res.status}.`,
      };
    }

    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "network error";
    return { status: "upstream-error", detail: `Plunk request failed: ${message}` };
  }
}
