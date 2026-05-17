# Launch Posts — halflife

_Last updated: 2026-05-17 (L5.3). **DRAFT — DO NOT POST.** The autonomous routine is forbidden from posting publicly or sending external messages (`ROUTINE.md` stop conditions). This file is the human's launch-copy kit: the ProductHunt listing, the LinkedIn posts, the X thread, the post gate, and the launch-day order of operations. Nothing here goes out until a person has ticked the **Post gate** below and the product is actually live on its final domain._

The strategic bet (PLAN.md "Why now" + "Audience"): the share primitive *is* the distribution. A countdown card per role is a built-for-LinkedIn object; the launch posts are not the campaign, they are the *seed* that gets the first few hundred people to type their own title and share their own card. So the copy's job is to make the reader run the tool on themselves, not to admire the tool. Tone is PLAN.md's "dramatic, opinionated, useful — not peer-reviewed", and every public post that names a number also names the pivot path (PLAN.md risks table: a doom-only post ages badly and misrepresents a tool that always returns pivot steps).

Placeholders in `[brackets]` are human-filled at post time — the final domain (`[DOMAIN]`, human-gated L5.1) and the launch date (`[DATE]`) are unknown to the routine on purpose; never hardcode a name the L1.7b/L5.1 sign-off has not picked.

---

## 1. ProductHunt

### Listing fields

- **Name:** `[FINAL NAME]` (the L1.7b/L5.1 pick — `roleclock.ai` is the current tentative, D-014/D-026; do not assume).
- **Tagline (≤ 60 chars):** pick one at post time, A/B in the first hour is not possible on PH so commit:
  - `Type your job title. Get an AI-obsolescence countdown.`
  - `How many years until AI replaces your role?`
  - `Your job's AI countdown — with a way out.`
- **Topics:** Artificial Intelligence, Career, Productivity (PH allows 3 — these match the audience, not the tech).
- **First comment (the maker comment — this is the post that actually converts; ≤ 180 words):**

> Hey PH 👋
>
> I kept seeing the same two genres of AI-jobs content: macro reports (WEF, McKinsey) that say "23% of tasks" about no one in particular, and a decade-old "Will Robots Take My Job" that's frozen on 2013 data. Neither one answers the question a person actually asks at 1am: *mine. how long do I have.*
>
> So `[FINAL NAME]` does exactly one thing. You type your job title, you get a survival score, a countdown in years, the AI tools already eating into the role — and a 3–5 step pivot path, because a number with no exit is just doom.
>
> The honest part: this is a structured Claude judgement against a published rubric ([DOMAIN]/methodology), not a labour-economics model. I wrote down what it is and what it explicitly is not. Argue with the number — that's the point of publishing the method.
>
> Try your own title and tell me if the countdown feels wrong. The roles people *don't* expect near the top are the interesting part: [DOMAIN]/report/2026

- **Gallery:** 1 hero (the result card for a recognisable role), 2–3 OG cards from `/api/og/[slug]` for surprising roles, 1 of the `/report/2026` ranking. No video for v1 — a 10-second screen capture of typing a title → card is better than a produced trailer and is optional polish, not a blocker.

### ProductHunt timing & conduct

