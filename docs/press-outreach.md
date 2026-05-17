# Press Outreach Memo — halflife

_Last updated: 2026-05-17 (L4.3). **DRAFT — DO NOT SEND.** The autonomous routine is forbidden from sending email or posting publicly (`ROUTINE.md` stop conditions). This document is the human's outreach playbook: the pitch, the target list, the asset kit, and the send gate. Nothing here goes out until a person has ticked the **Send gate** below and the product is actually live._

The strategic bet (PLAN.md "Why now"): journalists on the AI-jobs beat need a **citable, neutral-feeling, per-role** source. Aggregate reports (WEF Future of Jobs, McKinsey, Goldman) are macro; the decade-old Will-Robots-Take-My-Job is dataset-frozen. The annual "Most At-Risk Roles 2026" page (`app/report/2026/page.tsx`, L4.2) is the artefact built to be quoted — this memo is how a reporter finds out it exists.

---

## 1. The pitch angle

One product, three distinct story hooks. Pick the hook per outlet — do not send the same paragraph to everyone.

- **Hook A — the ranking ("Most At-Risk Roles 2026").** A single-purpose tool's annual list of the roles closest to their AI tipping point. The story is the *ranking and its surprises* (which white-collar roles outrank the obvious ones), not the tool. Best for general-interest tech/business desks.
- **Hook B — the personal primitive ("type your job title, get a countdown").** The angle is *the interaction*, not the data: an identity-forward, shareable card that made AI-job anxiety concrete and personal. Best for internet-culture / product reporters who cover what's spreading on LinkedIn.
- **Hook C — the method honesty.** Counter-programming: "we built the AI-job-loss tool and here's why you should distrust every number on it, including ours." Leans on `docs/methodology.md` (the score is a structured Claude judgement, not a labour-economics model — PLAN.md "anti-audience"). Best for skeptical / media-criticism writers; defuses the bad-faith debunk by pre-empting it.

**Subject-line seeds** (the human rewrites per reporter — never reuse verbatim, that is how a pitch reads as a blast):
- "The 2026 list of jobs closest to their AI tipping point — and the method behind it"
- "We built a 'when will AI take my job' tool. Here's what we got wrong on purpose."
- "A per-role AI obsolescence countdown — data + the caveats, ahead of [date]"

**Body skeleton (≤ 150 words, the human personalises the first line to a piece the reporter actually wrote):**
1. One line proving you read their beat (cite a specific recent article — not "I love your work").
2. What it is, in one sentence (the PLAN.md "What it is" framing).
3. The single most counter-intuitive finding from the live `most-at-risk-2026.json` (a role most people would not expect near the top).
4. The honesty line: it is a Claude judgement with a published methodology and stated limits, not a peer-reviewed labour model — link `docs/methodology.md`.
5. Offer: data under embargo, a walk-through, a named person on record. One sentence. No attachment on the cold email.

---

## 2. Target beats & outlets

Reporters move outlets; **track the beat and the person, not the masthead**. The human fills the bracketed names from a current search at send time — do not hardcode a byline that may be stale by launch.

| Beat | Why they fit | Outlet archetypes |
|---|---|---|
| AI & labour / future of work | Core fit — they cover exactly this thesis | Big-tech vertical, national business desk, a labour-focused newsletter |
| Internet culture / what's-spreading | Hook B — the share-card *as a phenomenon* | Platform/culture vertical, a large tech-culture newsletter |
| Career & workplace advice | Hook A reframed as reader service ("is your role on the list?") | Personal-finance/career desk, a careers newsletter |
| Tech criticism / AI skepticism | Hook C — the honest-limits angle is a feature for them | Media-criticism column, a skeptic-leaning AI newsletter |
| Trade press for the most-at-risk roles | Vertical depth — pitch the *one* role that outlet's readers are | Legal-tech, marketing, customer-support, design trades |

**Tiering.** Tier 1: 6–10 individually-researched reporters whose recent work is squarely on this thesis — bespoke email each, staggered over days. Tier 2: relevant newsletters/trades, lighter touch, after Tier 1 has had first look. **No PR-wire blast** — a single-purpose tool gets exactly one credibility shot; a wire dump spends it.

