# QA — Sprint 1 Acceptance Criteria

Sprint: **1 — Database Foundation + Census API + Addressable Market Engine**
Status: NOT STARTED

> All tests below must pass before Sprint 1 is closed. Do not begin Sprint 2 until every row is checked off.

## Supabase Project Isolation

| Test | Pass Threshold | Notes | Status |
|------|---------------|-------|--------|
| Active project ID = `cprltmwwldbxcsunsafl` | Confirmed before any schema op | NIP = `kjweckggegifjmmqccul` — must not match | — |
| No cross-project references in codebase | `grep -r kjweckggegifjmmqccul .` returns empty | | — |

## Database Schema

| Test | Pass Threshold | Notes | Status |
|------|---------------|-------|--------|
| All 6 tables exist via migration files | Confirmed in Supabase dashboard | Verify via `list_tables` | — |
| RLS enabled on all tables | Unauthorized user returns zero rows | User B cannot read User A's records | — |
| `prospects.email` unique constraint | Duplicate email insert → error | Not a silent duplicate | — |
| `updated_at` trigger fires on row change | Timestamp updates on any field change | Test with manual update | — |
| Foreign keys enforced | `deals` with invalid `prospect_id` → error | | — |
| `deals.stage` range 1–7 | Out-of-range insert → error | Check constraint | — |

## Addressable Market Formula

The formula validation tests logic correctness and plausibility — not a specific numeric target.
Outputs must be defensible based on the locked constants and the demographic profile of each territory.

| Test | Pass Threshold | Reasoning | Status |
|------|---------------|-----------|--------|
| Formula runs without error on valid address | Completes and returns integer | Basic smoke test | — |
| Formula error on bad/unrecognized address | Graceful error returned + logged | No silent failure, no unhandled crash | — |
| Output is a single integer (not a range) | One number stored in `territories.addressable_market_total` | Per spec — simple and credible | — |
| High-COL territory output is lower than low-COL territory | Boston output < Springfield MO output | Housing cost adjustment via B25105 must produce directionally correct results | — |
| Output falls in plausible range for a mid-size metro | 2,000–8,000 for a standard 30-min drive-time territory | Extreme outliers (< 500 or > 15,000) indicate formula error | — |
| Income floor enforced | Households below $60K contribute zero to output | Verify in Edge Function logic | — |
| Financing take-up rate applied correctly | 70% multiplier applied to $60K–$99K bands only | Not applied to $100K+ bands | — |
| Housing cost adjustment directionally correct | High median housing cost → lower affordability multiplier for low income bands | Formula: `base_rate × MAX(0, 1 − (median_housing_cost × 12) / income_band_midpoint)` | — |
| Formula constants not hardcoded | `grep` for literal prevalence values in Edge Function returns empty | All values imported from `/lib/addressable-market-constants.ts` | — |
| Census cache: skip re-fetch if < 90 days | Second run within 90 days uses `census_raw_data` | Verify `census_pulled_at` timestamp check logic | — |
| Census API response time | < 3 seconds per territory calculation | Batch zip code calls in a single request | — |

## API Integrations

| Test | Pass Threshold | Notes | Status |
|------|---------------|-------|--------|
| Mapbox geocoding: address → lat/lng | Returns valid coordinates for a known test address | Use a real Austin address as test input | — |
| Mapbox Isochrone 30-min polygon | Valid GeoJSON stored in `territories.isochrone_30min` | Visual QA — polygon should look geographically plausible | — |
| Mapbox Isochrone 45-min polygon | Valid GeoJSON stored in `territories.isochrone_45min` | Outer ring visibly larger than 30-min polygon | — |
| Census ACS B01001 (age × gender) | Returns structured data for test zip codes | Verify age cohort breakdown is populated | — |
| Census ACS B19001 (household income) | Returns structured income band data | Verify all income bands present | — |
| Census ACS B25105 (housing costs) | Returns median monthly housing cost | Verify value is non-zero and plausible for test market | — |

## Admin UI

| Test | Pass Threshold | Notes | Status |
|------|---------------|-------|--------|
| Enter anchor address → geocoded | Coordinates appear in `territories` record | | — |
| View addressable market result | Single integer displayed | Matches Edge Function output in Supabase | — |
| Leif can view result without Trace access | Role-appropriate data visible | RLS allows Leif read access to territories | — |

## Sprint 1 Sign-Off Checklist

- [ ] All database schema tests pass
- [ ] Supabase project isolation confirmed
- [ ] Formula runs correctly and produces plausible output
- [ ] High-COL vs low-COL directional test passes
- [ ] Income floor and financing take-up logic verified
- [ ] Housing cost adjustment verified directionally correct
- [ ] All three Census ACS tables returning data
- [ ] Mapbox geocoding and isochrone integrated and returning valid GeoJSON
- [ ] Admin UI functional for Leif
- [ ] No formula constants hardcoded inline
- [ ] Trace reviews and signs off

**Trace sign-off date:** _______________
