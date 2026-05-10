# halflife — Naming Shortlist (L1.7b — SERP data merged)

_Last updated: 2026-05-11. Status: **gate 4 measured** — corgi-serp run against the 6 unique candidate roots (`halflife`, `obsolesce`, `replaced`, `replacedby`, `roleclock`, `until`), geo=US, depth=10, mode=standard. Spend: ~$0.004 (7 queries × $0.0006 incl. one head-term probe), logged in LEDGER. Gates 1 (TM), 2 (.com collision), 3 (registrar price) remain human-verifiable._

## Measurement notes

- Gate 4 is now measured, not predicted. The earlier L1.7a predictions were correct for `halflife.*` and `replaced.by` (both dominated by video-game franchises) but **wrong for `until`** — the SERP is dictionary/grammar content, no brand collisions in the top 10.
- Gates 1, 3 still need human action (USPTO/EUIPO TM search + registrar list-price check). Gate 2 (.com collision) is browser-verifiable; routine best-effort estimates retained below.

## Candidates

The seed list from [PLAN.md §Naming](../PLAN.md) and [D-013](../DECISIONS.md), expanded so each `name + TLD` combo is scored as its own candidate (D-013 gate 2 treats `name + TLD` as the unit):

1. `halflife.work`
2. `halflife.ai`
3. `halflife.jobs`
4. `obsolesce.me`
5. `replaced.by`
6. `replacedby.ai`
7. `roleclock.ai`
8. `until.ai`

No same-spirit additions in this pass — keep the matrix tight; let L1.7b add candidates only if every seed candidate fails a gate.

## Hard gates — preliminary assessment

D-013 hard gates: any failure → drop the candidate, no scoring. The routine's confidence on each gate is annotated. **All gate verdicts here are preliminary.**

| # | Candidate | (1) TM | (2) .com collision | (3) ≤ $200/yr | (4) SERP top-10 brands (measured) | Verdict |
|---|---|---|---|---|---|---|
| 1 | `halflife.work` | TBD-human | **FAIL** — `halflife.com` Valve franchise | likely (.work $5–15) | **FAIL — 6** (Wikipedia game pages, Steam store, half-life.com, Fandom, IMDB, r/HalfLife) | **DROP** on gate 2 + gate 4 |
| 2 | `halflife.ai` | TBD-human | same as #1 | likely fails — `.ai` premium on real-word | same as #1 | **DROP** |
| 3 | `halflife.jobs` | TBD-human | same as #1 | `.jobs` Employ-Media policy gate + ~$120/yr+ | same as #1 | **DROP** |
| 4 | `obsolesce.me` | TBD-human | low (rare verb) | likely (.me $20–30) | **PASS — 0** (dictionary/thesaurus only: Merriam-Webster, dictionary.com, Wikipedia, Thesaurus, Vocabulary, Cambridge, Wiktionary) | **SURVIVES — strongest gate-4 result** |
| 5 | `replaced.by` | TBD-human | `replaced.com` generic | `.by` Belarus ccTLD eligibility risk | **FAIL — 5+** ("REPLACED" indie game: Steam, playreplaced.com, Wikipedia, Xbox, Metacritic, Reddit, GamingTrend) | **DROP** on gate 4 (+ gate 3 risk) |
| 6 | `replacedby.ai` | TBD-human | low (unusual compound) | possibly aftermarket — check | **PASS — 0** (grammar Q&A only: StackExchange, Reddit r/grammar, Quora, Ludwig, WordHippo) | **SURVIVES** |
| 7 | `roleclock.ai` | TBD-human | low (novel compound) | likely standard `.ai` | **PASS — 1–2 fuzzy** (no exact-name brand; "Rollock" safety clamp + 3M "Roloc" abrasive disc + Aliexpress wall-clock listings — Google is fuzzy-matching "role" + "clock", not the compound) | **SURVIVES** |
| 8 | `until.ai` | TBD-human | possible — "Until" fintech/AI brands exist | likely fails — 5-char real-word premium | **PASS — 0** (dictionary/grammar only — earlier prediction was wrong) | **SURVIVES on gate 4**; likely DROP on gate 3 + gate 1 risk |

**Survivors after measured gate 4:** `obsolesce.me`, `replacedby.ai`, `roleclock.ai`, `until.ai`. The latter survives gate 4 but is at high risk on gates 1 (TM — "Until" exists as fintech/AI brand) and 3 (premium `.ai` pricing on a 5-char real-word).

## Scored dimensions (D-013 rubric)

Per D-013, each dimension is 0–3, weighted, summed. Tie-break: lowest score variance to avoid one-dimension wonders.

- **Semantic fit (×3)** to obsolescence/countdown/career-stake — does the name read as on-brand at a glance on the share card?
- **SERP cleanness (×2)** — TBD pending L1.7b corgi probe.
- **Pronounceability (×2)** — can a journalist say it on a podcast without spelling it?
- **Memorability proxy (×1)** = length ≤ 10 chars + single morpheme.
- **TLD signal (×1)** in AI/jobs space: `.ai ≈ .com` > `.work` > `.jobs` > `.me`/`.by`.