**Newsletters are the asymmetric bet.** A mid-size AI/work newsletter linking the report drives more *qualified* traffic and durable backlinks (PLAN.md Phase-2 success metric: ≥1 journalist citation, SEO ranking) than a one-day spike from a large outlet. Prioritise accordingly.

---

## 3. Asset kit (prepare before any send)

Linked, never attached (attachments tank deliverability and read as spam):

- **The live report page** — the `/report/2026` URL, populated. This is the citable artefact; do not pitch before L4.1b has run and the real ranking is live (an empty "report is generating" state is an instant-disqualify for a journalist).
- **Methodology** — public `docs/methodology.md` (or its on-site equivalent). The honesty line is load-bearing for Hook C and pre-empts the debunk; it must be reachable in one click.
- **A two-paragraph fact sheet** — what it is, who built it, what the score is and explicitly is *not*, the data date, one contact. Plain page, no PDF.
- **2–3 pre-generated OG share cards** for visually-surprising roles (the L2.6 `/api/og/[slug]` route) — gives a reporter a ready image and shows the share primitive without them having to drive the tool.
- **One on-record human + one line of provenance** — "built by [name], analysis is Claude [model], here is the prompt-version and methodology." Anonymous tools do not get cited.

---

## 4. Send gate (hard — a person ticks every box)

Do **not** send a single email until all are true:

- [ ] Product is live on the final domain (L5.1/L5.2 done) — never pitch a preview URL or a pre-launch promise.
- [ ] L4.1b has run: `/report/2026` shows the **real** ranking, not the empty state. Spot-check the top 10 against `data/report/most-at-risk-2026.json`.
- [ ] `docs/methodology.md` (or on-site equivalent) is public and the limits/disclaimer section is current.
- [ ] A named person has agreed to be quoted and has a holding answer for the obvious hostile question ("isn't this just vibes from a chatbot?" — the honest answer, from the methodology, is the answer).
- [ ] Analytics live (L2.9 Plausible) so referral traffic and the citation are actually measurable against the Phase-2 metric.
- [ ] Tier-1 list is individually researched — every email cites a specific real article by that reporter. Zero merge-tags.
- [ ] Legal/claims pass: nothing says "will" where the product says "~estimated"; no implication of a labour-economics model. The pitch inherits the product's hedging.

If any box is unticked, the correct action is to **not send** and note the blocker — a premature pitch to a Tier-1 reporter is unrecoverable (they will not re-open it later).

---

## 5. Follow-up & after

- **One** follow-up per Tier-1 reporter, ≥ 4 business days later, two sentences, adds something new (a fresh finding / a data update) — never "just checking in".
- No follow-up to Tier 2.
- Silence is an answer. After one follow-up, stop. A second nudge converts a soft no into a permanent no and burns the relationship for the *next* annual report.
- If a piece runs: thank them once, link it from the site as a citation (the Phase-2 metric), and add the reporter to a *light* annual-report-only list — never a general mailing list (PLAN.md has no newsletter spam posture).
- Log outcomes (pitched / opened / replied / ran) somewhere durable so the 2027 report's outreach starts from evidence, not memory.

---

## 6. Hard don'ts

- Do **not** send from the autonomous routine. Ever. This file is a plan; sending is a human action behind the send gate (`ROUTINE.md`: a leaf that would send email or post publicly is a stop condition).
- No PR wire, no scraped-list blast, no "exclusive" offered to more than one outlet at a time.
- Do not oversell the science. The product is "dramatic, opinionated, useful" by design (PLAN.md anti-audience); a pitch that claims rigour invites the exact debunk Hook C is built to absorb.
- Do not pitch individual readers' roles as "doomed" to a reporter — the framing is *forecast with a pivot path* (the product always returns pivot steps); a doom-only pitch misrepresents the tool and ages badly.
- Do not buy a media database or a "guaranteed placement" service. One researched email beats a thousand wired ones for a tool whose entire asset is looking neutral.
