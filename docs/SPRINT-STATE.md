# Sprint State — GHMD Sales Platform

Last updated: 2026-06-24

## Current Sprint

**Sprint 1 — Database Foundation + Census API + Addressable Market Engine**
Weeks 1–2 · Status: **NOT STARTED**

## Sprint Sequence

| Sprint | Title | Weeks | Status |
|--------|-------|-------|--------|
| 1 | Database Foundation + Census API + Addressable Market Engine | 1–2 | NOT STARTED |
| 2 | Mapbox Territory Map + Proposal Page Architecture | 3–4 | LOCKED |
| 3 | Spoke Candidate Auto-Screen | 5–6 | LOCKED |
| 4 | AesthetiX Webhook + CRM Trigger + Pipeline Automation | 7–8 | LOCKED |

> **Rule:** Do not open Sprint N+1 until Sprint N passes all acceptance criteria. Sprints are sequential.

## Sprint 1 — Scope

### Deliverables

- [ ] New Supabase project confirmed isolated from NIP (`cprltmwwldbxcsunsafl` ≠ `kjweckggegifjmmqccul`)
- [ ] All 6 tables created via migration files with RLS enabled
  - `prospects`
  - `deals`
  - `territories`
  - `call_scores`
  - `spoke_candidates`
  - `outreach_touches`
- [ ] Mapbox geocoding: address → lat/lng on prospect create
- [ ] Mapbox Isochrone API: anchor address → 30-min + 45-min GeoJSON polygons
- [ ] Census ACS API: zip codes → B01001 + B19001 + B25105 data
- [ ] Addressable market Edge Function: full formula implemented and tested
- [ ] Formula constants imported from `/lib/addressable-market-constants.ts` (not inline)
- [ ] Test suite: 3 territories validated against Austin baseline (5,483)
- [ ] Leif-facing admin UI: enter anchor address → view addressable market result

### Acceptance Criteria

See `docs/QA-SPRINT-1.md` for full test matrix.

## Pre-Sprint 1 Blockers (Open Items)

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Create new Supabase project: ghmd-sales-platform | Trace | OPEN |
| 2 | Register Census API key at api.census.gov (free) | Leif | OPEN |
| 9 | Confirm Austin 5,483 addressable market baseline | Trace + Bruce | OPEN |

## Pre-Sprint 2 Blockers

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 4 | Configure proposals.gethairmd.com subdomain on Netlify | Leif | OPEN |
| 10 | Physician testimonials for proposal page (2–3 quotes + photos) | Bruce | OPEN |

## Pre-Sprint 3 Blockers

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 5 | Confirm Google Cloud account + enable Places API + billing | Trace | OPEN |

## Pre-Sprint 4 Blockers

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 6 | Get AesthetiX webhook endpoint + secret from vendor | Trace | OPEN |
| 7 | Confirm DocuSign API credentials + webhook config | Trace | OPEN |

## Standing Critical Flags

- **Legal/Compliance**: No call recording until ByrdAdatto approves consent language
- **FTC Franchise Rule**: Rick Dahlson must review before first franchisee prospect enters pipeline
- **Formula validation**: Austin output ±15% of 5,483 is pass; if deviation > ±25%, pause and audit — do not auto-adjust constants to hit the target
- **Dual-system risk**: AesthetiX + new system overlap must not exceed 60 days; cutover date TBD before Sprint 4
