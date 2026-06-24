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

| Test | Pass Threshold | Notes | Status |
|------|---------------|-------|--------|
| Austin Westlake output | Within ±15% of 5,483 (range: 4,661–6,305) | Primary validation anchor from Dr. Sean Paul proposal | — |
| Austin deviation alert | If > ±25% of 5,483, pause and audit before proceeding | Do NOT auto-adjust constants to hit target — understand why | — |
| Boston MA output | 3,000–5,000 range | High COL market — lower income bands should auto-reduce | — |
| Springfield MO output | 3,000–5,000 range | Low COL market — lower bands should be higher than Boston | — |
| Formula error on bad address | Graceful error returned + logged | No silent failure, no unhandled crash | — |
| Census API response time | < 3 seconds per territory calculation | Batch zip code calls in a single request | — |
| Census cache: skip re-fetch if < 90 days | Second run within 90 days uses `census_raw_data` | Verify `census_pulled_at` timestamp check logic | — |
| Formula constants not hardcoded | `grep` for literal prevalence values in Edge Function returns empty | All values imported from `/lib/addressable-market-constants.ts` | — |

## API Integrations

| Test | Pass Threshold | Notes | Status |
|------|---------------|-------|--------|
| Mapbox geocoding: address → lat/lng | Returns valid coordinates for Austin Westlake test address | | — |
| Mapbox Isochrone 30-min polygon | Valid GeoJSON stored in `territories.isochrone_30min` | Visual QA against known Austin territory | — |
| Mapbox Isochrone 45-min polygon | Valid GeoJSON stored in `territories.isochrone_45min` | | — |
| Census ACS B01001 (age × gender) | Returns structured data for test zip codes | Use 78746 (Austin Westlake anchor) | — |
| Census ACS B19001 (household income) | Returns structured income band data | | — |
| Census ACS B25105 (housing costs) | Returns median monthly housing cost | Used in housing cost adjustment | — |

## Admin UI

| Test | Pass Threshold | Notes | Status |
|------|---------------|-------|--------|
| Enter anchor address → geocoded | Coordinates appear in `territories` record | | — |
| View addressable market result | Single integer displayed (not a range) | Matches Edge Function output | — |
| Leif can view result without Trace access | Role-appropriate data visible | RLS allows Leif read access to territories | — |

## Sprint 1 Sign-Off Checklist

- [ ] All database tests pass
- [ ] Supabase project isolation confirmed
- [ ] Austin Westlake output within ±15% of 5,483
- [ ] Boston and Springfield outputs in 3,000–5,000 range
- [ ] All three Census ACS tables returning data
- [ ] Mapbox geocoding and isochrone integrated
- [ ] Admin UI functional for Leif
- [ ] No formula constants hardcoded inline
- [ ] Trace reviews and signs off

**Trace sign-off date:** _______________
