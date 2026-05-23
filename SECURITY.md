# Security policy — halflife

Thanks for taking the time to report a security issue. This file is the
repository-level counterpart to the website's `/.well-known/security.txt`
(RFC 9116): the two surfaces point at the same disclosure channel so
there is one place reporters of either kind end up.

## Reporting a vulnerability

Please **do not** open a public GitHub issue, pull request, or discussion
for security-relevant reports. Use **GitHub Security Advisories**, which
keeps the report private until coordinated disclosure:

  https://github.com/internetyev/halflife/security/advisories/new

The advisory form lets you describe the impact, suggest a fix, and (if
helpful) request a CVE. Reports are routed to the repository owner via
GitHub's own notification system — no single mailbox to misconfigure or
miss.

If you are unable to use GitHub Security Advisories for any reason, you
may instead reach the maintainer via the GitHub profile listed on the
repository owner.

## Scope

This repository is the source for the halflife website and the autonomous
routine that drives it. Reports in scope include, but are not limited to:

- Vulnerabilities in code published in this repository.
- Issues in the deployed website at the canonical origin (see
  `public/.well-known/security.txt` `Canonical:`).
- Supply-chain concerns in committed dependency manifests
  (`package.json`).

Out of scope:

- Reports against third-party services this project integrates with
  (Anthropic, Vercel, Vercel KV, Plunk, Plausible). Please report those
  directly to the provider.
- Volumetric denial-of-service tests.
- Findings that require physical access to a maintainer's device, social
  engineering of a maintainer, or compromise of accounts outside this
  repository's control.

## Response expectations

This is a small project run by one maintainer. Acknowledgement of a
report is best-effort; please allow a few days before following up. We
will work with you on a coordinated disclosure timeline that protects
users.

## Public surfaces

- `/.well-known/security.txt` — RFC 9116 file served by the website.
- This file (`SECURITY.md`) — surfaced by GitHub in the **Security** tab
  and in the new-issue / new-PR contributor flow.

Both reference the same `Contact:` URL above.
