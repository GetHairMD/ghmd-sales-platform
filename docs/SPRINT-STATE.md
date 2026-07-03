# Sprint State — GHMD Sales Platform

Last updated: 2026-07-03 (session #2)

## Current Sprint

**formula-v2-public-source — Replace legacy territory-sizing formula with public-source methodology**
Status: **OPEN** · Branch: `feat/formula-v2-public-source` (off clean main `be2dc4e`)
Go-live: **Monday, July 6, 5:00 PM CT** · Merge: squash Sunday after Second-Opinion Gate review.
Source of truth: `/handoffs/LATEST.md` (v2.24).

> All formula constants live in `/lib/addressable-market-constants.ts` (Rule 6) — never inline.

### Task Status

| Task | Description | Status | Commit |
|---|---|---|---|
| A | Dead-code deletion — PROPENSITY_TO_ACT, COL/housing-cost multiplier, B25105, unused $2,974 anchor | ✅ COMPLETE | `aabab95` |
| B | Income screen — ACS B19001 ZCTA, ≥ $37,415, straddle interpolation, `robustness_flag` (share_5pti/share_8pti < 0.5); ACS vintage → 2024; HUD ZIP↔County crosswalk (54,234 rows) + ZIP-as-ZCTA (decision_log #44) | ✅ COMPLETE | `7318a31` `8afcd42` `d3ef623` |
| C | Credit share — Experian FICO≥670 by state. Infra done (national 70.4% + fallback). **`states` HELD** pending Trace's Sept-2025 per-state table (Sat EOD); else 70.4% fallback + PR flag + decision_log row | 🟡 INFRA DONE | `1b28db1` |
| D | Cell formula — adults × income_share × credit_share × prevalence(age,sex), Σ cells. Prevalence canonical in constants (Rule 6); `data/prevalence-by-age-sex.json` generated as provenance (group-level citations). **Marin 64,194 run HELD** (Experian-gated, part of G) | 🟡 CORE DONE | `682e236` |
| E | `CUSTOMERS_NEEDED = 62` (locked 2026-07-03) replaces placeholder | ✅ COMPLETE | `7a556ad` |
| F | Penetration parameterized — base 0.01 / low 0.005 / high 0.02; proposal shows all three | ✅ COMPLETE | `7a556ad` |
| G | Demand-table reconciliation — full ZCTA pipeline (HUD → per-ZCTA B01001+B19001 → state credit → Σ cells); natl 69.8M/56.4M + Marin 64,194; reconcile `lib/census/` scaffold + replace transitional census.ts | ⏸ HELD (Experian-gated) | — |
| H | gethairmd.biz lead-capture — **OUT OF SCOPE** for this branch; lives in the separate gethairmd.biz marketing-site repo (confirmed Trace 2026-07-03) | ⛔ OUT OF SCOPE | — |

### Locked decisions (do not reopen) — decision_log 37–42

- **37** Affordability Anchor V2 ($37,415 @ 8% PTI; 5% PTI = robustness bound, flag never filter) · **38** ACS vintage bump superseded (B25105 deleted, moot) · **39** Pre-Execution Gate LIFTED (franchise question CLOSED) · **40** Grandfathering through 2026-07-31 + Penetration bridge.
- **41/42** (Hub-Spoke V1, NDP+EIP V1) are `platform='cross'` context — **not formula-sprint code**, awareness only.

### Acceptance / QA targets

National 69.8M @PTI8 · 56.4M @PTI5 · Marin 64,194 @PTI8 · Westlake correct = 9,108 (the 5,483 in a delivered proposal is a Bruce/Sean-Paul-facing correction, **not a code task**).

### Transitional caveat

`src/lib/census.ts::computeAddressableMarket` is a transitional body post-Task-A (prevalence-only, no propensity/COL) — interim numbers, guarded by the territories page try/catch — rebuilt across Tasks B/D/G and reconciled in G before merge.

## Sprint Sequence

| Sprint | Title | Weeks | Status |
|--------|-------|-------|--------|
| 1 | Database Foundation + Census API + Addressable Market Engine | 1–2 | OPEN |
| 2 | Mapbox Territory Map + Proposal Page Architecture | 3–4 | LOCKED |
| 3 | Spoke Candidate Auto-Screen | 5–6 | LOCKED |
| 4 | AesthetiX Webhook + CRM Trigger + Pipeline Automation | 7–8 | LOCKED |

> **Rule:** Do not open Sprint N+1 until Sprint N passes all acceptance criteria. Sprints are sequential.

## Sprint 1 — Scope

### Deliverables

- [ ] Supabase project isolation confirmed (`cprltmwwldbxcsunsafl` ≠ `kjweckggegifjmmqccul`)
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
- [ ] Formula constants imported from `/lib/addressable-market-constants.ts` (never inline)
- [ ] Formula logic validated against QA criteria in `docs/QA-SPRINT-1.md`
- [ ] Leif-facing admin UI: enter anchor address → view addressable market result

### Acceptance Criteria

See `docs/QA-SPRINT-1.md` for full test matrix.

## Pre-Sprint 1 Blockers

All cleared. ✅

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Create Supabase project: ghmd-sales-platform | Trace | ✅ DONE — `cprltmwwldbxcsunsafl` |
| 2 | Register Census API key | Trace | ✅ DONE — set in Netlify env vars |
| 3 | Create GitHub repo and commit foundational files | Trace + Claude Code | ✅ DONE — `eb039d4` |
| 4 | Create Netlify site | Claude Chat | ✅ DONE — `ghmdsalesplatform.netlify.app` |
| 5 | Create Monday.com sprint board | Trace | ✅ DONE — `18419216445` |
| 6 | Set Netlify env vars (Supabase URL + service role key) | Trace + Claude Chat | ✅ DONE |
| 7 | Create Box folder structure | Claude Chat | ✅ DONE — root ID `393568040484` |

## Pre-Sprint 2 Blockers

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Configure custom subdomain on Netlify | Leif | OPEN |
| 2 | Set `NEXT_PUBLIC_MAPBOX_TOKEN` in Netlify env vars | Trace | OPEN |
| 3 | Physician testimonials for proposal page (2–3 quotes + photos) | Bruce | OPEN |

## Pre-Sprint 3 Blockers

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Enable Google Cloud + Places API + billing | Trace | OPEN |
| 2 | Set `GOOGLE_PLACES_API_KEY` in Netlify env vars | Trace | OPEN |

## Pre-Sprint 4 Blockers

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Get AesthetiX webhook endpoint + secret from vendor | Trace | OPEN |
| 2 | Confirm Box Sign API credentials + webhook config | Trace | OPEN |
| 3 | Set Box env vars in Netlify (`BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_WEBHOOK_SECRET`) | Trace | OPEN |

## Standing Critical Flags

- **Call recording**: No Zoom recording until ByrdAdatto approves consent language. Do not build Phase 2 Whisper integration until cleared.
- **Dual-system risk**: AesthetiX + new system overlap must not exceed 60 days. Define cutover date before Sprint 4.
- **Formula constants**: Session-locked in `/lib/addressable-market-constants.ts`. Do not adjust constants to hit any output target — if outputs look wrong, audit the logic first.
- **Box Sign**: Replaces DocuSign entirely. No DocuSign integration at any phase.
- **Phase 2 call scoring**: OpenAI Whisper (transcription) + Claude API (scoring). Not in scope until Phase 2. ByrdAdatto consent review must precede any recording.