- Launch 12:01 AM PT (PH's day boundary); the maker is reachable to reply for the **first 6 hours** — unanswered comments in hour 1 are the single biggest avoidable miss.
- Reply to every comment that asks "what about [role]" by actually running it and pasting the card. The thread *is* the demo.
- **No vote solicitation, no vote rings, no "upvote pls" DMs** — PH shadow-ranks this and it reads as exactly the inauthentic thing the methodology page is built to counter. One honest LinkedIn post (below) pointing at the PH page is the only amplification.

---

## 2. LinkedIn

LinkedIn is the home turf (PLAN.md: "LinkedIn is starving for shareable, identity-forward AI content"). Two posts, different jobs.

### 2a. Founder post — launch day (≤ 200 words, no external link in the body; link in first comment — LinkedIn throttles posts with outbound links in the body)

> I built a tool that tells you how many years your job has before AI does most of it. Then it tells you what to do about it.
>
> You type your title. You get back: a survival score, a countdown, the AI tools already automating pieces of the role, and a 3–5 step pivot. That's the whole product. One question, answered for *you*, not for "the labour market."
>
> Two things I want to be straight about:
>
> 1. It's opinionated on purpose. It's a structured AI judgement against a rubric I published, not a peer-reviewed economic model. The methodology page says so in plain words. If the number's wrong, the method is right there to argue with.
> 2. Every result ends in a pivot path. A countdown with no way out is doom-mongering, and doom-mongering is useless. The point isn't the fear — it's the move you make next.
>
> The roles closest to the tipping point aren't always the obvious ones. Type yours. Tell me where it's wrong.
>
> (link in comments 👇)

First comment: `[DOMAIN]` + one line: "Methodology, including what this is *not*: [DOMAIN]/methodology".

### 2b. The reframe post — 3–5 days after launch, only if there is real traction

Data-driven, screenshot of `/report/2026`, lead with the **single most counter-intuitive role** in the live top 10 (read it from `data/report/most-at-risk-2026.json` at post time — do not pre-write the role name here, it does not exist until L4.1b runs). Pattern: "The most at-risk role on the list this week isn't [the one everyone names]. It's [X]. Here's the reasoning the tool gave —" then the pivot. This is the post that gets *reshared by people in role X*, which is the actual growth loop.

---

## 3. X / Twitter thread (optional, lower priority than PH + LinkedIn)

X is secondary for this audience but cheap to run. A 4-tweet thread, posted launch day after the LinkedIn post is live:

1. Hook: "We built a tool that gives your job an AI-replacement countdown. The roles at the top of the list surprised us." + the `/report/2026` OG image.
2. What it is in one sentence + the pivot-path honesty line.
3. The one counter-intuitive finding (same role as the LinkedIn reframe, pulled live).
4. The method-honesty line + link to `[DOMAIN]/methodology`. CTA: "type yours, tell us where it's wrong."

No thread-jacking, no reply-guy growth tactics, no engagement-bait "agree?" — same credibility logic as the press memo (`docs/press-outreach.md` §6).

---

## 4. Post gate (hard — a person ticks every box before anything goes out)

Mirrors the press-outreach Send gate (`docs/press-outreach.md` §4) and `docs/launch-checklist.md` §7. Do **not** post a single launch item until all are true:

- [ ] Product is live on the final domain (`docs/launch-checklist.md` §1–§5 complete; L5.1/L5.2 done). Never launch-post a preview URL or a "coming soon".
- [ ] L4.1b has run: `/report/2026` shows the **real** ranking, not the L4.2 "report is generating" empty state. The "surprising role" posts (2b, X#3) are unwritable and unpostable until then — they cite a live role.
- [ ] `docs/methodology.md` (or its on-site `/methodology` equivalent) is public and one click from every post's link. The honesty line is load-bearing in all three channels.
- [ ] Disclaimer + pivot path visible on every result (per `docs/launch-checklist.md` §4) — the posts promise "it always ends in a pivot"; that must be true on the page.
- [ ] Analytics live (L2.9 Plausible) so launch-day referral traffic from PH/LinkedIn/X is actually measurable against the PLAN.md Phase-1 metrics (1k uniques, ≥30% share rate).
- [ ] L5.4 email capture wired and tested with a real submission — a launch spike with no capture wastes the one day of peak attention.
- [ ] Claims pass: nothing in any post says "will" where the product says "~estimated"; no post implies a peer-reviewed model. Public copy inherits the product's hedging (same rule as the press memo).
- [ ] The maker is actually free for the **first 6 hours** after the PH post to reply in-thread. A launch with an absent maker underperforms more than a delayed launch.

If any box is unticked, the correct action is to **not post** and fix the blocker. A ProductHunt launch is one-shot per product — a premature launch into an empty `/report/2026` or a dead email form is unrecoverable.

---

## 5. Launch-day order of operations (once the gate is green)

1. **00:01 PT** — ProductHunt goes live (listing + maker first comment).
2. **~08:00 the human's local** — LinkedIn founder post (2a); link in first comment; cross-link the PH page in a second comment.
3. **+1–2h** — X thread (§3), quoting the live PH/LinkedIn momentum if any.
4. **All day** — maker replies in the PH thread by *running titles people name*. This is the demo and the growth loop; it is not optional.
5. **+3–5 days, only if traction is real** — the LinkedIn reframe post (2b) with the live counter-intuitive role. Skip it entirely if the launch was flat — a forced "look at our data" post into silence burns credibility for the annual-report cycle.
6. **Log outcomes** (PH rank/upvotes/comments, LinkedIn impressions/reshares, referral traffic in Plausible) somewhere durable so the next launch and the 2027 report start from evidence, not memory — same discipline as `docs/press-outreach.md` §5.

---

## 6. Hard don'ts

- Do **not** post from the autonomous routine. Ever. This file is a plan; posting is a human action behind the Post gate (`ROUTINE.md`: a leaf that would post publicly is a stop condition).
- No upvote/like/comment solicitation, no vote rings, no engagement-bait. The product's entire asset is looking neutral and honest; manufactured engagement is the one thing that poisons it (mirrors `docs/press-outreach.md` §6).
- Do not launch-post the home `/` form as the shared link where a per-role link works better — but the *launch* posts deliberately point at the home tool and `/report/2026`, because the call to action is "run *your* title", not "look at one role" (that's the press memo's job, with its per-reporter role pick).
- Do not oversell rigour. "Dramatic, opinionated, useful" is the brand (PLAN.md anti-audience); a launch post that claims scientific authority invites the exact debunk Hook C of the press memo is built to absorb — and on PH/LinkedIn that debunk happens in the replies, in public, on launch day.
- Do not pre-write the "surprising role" copy in this file or anywhere. It must be read from the live `data/report/most-at-risk-2026.json` at post time; a stale or invented role name is an instant credibility loss and is exactly the frozen-dataset failure the product exists to beat.
- No paid promotion, no PH "hunter for hire", no follow-for-follow. One honest post per channel, then let the share primitive do the distribution it was designed for.
