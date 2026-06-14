#!/usr/bin/env node
// L5.48 Pre-commit relative-link checker for every Markdown file in the repo.
// The validator family (validate-roles L5.20 / validate-report L5.23 /
// validate-job-titles L5.29) guards the on-disk JSON contracts; this is the
// same idea applied to the docs: the contributor-facing surface — README.md,
// the docs/ quartet (architecture, data-schema, operations, launch-checklist),
// .github/CONTRIBUTING.md, and the top-level planning docs — cross-references
// itself and the repo's config files with dozens of relative links
// (`../DECISIONS.md`, `data-schema.md`, `workflows/ci.yml`, `../.nvmrc`,
// `../README.md#local-setup`, ...). A file rename or a typo'd path turns one of
// those into a dead link that no type-check, lint, or build catches and that
// only a human clicking the link ever notices — exactly the silent-drift class
// the routine keeps adding doc leaves into. This walks every tracked Markdown
// file and asserts that each LOCAL link target resolves to a file or directory
// on disk.
//
// Scope (deliberately tight, like the JSON validators document their bounds):
//   - Checks INLINE markdown links `[text](target)` and images `![alt](target)`.
//   - LOCAL targets only. http(s)/mailto/tel/<scheme>: and protocol-relative
//     `//host` links are skipped (external reachability is not this tool's job).
//   - A `#fragment` and a `?query` are stripped before the existence check, and
//     a fragment-only `#anchor` link is skipped. Heading anchors are NOT
//     validated against the target file's headings — GitHub's heading-slug
//     algorithm (dedup suffixes, emoji, punctuation) is fiddle enough that a
//     slug mismatch would risk false-positive CI failures on valid links, which
//     would erode trust in the check (the D-027/D-036 "never ship a state that
//     breaks the live surface" principle applied to a guard). Anchor validation
//     is a reasonable follow-up leaf if heading renames start biting.
//   - Fenced code blocks (``` / ~~~) and inline code spans (`...`) are stripped
//     before extraction so illustrative link syntax inside an example does not
//     register as a real link to check.
//   - Reference-style links (`[text][ref]` + `[ref]: target`) are not used in
//     this repo today and are not parsed.
//
// Pure Node stdlib (node:fs, node:path), no deps/network/`npm install`.
// Self-maintaining: a repo with zero Markdown files exits 0 (same pre-data
// posture as the sibling validators). Exit 0 all links resolve, 1 one or more
// broken, 2 bad args.

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Directory names never walked: VCS internals, the dependency tree the routine
// never installs but a human clone has, and Next.js build output.
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "__pycache__"]);

function parseArgs(argv) {
  const opts = { root: ".", quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = argv[++i];
    else if (a === "--quiet") opts.quiet = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

// Remove fenced code blocks and inline code spans so example link syntax inside
// documentation does not get treated as a live link. Fenced blocks are replaced
// line-for-line with blank lines (line numbers stay meaningful); inline spans
// are blanked in place.
export function stripCode(md) {
  const lines = md.split("\n");
  let inFence = false;
  let fenceMarker = "";
  const out = lines.map((line) => {
    const m = line.match(/^\s*(```+|~~~+)/);
    if (m) {
      if (!inFence) {
        inFence = true;
        fenceMarker = m[1][0]; // ` or ~
        return "";
      }
      // A closing fence must use the same marker character.
      if (line.trimStart().startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      return "";
    }
    if (inFence) return "";
    // Blank out inline `code` spans (shortest match, leaves the brackets out).
    return line.replace(/`[^`]*`/g, "");
  });
  return out.join("\n");
}

// Extract inline-link targets from already-code-stripped Markdown. Captures the
// `(...)` target of both `[text](...)` and `![alt](...)`. Returns the raw target
// strings verbatim (whitespace/title trimming happens in classifyTarget).
export function extractTargets(md) {
  const targets = [];
  // `]` followed by `(` ... `)` with no nested `)` or newline inside.
  const re = /\]\(([^)\n]*)\)/g;
  let match;
  while ((match = re.exec(md)) !== null) {
    targets.push(match[1]);
  }
  return targets;
}

// Classify a raw link target into one of:
//   { kind: "skip" }                external / empty / anchor-only
//   { kind: "local", relPath }      a path to resolve and stat
export function classifyTarget(raw) {
  let t = raw.trim();
  if (t === "") return { kind: "skip" };
  // Markdown allows an optional title: [text](path "Title") — drop it. The path
  // itself is the first whitespace-delimited token (repo links are unquoted and
  // contain no spaces; a real spaced path would be <...>-wrapped, which we skip).
  if (t.startsWith("<")) return { kind: "skip" }; // angle-bracket autolink/path
  t = t.split(/\s+/)[0];
  // Pure in-page anchor.
  if (t.startsWith("#")) return { kind: "skip" };
  // Strip query + fragment before the existence check.
  t = t.split("#")[0].split("?")[0];
  if (t === "") return { kind: "skip" }; // was a pure ?query/#frag after a split
  // Protocol-relative (//host/...) and any explicit scheme (http:, mailto:,
  // tel:, data:, ...) are external — not our concern.
  if (t.startsWith("//")) return { kind: "skip" };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return { kind: "skip" };
  return { kind: "local", relPath: t };
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// Recursively collect every *.md path under root (skipping SKIP_DIRS), sorted
// for deterministic output across platforms.
async function collectMarkdown(root) {
  const found = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(path.join(dir, e.name));
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        found.push(path.join(dir, e.name));
      }
    }
  }
  await walk(root);
  found.sort();
  return found;
}

// Check one Markdown file. Returns an array of broken-link descriptors
// ({ target, resolved }); empty means every local link resolved.
async function checkFile(file) {
  const raw = await fs.readFile(file, "utf8");
  const targets = extractTargets(stripCode(raw));
  const dir = path.dirname(file);
  const broken = [];
  for (const rawTarget of targets) {
    const c = classifyTarget(rawTarget);
    if (c.kind !== "local") continue;
    const resolved = path.resolve(dir, c.relPath);
    if (!(await exists(resolved))) {
      broken.push({ target: rawTarget.trim(), resolved });
    }
  }
  return broken;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const files = await collectMarkdown(opts.root);
  if (files.length === 0) {
    console.log(`[check-doc-links] 0 file(s) checked (no Markdown under ${opts.root})`);
    return;
  }

  let okCount = 0;
  let failCount = 0;
  for (const file of files) {
    const rel = path.relative(opts.root, file) || file;
    const broken = await checkFile(file);
    if (broken.length === 0) {
      okCount++;
      if (!opts.quiet) console.log(`  ok  ${rel}`);
    } else {
      failCount++;
      console.error(`FAIL ${rel}`);
      for (const b of broken) {
        console.error(`     - broken link: ${b.target}  ->  ${b.resolved}`);
      }
    }
  }

  console.log(
    `[check-doc-links] ${okCount} ok, ${failCount} failed, ${files.length} total`,
  );
  if (failCount > 0) process.exit(1);
}

// Run only as the CLI entry point — importing this module for its exports
// (extractTargets/classifyTarget/stripCode, e.g. from the test suite) must not
// trigger a repo scan or a process.exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
