// Security-disclosure channel consistency guard (L5.75).
//
// halflife advertises its responsible-disclosure path on TWO hand-written
// surfaces that deliberately point at one channel: `public/.well-known/
// security.txt` (L5.17, the RFC 9116 file a researcher's tooling fetches at
// `/.well-known/security.txt`) and `SECURITY.md` (L5.19, the file GitHub
// renders behind the repo's "Report a vulnerability" / Security tab). Both
// say so in prose: `security.txt`'s header says "GitHub Security Advisories
// is the on-record channel" and `SECURITY.md` says "This file is the
// repository-level counterpart to the website's `/.well-known/security.txt`
// (RFC 9116): the two surfaces point at the same disclosure channel so there
// is one place reporters of either kind end up." Nothing pinned the two copies
// of that channel URL — or the canonical origin `security.txt` advertises —
// together until now.
//
// **The drift it pins is a silent split-disclosure failure, invisible to every
// build step (neither file is touched by `next build`/`tsc`):** (a) the
// repository moves or is renamed (the human-gated L1.7b/L5.1 naming pick could
// rename the GitHub repo) and the advisory URL is updated in `SECURITY.md` but
// not in `security.txt`'s `Contact:` (or vice-versa) — both files still parse,
// but a researcher who reads the website's `security.txt` is now sent to a
// DIFFERENT (stale, possibly 404ing) channel than one who reads the repo's
// SECURITY.md, so a real report lands nowhere or in the wrong place: the one
// thing both files exist to prevent; (b) the canonical origin in `security.txt`
// drifts from the site's canonical origin (D-095/L5.65 pins the RUNTIME origin
// across the metadata-route family, but `security.txt` is a STATIC public file
// that guard never reads) so the `Canonical:` line disowns the URL the file is
// actually served from — RFC 9116 §2.5.3 says a `Canonical:` that doesn't match
// the retrieval URI MAY cause the file to be ignored; (c) the RFC 9116 required
// `Contact:`/`Expires:` fields go missing or `Expires:` stops being a
// well-formed timestamp, making the file non-conformant and rejected by
// security.txt parsers.
//
// **Why a NEW surface, not the D-095/L5.65 site-origin guard:** that guard pins
// the `https://halflife.work` origin across `app/layout.tsx` + the four runtime
// metadata routes (robots/sitemap/manifest/json-ld) — all TypeScript the app
// renders. It never reads `public/.well-known/security.txt` (a static text file
// Next serves verbatim, not a route) or `SECURITY.md` (a repo doc GitHub
// renders, never shipped to the site). This guard owns the orthogonal
// disclosure-channel contract across those two static surfaces, anchored to the
// same documented origin so all three move together.
//
// **Why a text guard:** both inputs are plain text (an RFC 9116 `Field: value`
// file and a Markdown doc) — no import, no `@/`-alias or `node_modules`
// resolution, same as the L5.57–L5.74 arc. Pure Node built-ins (`fs` read +
// regex). Run via `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECURITY_TXT = join(REPO_ROOT, "public", ".well-known", "security.txt");
const SECURITY_MD = join(REPO_ROOT, "SECURITY.md");

// The documented canonical origin — the single literal D-095/L5.65 pins across
// the runtime metadata family. `security.txt` is the static analogue: its
// `Canonical:` URL must sit on this same origin.
const SITE_ORIGIN = "https://halflife.work";

// The on-record disclosure channel both files name: a GitHub Security
// Advisories "new" URL for THIS repo. Anchored as a literal so a copy that
// drifts to a different repo/path is caught against the documented intent, not
// just against the other copy (a coordinated edit to a wrong repo still fails).
const ADVISORY_URL =
  "https://github.com/internetyev/halflife/security/advisories/new";

const txtSrc = readFileSync(SECURITY_TXT, "utf8");
const mdSrc = readFileSync(SECURITY_MD, "utf8");

// Parse an RFC 9116 file into a map of field-name (lowercased) → [values].
// Skips `#` comment lines and blanks; a field may legally repeat (e.g. multiple
// `Contact:`), so values accumulate into an array.
function parseSecurityTxt(src) {
  const fields = new Map();
  for (const rawLine of src.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (!fields.has(key)) fields.set(key, []);
    fields.get(key).push(val);
  }
  return fields;
}

const fields = parseSecurityTxt(txtSrc);

// Every GitHub advisory "new" URL the Markdown doc mentions, deduped.
const URL_TOKEN = /https:\/\/github\.com\/[A-Za-z0-9_.\/-]+\/security\/advisories\/new/g;
const mdAdvisoryUrls = [...new Set(mdSrc.match(URL_TOKEN) ?? [])];

