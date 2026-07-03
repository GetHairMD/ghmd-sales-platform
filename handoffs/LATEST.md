# GHMD Sales Platform — Handoff v2.24

Date: 2026-07-03 (session #2) | Prepared by: Coder | Purpose: New session bootstrap — mid-sprint

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | cprltmwwldbxcsunsafl (NIP `kjweckggegifjmmqccul` — never touch) |
| Netlify | ghmdsalesplatform |
| Active branch | `feat/formula-v2-public-source` (off clean main `be2dc4e`) |
| main | `be2dc4e` — even with origin/main |
| Branch protection | main requires the `gate` status check (Second-Opinion Gate LIVE) |
| Open PRs | #50 (CLAUDE.md Branch/Git Hygiene section — standalone hygiene PR, **not** this sprint) |

## Current Sprint — formula-v2-public-source

**Mission:** Replace the legacy territory-sizing formula with the new public-source
methodology. **Live to the full sales force Monday, July 6, 5:00 PM CT.**
Working branch `feat/formula-v2-public-source`; **squash-merge Sunday after gate review.**
All formula constants live in `/lib/addressable-market-constants.ts` (Rule 6) — never inline.

### Task Status

| Task | Description | Status | Commit / Notes |
|------|-------------|--------|----------------|
| A | Dead-code deletion (PROPENSITY_TO_ACT, COL/housing-cost multiplier, B25105 fetch/table, unused $2,974 anchor) | ✅ COMPLETE | `aabab95` — acceptance grep 0 hits in src/ |
| B | Income screen — ACS B19001 ZCTA, ≥ $37,415, straddle interpolation, `robustness_flag` (share_5pti/share_8pti < 0.5). ACS vintage → 2024. HUD ZIP↔County crosswalk (54,234 rows) + ZIP-as-ZCTA. | ✅ COMPLETE | `7318a31`, `8afcd42`, `d3ef623` (decision_log #44) |
| C | Credit share — Experian FICO≥670 by state. Infra done (national 70.4% + fallback). **`states` HELD** pending Trace's Sept-2025 per-state table (Sat EOD); else ship 70.4% fallback + flag + decision_log row. | 🟡 INFRA DONE | `1b28db1` |
| D | Cell formula — adults × income_share × credit_share × prevalence(age,sex); Σ cells. Prevalence canonical in constants (Rule 6); `data/prevalence-by-age-sex.json` generated as provenance (group-level citations). **Marin 64,194 run HELD** (Experian-gated, part of G). | 🟡 CORE DONE | `682e236` |
| E | `CUSTOMERS_NEEDED = 62` (locked 2026-07-03) replaces placeholder. | ✅ COMPLETE | `7a556ad` |
| F | Penetration parameterized — 0.005 / 0.01 / 0.02, QB-bridge source string, all three shown. | ✅ COMPLETE | `7a556ad` |
| G | Demand-table reconciliation — full ZCTA pipeline (HUD → per-ZCTA B01001+B19001 → state credit → Σ cells), national 69.8M/56.4M + Marin 64,194, reconcile `lib/census/` scaffold + replace transitional census.ts. **HELD** (Experian-gated). | ⏸ HELD | — |
| H | gethairmd.biz lead-capture — **OUT OF SCOPE** for this branch. Lives in the separate gethairmd.biz marketing-site repo (confirmed Trace 2026-07-03); handle in its own session. | ⛔ OUT OF SCOPE | — |

### Locked decisions (do NOT reopen) — decision_log rows 37–42

| id | Title | residual_risk / owner | Sprint relevance |
|----|-------|-----------------------|------------------|
| 37 | Affordability Anchor V2 — U.S. Bank Avvance / 8% PTI / $37,415 HH income floor | unresolved / Trace | **Core** — Task B income floor. $8,500 @ 24.99% APR / 60 mo → $249.44/mo → $37,415 @ 8% PTI. 5% PTI ($59,865) = robustness bound (flag, never filter). |
| 38 | Decision B — ACS Vintage Bump SUPERSEDED (B25105 deleted, question moot) | none | **Core** — confirms B25105 removal (Task A done); vintage-bump question closed. |
| 39 | Pre-Execution Review Gate — LIFTED (Bruce/Rick sign-off no longer required for formula changes) | accepted / Trace | **Core** — franchise question CLOSED; do not re-raise the pre-execution gate. |
| 40 | Grandfathering Policy + Penetration Bridge — LOCKED | unresolved / Bruce | **Core** — in-flight proposals (incl. Hausauer/San Rafael) keep quoted boundary through 2026-07-31. Penetration 1% placeholder ships Mon w/ 0.5%/2% sensitivity; QB-reorder empirical replacement ~2 wks post-launch. |
| 41 | Hub-and-Spoke Structure V1 — papering, 5% mechanic, MTL concept, channel fork | unresolved / Trace | **Context only** (platform=cross) — not formula-sprint code. Awareness only. |
| 42 | NDP + EIP Program Structure V1 — LOCKED (publication-gated) | unresolved / Trace | **Context only** (platform=cross) — not formula-sprint code. Awareness only. |

### QA / reconciliation targets (Task G gates)

| Anchor | Target |
|--------|--------|
| National @PTI8 | 69.8M |
| National @PTI5 | 56.4M |
| Marin @PTI8 | 64,194 |
| Westlake (correct) | 9,108 — a delivered proposal erroneously shows 5,483; that is a **Bruce/Sean-Paul-facing correction, not a code task**. CLAUDE.md's 5,483 reference is left untouched by design. |

### Customers-needed

`CUSTOMERS_NEEDED = 62` (locked 2026-07-03, worst-case Early-tier recovery).

## PR requirements (at Sunday gate review)

- Formula-change summary, reconciliation results, Marin spot-check, deletion grep output.
- decision_log rows 37, 39, 40 reflected in the `/decisions/DECISION_LOG.md` mirror before merge.
- Squash-merge only (Rule 15). No direct push to main (Rule 10).

## Transitional caveat (mid-sprint)

`src/lib/census.ts::computeAddressableMarket` is a **transitional body** (prevalence-only
pool, no propensity/COL) as of Task A — it returns interim, not-yet-correct numbers, guarded
by the territories page try/catch. It is rebuilt into the real ZCTA cell formula across
Tasks B/D/G and reconciled in G before the branch merges.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning |
| Coder | git + schema + code (local, fresh context each session) |
| Pilot | GitHub UI + browser tasks (no terminal access) |
