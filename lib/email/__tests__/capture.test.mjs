// Unit tests for the L5.4a email-capture helper (lib/email/capture.ts).
//
// Third lib/ suite (after L5.50 plausible, L5.51 json-ld), picked up by the
// L5.50 `lib/**/__tests__/*.test.mjs` glob. capture.ts is cleanly testable for
// the same reason as those two: it has ZERO imports (plain global `fetch` + one
// regex), so `import … from "../capture.ts"` resolves under Node's type-stripper
// with no TS loader and no extensionless-`@/`-import wall (the D-080 problem that
// still defers lib/scoring/index.ts).
//
// What matters here: the two no-network guard branches that keep the routine
// laptop and unconfigured previews from ever spending a request — `invalid-email`
// (fails local validation) and `not-configured` (`PLUNK_API_KEY` unset, L5.4b not
// done) — plus the live `ok`/`upstream-error` paths, exercised by stubbing
// `globalThis.fetch`. The load-bearing request-shape invariant is that the body
// lowercases+trims the email, sets `subscribed: true`, carries `data.source`, and
// the Authorization header is `Bearer <key>` — verified by capturing the stub's
// call args (the key itself must never appear in a returned `detail`).
//
// Run via `npm test`. Pure Node built-ins, no npm install — identical on the
// routine laptop and CI.

import { test } from "node:test";
import assert from "node:assert/strict";

import { isValidEmail, captureEmail } from "../capture.ts";

// --- env + fetch swap helpers --------------------------------------------
// Save/restore PLUNK_API_KEY and globalThis.fetch around each test so no state
// leaks between cases (the not-configured branch depends on the key being unset,
// which is Node's default in this harness).
function withEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, "PLUNK_API_KEY");
  const prev = process.env.PLUNK_API_KEY;
  try {
    if (value === undefined) delete process.env.PLUNK_API_KEY;
    else process.env.PLUNK_API_KEY = value;
    return fn();
  } finally {
    if (had) process.env.PLUNK_API_KEY = prev;
    else delete process.env.PLUNK_API_KEY;
  }
}

// Replace globalThis.fetch with a stub that records its call and returns
// `response`; restore afterwards. Returns the recorder so a test can assert args.
async function withFetch(response, fn) {
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (...args) => {
    calls.push(args);
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(response);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = prev;
  }
}

// --- isValidEmail ---------------------------------------------------------

test("isValidEmail accepts a normal address", () => {
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("first.last@sub.domain.org"), true);
});

test("isValidEmail trims surrounding whitespace before testing", () => {
  assert.equal(isValidEmail("  a@b.co  "), true);
});

test("isValidEmail rejects missing @, missing dot, spaces, and empties", () => {
  for (const bad of ["nope", "no-at-sign.com", "a@bc", "a b@c.d", "@b.co", "a@.co", ""]) {
    assert.equal(isValidEmail(bad), false, `expected ${JSON.stringify(bad)} invalid`);
  }
});

test("isValidEmail rejects non-string input (type guard)", () => {
  for (const bad of [undefined, null, 42, {}, ["a@b.co"]]) {
    assert.equal(isValidEmail(bad), false);
  }
});

// --- captureEmail: no-network guard branches ------------------------------

test("captureEmail returns invalid-email and makes NO request for junk input", async () => {
  await withEnv("plunk_secret", () =>
    withFetch({ ok: true, status: 200 }, async (calls) => {
      const r = await captureEmail("not-an-email");
      assert.equal(r.status, "invalid-email");
      assert.equal(calls.length, 0);
    }),
  );
});

test("captureEmail returns not-configured and makes NO request when key unset", async () => {
  await withEnv(undefined, () =>
    withFetch({ ok: true, status: 200 }, async (calls) => {
      const r = await captureEmail("a@b.co");
      assert.equal(r.status, "not-configured");
      assert.equal(calls.length, 0);
    }),
  );
});

// --- captureEmail: live request paths -------------------------------------

test("captureEmail posts a correctly-shaped request and returns ok", async () => {
  await withEnv("plunk_secret_key", () =>
    withFetch({ ok: true, status: 200 }, async (calls) => {
      const r = await captureEmail("  USER@Example.COM  ", "home-hero");
      assert.equal(r.status, "ok");
      assert.equal(calls.length, 1);

      const [url, init] = calls[0];
      assert.equal(url, "https://api.useplunk.com/v1/contacts");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.authorization, "Bearer plunk_secret_key");
      assert.equal(init.headers["content-type"], "application/json");

      const body = JSON.parse(init.body);
      assert.equal(body.email, "user@example.com"); // trimmed + lowercased
      assert.equal(body.subscribed, true);
      assert.deepEqual(body.data, { source: "home-hero" });
    }),
  );
});

test("captureEmail defaults source to report-2026", async () => {
  await withEnv("k", () =>
    withFetch({ ok: true, status: 200 }, async (calls) => {
      await captureEmail("a@b.co");
      const body = JSON.parse(calls[0][1].body);
      assert.equal(body.data.source, "report-2026");
    }),
  );
});

test("captureEmail returns upstream-error on a non-ok response, without leaking the key", async () => {
  await withEnv("super_secret", () =>
    withFetch({ ok: false, status: 422 }, async () => {
      const r = await captureEmail("a@b.co");
      assert.equal(r.status, "upstream-error");
      assert.match(r.detail, /422/);
      assert.doesNotMatch(r.detail ?? "", /super_secret/);
    }),
  );
});

test("captureEmail returns upstream-error when fetch throws", async () => {
  await withEnv("k", () =>
    withFetch(new Error("ECONNRESET"), async () => {
      const r = await captureEmail("a@b.co");
      assert.equal(r.status, "upstream-error");
      assert.match(r.detail, /ECONNRESET/);
    }),
  );
});
