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
| C | Credit share — Experian FICO≥670 by state. Infra done; **`states` HELD** on Trace's Sept-2025 table (Sat EOD), else 70.4% fallback + flag | 🟡 INFRA | `1b28db1` |
| D | Cell formula (adults × income × credit × prevalence, Σ cells); prevalence canonical in constants (Rule 6) + provenance JSON. **Marin 64,194 run HELD** (part of G) | 🟡 CORE | `682e236` |
| E | `CUSTOMERS_NEEDED = 62` replaces placeholder | ✅ COMPLETE | `7a556ad` |
| F | Penetration parameterized — 0.005 / 0.01 / 0.02, all three shown | ✅ COMPLETE | `7a556ad` |
| G | Demand-table reconciliation (full ZCTA pipeline; natl 69.8M@PTI8 / 56.4M@PTI5, Marin 64,194) | ⏸ HELD (Experian-gated) | — |
| H | gethairmd.biz lead-capture — **OUT OF SCOPE** (separate gethairmd.biz repo, confirmed 2026-07-03) | ⛔ OUT OF SCOPE | — |

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
