# Execution Report — Territory Discovery & Executive Artifacts

**Brief:** [DECISION: #141] read-only territory discovery + executive system map / AI-governance
presentation ([HANDOFF: LATEST.md v2.62 §8 Steps 1–2]).
**Two sessions, both 2026-07-24, both Coder, no subagents:**
- **Session 1 — Original discovery:** created the six artifacts.
- **Session 2 — Bounded correction pass:** corrected the v3 penetration anchor, session-check record,
  governance citations, non-durable/abbreviated citations, and unsupported lifecycle labels; added one
  read-only catalog check. This report is authored in Session 2.

---

## 1. Session-start checks

### 1A. Which check ran in which session (truthful record)

| Check | Session 1 (original) | Session 2 (this correction) |
|---|---|---|
| Rule 0 — git remote = `GetHairMD/ghmd-sales-platform` | ✓ ran | ✓ ran |
| Rule 0 — `git fetch --prune` | ✓ ran | ✓ ran |
| **Rule 0-B — current form: `head -1 AGENTS.md` ⇒ `# GHMD Sales Platform — AGENTS.md`** | ✗ **not run** — Session 1 instead ran a `head -1 CLAUDE.md` check (the obsolete form) | ✓ **ran and passed** — returned `# GHMD Sales Platform — AGENTS.md` |
| Rule 0-E — NIP contamination scan | ✓ ran (repo-wide) | ✓ ran (scoped to `docs/territory-discovery/`; only boundary-marker mentions like "never queried") |
| Canonical docs read (`AGENTS.md`, `handoffs/LATEST.md`, `docs/AGENTS.md`, `docs/GHMD-CRM-003.md`, `docs/TERRITORY-METHODOLOGY.md`) | partial (read `CLAUDE.md` + `docs/AGENTS.md`) | ✓ read **root `AGENTS.md`** (current governance) + the others |

> **Correction honesty note (brief requirement):** Session 1 did **not** satisfy the current Rule 0-B —
> it checked `CLAUDE.md`, not root `AGENTS.md`. This is stated rather than papered over. Session 2
> performed the current Rule 0-B and it passed. No claim is made that the earlier `CLAUDE.md` check
> satisfied the current rule.

### 1B. Supabase project confirmation

Project `cprltmwwldbxcsunsafl` (ghmd-sales-platform) confirmed via `list_projects` before any read,
in **both** sessions. The NIP project `kjweckggegifjmmqccul` was **never** queried in either session.

---

## 2. Files created / changed

All under `docs/territory-discovery/` (a new, clearly-named documentation location; no prior
convention for discovery reports existed — choice reported here per brief). **Documentation only** —
no application code, migration, workflow, or config.

| File | Deliverable | Session 1 | Session 2 (this pass) |
|---|---|---|---|
| `RECONCILIATION-REPORT.md` | (1) Discovery & reconciliation report | created | edited (governance citations; dated catalog note on F11) |
| `SOURCE-REGISTER.md` | (2) Source register | created | edited (lifecycle labels; citations; removed memory-based citations; added catalog-query row) |
| `EXECUTIVE-PRESENTATION.md` | (3) Executive presentation | created | edited (v3 anchor 0.5%; lifecycle labels; citations; call_scores path) |
| `SYSTEM-MAP.md` | (4) One-page system map | created | rewritten (node labels, color classes, v3 anchor, full paths) |
| `UNRESOLVED-QUESTIONS.md` | (5) Unresolved questions & gates | created | edited (v3 anchor; proposal source; AGENTS.md citation) |
| `EXECUTION-REPORT.md` | (6) This report | created | rewritten (this pass) |

**`git status --short`:** `?? docs/territory-discovery/` only (the directory is untracked — never
committed — so git shows it as one untracked path). No tracked file was modified in either session.
Branch: `main` (files uncommitted — see §7).

---

## 3. Read-only systems inspected

| System | How | Writes? |
|---|---|---|
| Supabase project `cprltmwwldbxcsunsafl` | `list_projects` + read-only `SELECT`/catalog queries via `execute_sql` | **None** |
| Repository (HEAD) | Read/Grep/Glob/`git` read commands | **None** |
| ArcGIS Online | **Not reachable** — no connector/credential/export | n/a (blocked) |
| Prior CRM (AesthetiX/GHL) | **Not located** in repo | n/a (blocked) |
| NIP Supabase `kjweckggegifjmmqccul` | **Deliberately never queried** | **None** |

**Read-only DB queries (project `cprltmwwldbxcsunsafl`, 2026-07-24):**
- *Session 1:* project confirmation; territory overview counts; row sample; name/qa_locked
  classification; related-table counts + duplicate names; PostGIS presence/schema.
- *Session 2 (added this pass):* governed-row guard triggers on `public.territories`
  (`territories_sold_boundary_guard`, `territories_qa_lock_guard`, `territories_qa_lock_delete_guard`)
  — all present with `tgenabled='O'` (enabled).

All were `SELECT`/system-catalog reads. No `INSERT/UPDATE/DELETE/DDL`.

---

## 4. Checks performed this correction session (Session 2)

- Verified current Rule 0-B against root `AGENTS.md` (passed).
- Confirmed every cited migration path resolves (`20260706120000`, `20260710140000`,
  `20260709120000`, `20260705003707`, `20260625020853`).
- Read `src/lib/__tests__/v3-constants.test.ts` — confirms `62 × 1.5 = 93`, `÷ 0.005 = 18,600`, 0.5% Conservative anchor.
- Located `call_scores` creation in `supabase/migrations/20260625020853_sprint1_foundation.sql`.
- Located a durable source for the proposal "illustrative-only" claim:
  `docs/TERRITORY-METHODOLOGY.md §7` (revenue `scenario_outputs`, decision #71) + `src/app/p/[slug]/page.tsx`.
- Ran the read-only `pg_trigger` catalog check for the governed-row guards.
- Validation greps (see §9): stray `1%`, `0.5%` consistency, memory-based citations, ellipsis/abbreviated paths, obsolete `CLAUDE.md` citations, and repository-path resolution.

---

## 5. Reconciled evidence accounting (original vs correction)

### 5A. Claims independently reverified this correction session
- **Sold-boundary freeze is Live:** upgraded from "schema encodes it" to **dated catalog proof** —
  `territories_sold_boundary_guard` applied & enabled (`tgenabled='O'`), [DB: pg_trigger/2026-07-24].
  Caveat added everywhere: it guards **0 rows today** (no `sold_boundary_geom` set).
- **v3 constants chain:** reverified against `src/lib/__tests__/v3-constants.test.ts` — anchor is **0.5%**, not 1%.
- **Proposal "illustrative-only":** reverified against a durable repo source (methodology §7 / #71),
  replacing the earlier memory citation.

### 5B. Claims retained from the original dated read-only discovery (unchanged)
- DB territory data is 100% demo/QA fixture; zero geometry; zero v3 rows; 21 `sold` are demo. [DB: 2026-07-24]
- PostGIS 3.3.7 in `extensions`; DB geometry target = `geometry(MultiPolygon, 4326)`. [DB / REPO]
- Real 80+ sold territories exist only in ArcGIS (existence). [HANDOFF / DECISION #141]
- No tracked ArcGIS/CRM export in repo. [git ls-files]

### 5C. Claims corrected or downgraded this pass
- **v3 viability anchor:** `1%` → **`0.5%` Conservative** across all files (the 1% is a *separate* base
  proposal scenario, now called out explicitly). [REPO: lib/addressable-market-constants.ts; src/lib/__tests__/v3-constants.test.ts]
- **Lifecycle labels downgraded `Live` → `Built, unvalidated`** (implementation exists; no dated live
  operation verified this session): addressable formula v2 in-app producer; Mapbox display/isochrone;
  credit-quality data consumption; National Map render; the new-territory overlap rule; the
  rule-based stalled-deal signal.
- **`Live` retained only where dated evidence supports it:** Census request path
  ([HANDOFF: v2.62 §4.2]); PostGIS infra ([DB: 2026-07-24]); sold-boundary/qa-lock freeze guards
  ([DB: pg_trigger/2026-07-24]); territory price $179,000 as an in-force governance constant
  ([REPO: AGENTS.md]). The `deals.territory_price` schema default is repository-implementation only and
  remains `Built, unvalidated` absent a dated live catalog query — the price *policy* is `Live`, the
  *schema default* is not asserted as live.
- **Governance citations:** `CLAUDE.md` → root `AGENTS.md` for session rules, git/PR (Rule 10),
  decision-log (Rule 18/14), env vars, territory price, AesthetiX/GHL stopgap. Human-authority claims
  keep their durable `docs/GHMD-CRM-003.md §11` + handoff citations (that fact is not in root AGENTS.md).
- **Non-durable/abbreviated citations removed:** all memory-based citations gone; the abbreviated
  `call_scores`, constants, and migration references replaced with full resolvable paths.

### 5D. Not re-executed this pass (retained from Session 1's dated reads)
The Session-1 territory-count / classification queries were not re-run; their results are retained as
dated 2026-07-24 read-only evidence and are not restated as if freshly re-queried in Session 2.

---

## 6. Blockers & unavailable sources (unchanged)

- **B1 — ArcGIS access:** no connector/credential/export. Blocks all ArcGIS-side geometry validation.
- **B2 — ArcGIS cleanup pass:** Trace-side dedupe/validity/overlap pass (the #141 precondition) not done.
- **B3 — Commercial semantics:** Q1–Q6 in UNRESOLVED-QUESTIONS.md are Trace decisions; not assumed.
- **B4 — CRM export:** not located; may not exist.

---

## 7. Landing path (not executed — awaiting Trace)

Per [REPO: AGENTS.md Rule 10] no direct push to `main`. These files remain **uncommitted on `main`**.
Neither session committed, branched, pushed, or opened a PR. Per the correction brief, the pass stops
here and leaves the files uncommitted for independent Codex review.

---

## 8. Explicit no-change attestation (both sessions)

During neither session were any of the following changed, created, or executed:

- ❌ No territory data imported, inserted, updated, or deleted.
- ❌ No schema change, migration authored, or migration applied.
- ❌ No geometry redrawn, resized, clipped, normalized, overwritten, or published.
- ❌ No sold boundary recalculated by any means.
- ❌ No Supabase / ArcGIS / Mapbox / Netlify / provider setting altered.
- ❌ No `ops.decision_log` entry written (Coder never writes it — [REPO: AGENTS.md Rule 18]).
- ❌ No NIP project or repo touched or queried.
- ❌ No git commit, push, branch, or PR.
- ❌ No credential read, echoed, or exposed.
- ❌ No application code, migration, configuration, handoff, or unrelated file modified.

**Only** read-only `SELECT`/catalog queries against `cprltmwwldbxcsunsafl`, read-only repository
inspection, and creation/editing of the six documentation files under `docs/territory-discovery/` occurred.

---

## 9. Validation results (this correction session)

| # | Validation | Result |
|---|---|---|
| 1 | Search all six files for `1%`; each remaining occurrence contextually correct | ✅ Two are the *separate 1% Base proposal scenario* (EXECUTIVE-PRESENTATION, UNRESOLVED-QUESTIONS), explicitly distinguished from the 0.5% anchor; the rest are report metadata in EXECUTION-REPORT describing this correction. None is used as the v3 viability floor |
| 2 | v3 viability anchor consistently `0.5%` | ✅ 14 occurrences of `0.5%` across `docs/territory-discovery/` (re-counted this correction session); no `1%` used as the v3 floor anywhere |
| 3 | No memory-based citations remain | ✅ none (grep clean) |
| 4 | No ellipsis-based / abbreviated repository paths | ✅ none (`…call_scores`, `lib/...constants.ts`, `migration 20260706120000` all replaced; remaining `…` are prose quote-elisions, not paths) |
| 5 | Every repository-path citation resolves to a real file | ✅ verified — path-resolution grep over all `REPO`-tagged citations; every real path returned OK (remaining grep artifacts were trailing punctuation and glob brackets, confirmed to exist) |
| 6 | `CLAUDE.md` obsolete governance citations replaced | ✅ none remain in the six files |
| 7 | Every `Live` label meets the dated-evidence standard | ✅ reassessed; only Census (handoff §4.2), PostGIS infra, freeze guards, territory price retain `Live`, each with a dated tag |
| 8 | All provisional claims unmistakably labeled | ✅ `[PROVISIONAL]` + explicit status labels throughout |
| 9 | `git status` / `git diff` show no out-of-scope edits | ✅ only `docs/territory-discovery/` untracked; no tracked file modified |
| 10 | Validation results cited | ✅ this table + the completion report |

---

## 10. Completion-gate self-check

| Gate requirement | Met? |
|---|---|
| All claims source-tagged | ✅ |
| Provisional material unmistakably labeled | ✅ |
| Live vs future-state separated, with dated evidence required for `Live` | ✅ |
| Territory discovery stayed read-only | ✅ |
| Sold boundaries not recalculated/modified | ✅ |
| No external or DB writes | ✅ |
| Relevant validation results from this session cited | ✅ (§9) |
| Changed-file list reviewed for scope compliance | ✅ (§2 — 6 docs only) |
