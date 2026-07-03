# /data — static public-source datasets (formula-v2-public-source)

In-repo static files backing the addressable-market formula. **Not live APIs** — each is a
manual one-time download with a provenance header. No API keys are stored for these.

| File | Task | Purpose | Status |
|------|------|---------|--------|
| `hud-usps-zip-crosswalk.json` | B | HUD USPS ZIP→ZCTA crosswalk. **Geography join only** (which ZCTAs belong to a county/territory). | ⛔ Placeholder — `rows: []`, `manual_download_required: true` |
| `experian-credit-share-by-state.json` | C | Experian FICO≥670 credit-qualified share by state (natl 70.4%, Sept 2025). | ⬜ Task C |
| `prevalence-by-age-sex.json` | D | Peer-reviewed hair-loss prevalence by age band × sex. | ⬜ Task D |

## HUD USPS ZIP Code Crosswalk — download procedure

1. Go to <https://www.huduser.gov/portal/datasets/usps_crosswalk.html>.
2. Select the **ZIP–ZCTA** crosswalk (the "ZIP Code Crosswalk" dataset). Do **not** use
   Fair Market Rent, Income Limits, CHAS, or NCWM — those are different HUD methodologies
   not used by this formula.
3. Download the latest quarter's file (Excel/CSV).
4. Transform to the row schema `{ zip, zcta, county_fips, res_ratio }` and write into
   `hud-usps-zip-crosswalk.json` under `rows`.
5. Fill `provenance.quarter` and `provenance.downloaded_at`, and set
   `manual_download_required` to `false`.

Until step 5 is done, `assertCrosswalkPopulated()` (see `src/lib/hud-crosswalk.ts`) throws in
the pipeline path — so a missing extract fails loudly rather than silently producing empty joins.
The full national extract is required before **Task D** (Marin spot-check) and **Task G**
(national reconciliation).
