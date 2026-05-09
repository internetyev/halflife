# halflife — Naming Shortlist (L1.7a working draft)

_Last updated: 2026-05-10. Status: **partial pass** — internal-criteria scoring complete; hard-gate verification pending L1.7b (needs `DATAFORSEO_LOGIN` for `corgi-serp` SERP probes + human registrar/trademark checks). The recommendation below is conditional on L1.7b clearing the four hard gates in [D-013](../DECISIONS.md)._

## Why this is partial

The L1.7 routine ran on a laptop with `corgi-serp` installed but no DataForSEO credentials configured (no `DATAFORSEO_LOGIN`, no `~/.corgi/config.yaml`). D-013 gate (4) requires a corgi-keywords SERP snapshot — substituting WebSearch would diverge from the ADR's measurement protocol, so the routine split L1.7 → L1.7a (this doc, internal scoring) + L1.7b (human-gated, see ROADMAP).

Likewise, gates (1) trademark and (3) registrar list-price are not authoritatively verifiable from this laptop without external API or registrar-account access; D-013 marks the actual purchase as L5.1 human-gated, so those gates are flagged here as **routine best-effort estimates** to be verified before purchase, not blocking decisions.

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

| # | Candidate | (1) TM clear? | (2) Live product on combo / .com collision | (3) ≤ $200/yr? | (4) SERP-noise (top-10 unrelated brands) | Verdict |
|---|---|---|---|---|---|---|
| 1 | `halflife.work` | likely (no AI-tools/jobs-class TM expected on the bare word) | **collision risk: HIGH** — `halflife.com` is the Valve gaming franchise (game collision, not jobs/AI, but the brand-fight reading of D-013 gate 2 still applies to the .com test) | likely (.work is cheap, $5–15) | **TBD: corgi probe pending — predicted HIGH** (Valve "Half-Life" + physics half-life dominate top results) | **likely DROP** on gate 2 + gate 4 |
| 2 | `halflife.ai` | likely | same .com collision as #1 | **likely fails** — `.ai` premiums on real-word names often blow past $200/yr; `halflife.ai` may also be in aftermarket | same as #1 | **likely DROP** on gate 2 + gate 4; possibly gate 3 |
| 3 | `halflife.jobs` | likely | same .com collision as #1 | **likely fails** — `.jobs` registration is restricted (Employ Media policy) and pricing is high (~$120+/yr at Tier-1 registrars), but the bigger blocker is the policy gate, not the price | same as #1 | **likely DROP** on gate 2 + gate 4; gate 3 risk |
| 4 | `obsolesce.me` | likely (rare verb, low TM saturation) | low collision risk (`obsolesce.com` is unlikely to be a major brand) | likely (.me is $20–30/yr) | **TBD: corgi probe pending — predicted LOW** (rare word, mostly dictionary results expected) | **plausible** — proceed to L1.7b |
| 5 | `replaced.by` | likely (common past-participle, hard to TM, but generic-class TM possible) | unclear — `replaced.com` exists as a generic placeholder; case-by-case review | unclear — `.by` is the Belarus ccTLD, registration may have eligibility/political-risk caveats | **TBD: corgi probe pending — predicted HIGH** ("replaced" is a high-frequency English verb) | **likely DROP** on gate 4; gate 3 caveat |
| 6 | `replacedby.ai` | likely | low collision risk on `replacedby.com` (unusual compound) | likely fails — premium .ai pricing on this length is borderline; possibly $50–150/yr if available, but check aftermarket | **TBD: corgi probe pending — predicted LOW** (unusual compound, near-empty SERP expected) | **plausible** — proceed to L1.7b |
| 7 | `roleclock.ai` | likely (novel compound) | low collision risk on `roleclock.com` | likely (.ai standard registration) | **TBD: corgi probe pending — predicted LOW** (novel compound, near-empty SERP expected) | **plausible** — proceed to L1.7b |
| 8 | `until.ai` | likely | possible collision — "Until" is a brand name in financial services + AI; check `until.com` and AI-tools class TM | likely fails — `until.ai` on a four-letter dictionary word is almost certainly aftermarket / premium-priced | **TBD: corgi probe pending — predicted VERY HIGH** ("until" is one of the highest-frequency English prepositions) | **likely DROP** on gate 4; possibly gate 1 + gate 3 |

The three candidates that survive routine-best-effort gates and are worth scoring: **`obsolesce.me`**, **`replacedby.ai`**, **`roleclock.ai`**. The five `halflife.*` / `replaced.by` / `until.ai` candidates are scored anyway for completeness, but the routine flags each as failing-likely on the noted gates.

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

## Tentative recommendation (conditional)

**`roleclock.ai`** — leads on routine-scored subtotal (20/21), low score variance (no one-dimension wonder), and is the strongest survivor on the routine's preliminary gate read (low predicted SERP noise, novel compound, standard `.ai` pricing).

**Runner-up:** `replacedby.ai` (19/21) — equal semantic strength, slightly weaker on memorability because of the compound form. Worth keeping in the L1.7b shortlist as the fallback if `roleclock.ai` fails a hard gate.

**Conditional on L1.7b confirming:**
1. `roleclock.ai` is registrable at standard `.ai` pricing (≤ $200/yr; not in aftermarket / not a premium SLD).
2. `roleclock.com` is not a live competing product.
3. No registered AI-tools / jobs-board / career-coaching trademark on "roleclock".
4. `corgi-serp --query roleclock --geo us --depth 10` returns ≤ 3 unrelated established brands in the top 10.

If any of those four fails, fall through to `replacedby.ai` and re-run gates.

## What L1.7b needs to do

1. Configure DataForSEO credentials on the routine's laptop (`DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` env vars or `~/.corgi/config.yaml`).
2. Run `corgi-serp --batch` over the bare names of the surviving candidates (`obsolesce`, `replacedby`, `roleclock`, plus any rescued `halflife`/`replaced`/`until` if the routine's preliminary gate read was too pessimistic). Estimated cost: ~$0.0006 per query × ≤ 8 queries = **≤ $0.005** of corgi spend, well inside the $0.30 cap from D-013.
3. For each survivor, count top-10 organic results that are unrelated established brands (gaming, physics, finance, etc.). Drop any candidate with > 3.
4. Verify gate (1) TM via USPTO + EUIPO TM-search (web), gate (2) live product via direct browser check on `name + TLD` and `name.com`, gate (3) registrar list-price via Namecheap / Porkbun / 101domain.
5. Update this doc: replace each "TBD" cell with the measured value, update the verdict column, and finalize the **single bolded recommendation** at the bottom. Log the corgi spend to LEDGER.md.

## Cost log

This run (L1.7a): corgi spend $0.00 (one dry-run only, no live API call). LEDGER updated accordingly.
