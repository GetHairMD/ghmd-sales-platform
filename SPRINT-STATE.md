# SPRINT-STATE.md

## Current Sprint — formula-v2-public-source

Source of truth: `/handoffs/LATEST.md` (v2.24, 2026-07-03 session #2).

**Mission:** Replace the legacy territory-sizing formula with the public-source methodology.
**Live to full sales force Monday, July 6, 5:00 PM CT.** Branch `feat/formula-v2-public-source`
(off clean main `be2dc4e`); squash-merge Sunday after Second-Opinion Gate review. All formula
constants in `/lib/addressable-market-constants.ts` (Rule 6) — never inline.

### Task Status

| Task | Description | Status | Commit / PR |
|---|---|---|---|
| A | Dead-code deletion — PROPENSITY_TO_ACT, COL/housing-cost multiplier, B25105, unused $2,974 anchor | ✅ COMPLETE | `aabab95` |
| B | Income screen — ACS B19001 ZCTA, ≥ $37,415, straddle-bracket interpolation, robustness_flag | ⬜ NEXT | — |
| C | Credit share — Experian Sept 2025 FICO≥670 by state (`data/experian-credit-share-by-state.json`) | ⬜ PENDING | — |
| D | Prevalence layer — wire `data/prevalence-by-age-sex.json`; Σ cells = addressable | ⬜ PENDING | — |
| E | `CUSTOMERS_NEEDED = 62` replaces placeholder | ⬜ PENDING | — |
| F | Penetration parameterized — 0.005 / 0.01 / 0.02, all three shown | ⬜ PENDING | — |
| G | Demand-table generator reconciliation (natl 69.8M@PTI8 / 56.4M@PTI5, Marin 64,194) | ⬜ PENDING | — |
| H | gethairmd.biz lead-capture fix — server-side, auth-gated admin, privacy notice | ⬜ PENDING | — |

### Locked decisions (do not reopen)

decision_log rows **37** (Affordability Anchor V2 — $37,415 @ 8% PTI), **38** (ACS vintage bump
superseded / B25105 deleted), **39** (Pre-Execution Gate LIFTED — franchise question CLOSED),
**40** (Grandfathering through 2026-07-31 + Penetration bridge). Rows **41/42** (Hub-Spoke V1,
NDP+EIP V1) are `platform='cross'` hub-spoke context — **not formula-sprint code**, awareness only.

### Acceptance / QA targets

National 69.8M @PTI8 · 56.4M @PTI5 · Marin 64,194 @PTI8 · Westlake correct = 9,108
(the 5,483 in a delivered proposal is a Bruce/Sean-Paul-facing correction, not a code task).

### PR requirements (Sunday gate)

Formula-change summary · reconciliation results · Marin spot-check · deletion grep output ·
decision_log rows 37/39/40 reflected in `/decisions/DECISION_LOG.md` mirror · squash-merge only.

---

## Sprint 1 (history)

### Merged PRs

| PR | Title | Branch | Merged | Task |
|---|---|---|---|---|
| #19 | feat: Census API scaffold — territory signals (Sprint 1 Task 1) | feature/census-api-scaffold | 2026-06-29 | Sprint 1 Task 1 |

### Task Status

| Task | Description | Status | PR |
|---|---|---|---|
| Sprint 1 Task 1 | Census API scaffold — territory signals | COMPLETE | #19 |
| Sprint 1 Task 2 | NPI Registry scaffold — physician density | COMPLETE | #21 |

### Notes

- PR #19 merged 2026-06-29: Census API scaffold complete. Delivers `lib/census/` layer, territory route, 13 unit tests.
- Sprint 1 Task 2 (NPI Registry scaffold) delivered in PR #21.