test("both disclosure surfaces parse to their expected anchors (vacuous-scan guard)", () => {
  // A regex/parse drift that emptied either side would make every equality
  // check below trivially pass — assert the inputs were actually understood.
  assert.ok(fields.size > 0, "no RFC 9116 fields parsed from security.txt");
  assert.ok(
    fields.has("contact"),
    "security.txt has no Contact: field (RFC 9116 requires at least one)",
  );
  assert.ok(
    fields.has("canonical"),
    "security.txt has no Canonical: field",
  );
  assert.ok(
    mdAdvisoryUrls.length > 0,
    "SECURITY.md names no GitHub Security Advisories URL",
  );
});

test("security.txt carries the RFC 9116 required fields", () => {
  // Contact (≥1) and Expires (exactly one) are the two fields RFC 9116 makes
  // mandatory; a file missing either is non-conformant and parsers reject it.
  assert.ok(
    (fields.get("contact") ?? []).length >= 1,
    "security.txt must have at least one Contact: field",
  );
  const expires = fields.get("expires") ?? [];
  assert.equal(
    expires.length,
    1,
    `security.txt must have exactly one Expires: field, found ${expires.length}`,
  );
});

test("security.txt Expires is a well-formed ISO 8601 UTC timestamp", () => {
  // RFC 9116 §2.5.5: Expires MUST be an ISO 8601 / RFC 3339 timestamp. Assert
  // the documented `...Z` shape and that it parses to a real instant. (Not
  // asserting it is in the FUTURE-of-now on purpose: that would make this test
  // a time-bomb that reddens CI the day the file legitimately needs renewing —
  // a human task, not a drift this guard should manufacture.)
  const [expires] = fields.get("expires");
  assert.match(
    expires,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    `Expires is not an ISO 8601 UTC timestamp: ${expires}`,
  );
  assert.ok(
    !Number.isNaN(Date.parse(expires)),
    `Expires does not parse to a real date: ${expires}`,
  );
});

test("security.txt Canonical sits on the documented canonical origin", () => {
  // The Canonical: URL must be the retrieval URI of this very file on the
  // canonical origin D-095/L5.65 pins — origin drift here silently disowns the
  // path the file is served from (RFC 9116 §2.5.3).
  const [canonical] = fields.get("canonical");
  const url = new URL(canonical);
  assert.equal(
    url.origin,
    SITE_ORIGIN,
    `security.txt Canonical origin ${url.origin} != documented ${SITE_ORIGIN}`,
  );
  assert.equal(
    url.pathname,
    "/.well-known/security.txt",
    `security.txt Canonical path ${url.pathname} is not the well-known retrieval path`,
  );
});

test("security.txt Contact points at this repo's GitHub Security Advisories channel", () => {
  // The on-record channel both files name. Anchoring to the documented literal
  // (not just "some advisory URL") catches a Contact that drifts to a different
  // repo or an off-channel mailbox.
  const contacts = fields.get("contact");
  assert.ok(
    contacts.includes(ADVISORY_URL),
    `security.txt Contact: ${contacts.join(", ")} does not include the documented channel ${ADVISORY_URL}`,
  );
});

test("SECURITY.md routes reporters to the SAME advisory channel as security.txt", () => {
  // THE load-bearing invariant: "the two surfaces point at the same disclosure
  // channel." Every advisory URL the Markdown doc names must be byte-for-byte
  // the documented channel — a stale/renamed-repo copy in either file sends one
  // class of reporter to a dead end.
  const wrong = mdAdvisoryUrls.filter((u) => u !== ADVISORY_URL);
  assert.deepEqual(
    wrong,
    [],
    `SECURITY.md names advisory URL(s) other than the documented channel: ${wrong.join(", ")}`,
  );
  assert.ok(
    mdAdvisoryUrls.includes(ADVISORY_URL),
    "SECURITY.md does not name the documented advisory channel at all",
  );
});

test("SECURITY.md cross-references the security.txt file so the 'two surfaces' claim is anchored", () => {
  // SECURITY.md's Scope section tells reporters to "see public/.well-known/
  // security.txt Canonical:" — if that path reference rots (file moved/renamed)
  // the doc's promise that the two surfaces are counterparts is broken.
  assert.ok(
    mdSrc.includes(".well-known/security.txt"),
    "SECURITY.md no longer references public/.well-known/security.txt",
  );
});
