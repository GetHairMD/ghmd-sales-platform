# /reference — archived, NOT wired into the addressable-market formula

Material retained for potential future use but **deliberately out of the active compute path.**
Nothing here is imported by the addressable-market formula.

| File | What it is | Why archived |
|------|-----------|--------------|
| `hair-loss-prevalence.ts` | `HAIR_LOSS_PREVALENCE` + `AgeGenderRate` (moved out of `lib/addressable-market-constants.ts`) | The v2 methodology is an **affordability** model — `addressable = households × income × credit`, **no prevalence term**. See decision_log "Addressable Market Formula Corrected — Prevalence Term Removed". |
| `prevalence-by-age-sex.json` | Provenance artifact (28 entries, 6 studies) generated from the constant | Same — retained for a possible future demand/expected-patients view. |

**Why kept, not deleted:** the prevalence values + peer-reviewed citations (Norwood 1975; Rhodes 1998;
Gan & Sinclair 2005; Birch 2002; Sinclair 2011; Vary 2010) are real work that may feed a future
demand-side metric. They just don't belong in the affordability-based addressable formula, which
reconciles to the locked QA targets (Marin 64,194; national 69.8M/56.4M) only without them.
