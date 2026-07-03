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
| B | Income screen — ACS B19001 ZCTA, ≥ $37,415, straddle interpolation, robustness_flag; ACS→2024; HUD ZIP↔County crosswalk (54,234 rows, decision_log #44) | ✅ COMPLETE | `7318a31` `8afcd42` `d3ef623` |
| C | Credit share — Experian FICO≥670 by state, RESOLVED (state CSV, 51 states, authoritative). decision_log #45/#47 | ✅ COMPLETE | `1b28db1` `81fca9e` |
| D | Addressable = households × income × credit (**no prevalence** — handoff corrected, methodology §2). Prevalence archived to /reference. decision_log #46 | ✅ COMPLETE | `41497d0` |
| E | `CUSTOMERS_NEEDED = 62` replaces placeholder | ✅ COMPLETE | `7a556ad` |
| F | Penetration parameterized — 0.005 / 0.01 / 0.02, all three shown | ✅ COMPLETE | `7a556ad` |
| G | Reconciliation vs 3,144-county fixtures; shipping formula hits CORRECTED 69.6M/56.3M + Marin 64,194 (CI). decision_log #47 | ✅ COMPLETE | `f29069c` |
| H | gethairmd.biz lead-capture — **OUT OF SCOPE** (separate gethairmd.biz repo, confirmed 2026-07-03) | ⛔ OUT OF SCOPE | — |

### Locked decisions (do not reopen)

decision_log rows **37** (Affordability Anchor V2 — $37,415 @ 8% PTI), **38** (ACS vintage bump
superseded / B25105 deleted), **39** (Pre-Execution Gate LIFTED — franchise question CLOSED),
**40** (Grandfathering through 2026-07-31 + Penetration bridge). Rows **41/42** (Hub-Spoke V1,
NDP+EIP V1) are `platform='cross'` hub-spoke context — **not formula-sprint code**, awareness only.

### Acceptance / QA targets

National **69.6M** @PTI8 (69,581,844) · **56.3M** @PTI5 (56,283,042) — corrected from 69.8M/56.4M (decision_log #47) · Marin 64,194 @PTI8 · Westlake correct = 9,108
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