The matrix below excludes the SERP column (TBD). Routine-scorable subtotal max = (3×3)+(3×2)+(3×1)+(3×1) = **21**.

| Candidate | Sem (×3) | Pron (×2) | Mem (×1) | TLD (×1) | Subtotal /21 | Variance flag |
|---|---|---|---|---|---|---|
| `halflife.work` | 2 → 6 | 3 → 6 | 2 → 2 | 2 → 2 | **16** | low |
| `halflife.ai` | 2 → 6 | 3 → 6 | 2 → 2 | 3 → 3 | **17** | low |
| `halflife.jobs` | 2 → 6 | 3 → 6 | 2 → 2 | 1 → 1 | **15** | low |
| `obsolesce.me` | 3 → 9 | 2 → 4 | 2 → 2 | 1 → 1 | **16** | mid (Pron + TLD weak) |
| `replaced.by` | 3 → 9 | 3 → 6 | 1 → 1 | 1 → 1 | **17** | mid (Mem + TLD weak) |
| `replacedby.ai` | 3 → 9 | 3 → 6 | 1 → 1 | 3 → 3 | **19** | low |
| `roleclock.ai` | 3 → 9 | 3 → 6 | 2 → 2 | 3 → 3 | **20** | low (most consistent) |
| `until.ai` | 1 → 3 | 3 → 6 | 3 → 3 | 3 → 3 | **15** | high (Sem 1 vs others 3) |

### Per-candidate scoring justifications

- **`halflife.*` (Sem 2)** — "half-life" carries a decay semantic (radioactive decay, gameplay-time-to-kill), which lands near obsolescence but with strong gaming/physics overtones that compete for the brand on the share card.
- **`obsolesce.me` (Sem 3, Pron 2)** — bullseye on the obsolescence frame; minor pronounceability hit because the verb form is uncommon (most readers know the noun "obsolescence" but not the verb), so a journalist would pause before saying it.
- **`replaced.by` (Sem 3, Mem 1)** — strong because the share card reads literally as a sentence ("replaced.by/paralegal"), but it's a two-word phrase, so memorability proxy fails the "single morpheme" criterion.
- **`replacedby.ai` (Mem 1)** — same Sem strength as `replaced.by`, single-token URL helps recall, but still a compound (replaced + by).
- **`roleclock.ai` (Sem 3, all dimensions ≥ 2)** — "role" + "clock" maps directly onto the countdown product mechanic. Compound but tight (9 chars), pronounceable cold, top-tier TLD.
- **`until.ai` (Sem 1, Mem 3)** — single morpheme + 5-char URL is the memorability ceiling, but the semantic frame is too generic; a "until" countdown could be about anything.

## Recommendation (after gate-4 measurement)

**`roleclock.ai`** remains the lead — 20/21 routine-scored subtotal, lowest variance, novel compound, no exact-name brand collision. The fuzzy "Rollock" + 3M "Roloc" results are visually distinct from "roleclock" and do not compete on the same query.

**Runner-up: `obsolesce.me`** — promoted from third place by the measured data. The cleanest SERP of all candidates (0 brand collisions; pure dictionary content). The earlier L1.7a markdown was conservative on the pronounceability dimension; for a journalist-citation use-case "obsolesce" is harder to say cold than "roleclock," but the SERP cleanness and semantic precision ("your role is going obsolete") are real edges. Worth a serious second look before final decision.

**Third: `replacedby.ai`** — equally clean SERP (0 collisions), but compound + ".ai" makes it 13 characters typed and reads as a sentence, which is share-card-friendly but slug-unfriendly.

**Drop:** `halflife.*` (Valve collision), `replaced.by` ("REPLACED" game collision). `until.ai` is gate-4-clean but high-risk on TM + price; not recommended.

## Remaining human-gated checks before purchase (L5.1)

For each of `roleclock.ai`, `obsolesce.me`, `replacedby.ai`:

1. **Gate 1 — TM:** USPTO TESS + EUIPO eSearch on the bare word in classes 9, 35, 42 (software / advertising / SaaS).
2. **Gate 2 — `.com` collision:** browser-check `roleclock.com`, `obsolesce.com`, `replacedby.com` for live competing product. Empty parking pages and 404s don't fail this gate; an active brand does.
3. **Gate 3 — registrar list price:** Namecheap / Porkbun / 101domain quote, confirm ≤ $200/yr (no aftermarket / premium SLD).

The corgi gate-4 pass is the only one that needed the autonomous routine. The other three each take ≤ 5 minutes in a browser.

## Cost log

- L1.7a: $0.00 (dry-run only)
- **L1.7b (this pass): $0.004** — 6 batched naming queries × $0.0006 + 1 head-term diagnostic on `google reviews download` (used in a separate g-r-d note); LEDGER updated.
