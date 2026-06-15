// Unit tests for the L5.25 Plausible telemetry helper (lib/analytics/plausible.ts).
//
// First test that reaches into lib/ — the L5.39–L5.42 suites covered every
// scripts/ data tool, but the runtime modules under lib/ had no coverage. This
// module is the cleanly-testable starting point: it is fully self-contained (no
// imports), so Node's native type-stripping resolves it with no TS loader and no
// source churn. (The rest of lib/ uses extensionless internal TS imports — e.g.
// lib/scoring/index.ts does `import … from "./types"` — which Node's stripper
// will not resolve to `.ts` without changing the shipped source; that wait-for-a-
// loader decision is deferred. See DECISIONS D-080.)
//
// trackEvent ships real production telemetry (form-submit + share-click, the
// PLAN.md distribution KPI). The invariant under test is the one that keeps the
// dev laptop and unconfigured previews emitting ZERO analytics traffic: the call
// is a no-op unless `window.plausible` actually exists. Node runs with `window`
// undefined by default, which is exactly the SSR / server-module-graph path, so
// these tests exercise all three branches by mutating `globalThis.window`.
//
// Run via `npm test` (the package.json glob now also covers lib/**/__tests__).
// Pure Node built-ins, no npm install — identical execution on the routine
// laptop and the GitHub CI runner.

import { test } from "node:test";
import assert from "node:assert/strict";

import { trackEvent } from "../plausible.ts";

// trackEvent reads `window` at call time, not import time, so each test can swap
// `globalThis.window` freely. Always restore to undefined afterwards so one
// test's window cannot leak into the next (and into the SSR-path assertions).
function withWindow(win, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prev = globalThis.window;
  try {
    if (win === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = win;
    }
    fn();
  } finally {
    if (had) {
      globalThis.window = prev;
    } else {
      delete globalThis.window;
    }
  }
}

// Records every (event, options) pair window.plausible is invoked with.
function makeSpy() {
  const calls = [];
  return {
    calls,
    plausible: (event, options) => {
      calls.push({ event, options });
    },
  };
}

test("SSR path: window undefined → no-op, never throws", () => {
  withWindow(undefined, () => {
    assert.doesNotThrow(() => trackEvent("form-submit", { cache: "HIT" }));
  });
});

test("unconfigured path: window present but window.plausible undefined → no-op, never throws", () => {
  // Mirrors the NEXT_PUBLIC_PLAUSIBLE_DOMAIN-unset case: the script never loads,
  // so window.plausible is undefined and the optional call is a no-op.
  withWindow({}, () => {
    assert.doesNotThrow(() => trackEvent("share-click", { channel: "x" }));
  });
});

test("configured path with props: forwards event name and wraps props under { props }", () => {
  const spy = makeSpy();
  withWindow(spy, () => {
    trackEvent("form-submit", { cache: "MISS" });
  });
  assert.equal(spy.calls.length, 1);
  assert.deepEqual(spy.calls[0], {
    event: "form-submit",
    options: { props: { cache: "MISS" } },
  });
});

test("configured path without props: passes undefined options (not an empty { props })", () => {
  const spy = makeSpy();
  withWindow(spy, () => {
    trackEvent("pageview");
  });
  assert.equal(spy.calls.length, 1);
  assert.deepEqual(spy.calls[0], { event: "pageview", options: undefined });
});

test("mixed primitive prop values (string | number | boolean) pass through unchanged", () => {
  const spy = makeSpy();
  const props = { channel: "linkedin", rank: 7, cached: true };
  withWindow(spy, () => {
    trackEvent("share-click", props);
  });
  assert.equal(spy.calls.length, 1);
  assert.deepEqual(spy.calls[0].options, { props });
});

test("each call is independent: two events produce two distinct plausible invocations", () => {
  const spy = makeSpy();
  withWindow(spy, () => {
    trackEvent("form-submit", { cache: "HIT" });
    trackEvent("share-click", { channel: "copy", slug: "paralegal" });
  });
  assert.deepEqual(
    spy.calls.map((c) => c.event),
    ["form-submit", "share-click"],
  );
  assert.deepEqual(spy.calls[1].options.props, {
    channel: "copy",
    slug: "paralegal",
  });
});
