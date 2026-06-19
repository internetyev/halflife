// Test-only module resolver — loaded via `node --import` from the `npm test`
// script (package.json), which the Makefile `test` target and CI `test` step
// both call, so this single wiring covers every path.
//
// Why it exists: Node's native type-stripping (`.ts` run directly under
// `node --test`, no transpile, no npm install) cannot resolve EXTENSIONLESS
// relative imports to a `.ts` file. `lib/scoring/index.ts` has exactly one such
// VALUE import — `import { METHODOLOGY_VERSION, PROMPT_VERSION } from "./types"`
// — which made the core score/countdown math the last untested runtime module
// (D-080 deferred it for "a dedicated leaf when a contributor adopts a
// test-loader convention"; this is that leaf — see D-084).
//
// What it does: registers a synchronous `resolve` hook (`module.registerHooks`,
// Node ≥ 22.15 / 23.5; the repo pins Node 22 via .nvmrc) that retries a failed
// resolution with a `.ts` extension — but ONLY when the DEFAULT resolution
// throws ERR_MODULE_NOT_FOUND for a relative, extensionless specifier. Anything
// that already resolves is passed straight through, so the pre-existing suites
// are untouched. Scope is the test process only: it never touches shipped
// source, tsconfig, the Next build, or the production bundle (D-080's blast-
// radius concern). It is not a general TS loader — `@/…` path-alias imports and
// third-party packages still need a real bundler, so modules that reach for
// those (e.g. lib/cache/role-cache.ts → `@vercel/kv` + `@/lib/scoring`) remain
// out of scope here.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      const relative = /^\.{1,2}\//.test(specifier);
      const hasExt = /\.[mc]?[jt]s$/.test(specifier);
      if (err?.code === "ERR_MODULE_NOT_FOUND" && relative && !hasExt) {
        return nextResolve(specifier + ".ts", context);
      }
      throw err;
    }
  },
});
