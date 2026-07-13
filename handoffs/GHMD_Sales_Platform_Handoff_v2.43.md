# GHMD Sales Platform — Handoff v2.43

Date: 2026-07-12 | Prepared by: Coder at session close (docs/AGENTS.md session-close rule) |
Purpose: close out PR #116 (Deal Territories draft-visibility fix) and record the queued work
authorized this arc (Territory Scouting build per decision #146; `prospects/new` tokenization).
Supersedes v2.42.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only — the values below are as-of-session.

## State as of this handoff (as-of-session — verify live next session)

- **Main HEAD: `a9e2adc`** — PR #116 squash-merged (`a9e2adcd2ac1c796c07f1dee1b40af0269a3bb8e`,
  parent `372748f`). This handoff PR (`chore/handoff-v2.43`) is the only thing after it.
- **Decision-log tip: #147.** Rows #146 and #147 landed this cycle (Chat, via Supabase MCP, the
  sole sanctioned writer). #143–#145 landed in the prior cycle and are documented in v2.42 §4 —
  not repeated here.
- **`get_advisors` (security): standing set only, no new findings.** PR #116 was an
  application-query-layer change with **no DDL this cycle**, so the advisor set is unchanged:
  the pre-existing `territory_status_map` authenticated-SECURITY-DEFINER-callable WARN (noted
  since v2.42), the RLS-enabled-no-policy INFOs on cache/proposal tables, `spatial_ref_sys`, and
  `postgis`-in-public all carry forward untouched. Not a regression.
- **Open PRs: this handoff (`chore/handoff-v2.43`).**

## What shipped and was verified this cycle

### 1. PR #116 — MERGED (`a9e2adc`)

`src/app/(app)/territories/page.tsx` now excludes `status='draft'` rows from the Deal Territories
list query **for non-executive viewers only** (gated on the page's existing `isExec` resolution
via `getViewerDesignation()`); executives retain full draft visibility, since they may navigate
back to this list to track several in-progress drafts at once. Closes a real visibility gap
introduced by PR #114's New Territory flow: a fresh `status='draft'` row was rendering for reps
the moment it was created — before sizing, before it was a real decision.

- **NULL-preserving semantics on purpose.** Uses `.or('status.is.null,status.neq.draft')` (i.e.
  `status IS DISTINCT FROM 'draft'`), **not** a bare `.neq('status','draft')`. `territories.status`
  is nullable (`text default 'available'`), and a bare neq compiles to `status <> 'draft'`, which
  is NULL (not true) for null-status rows and would silently drop them from the rep view. This is
  the identical choice, for the identical reason, as the National Map migration `20260711160000`.
- **Live data confirmed** (both by Coder and independently by Chat): 67 total territories — 45
  available, 21 sold, 1 draft, **0 null**. So on today's data the NULL-preserving form behaves
  identically to a bare neq — this is defensive/future-proofing and convention-consistency, not a
  fix for a live null-row leak. Row-level simulation against `cprltmwwldbxcsunsafl`: rep view
  returns 66 rows (0 drafts), exec view 67 (1 draft), 45 available + 21 sold unaffected for both.
- **Why the fix had to live at the application query layer.** RLS on `territories`
  (`internal_users_all` policy) grants ALL to any authenticated internal user with **no role
  distinction** — confirmed via `pg_policies` by Chat — so RLS cannot hide drafts from reps; the
  gate genuinely belongs in the query.
- **Guardrail test** `src/lib/__tests__/territories-list-draft-filter.test.ts` (comment-stripped
  source-scan, same idiom as `prospects-list-redesign.test.ts`) pins: the filter is behind
  `!isExec`, uses the NULL-preserving OR (not a bare neq), and appears exactly once.
- **Review sequence.** Merge-readiness was first reported, then Chat's review caught a **stale
  docstring** in the guardrail test (it overstated the null-row count — "most existing territories
  carry a legacy NULL status", false against the 0-null live data). Corrected by Coder in a
  comment-only follow-up commit (`426c8d9`) before the final merge; assertions unchanged
  throughout. `npm run build` / `lint` / `test` clean (1115 tests).

### 2. Decision log — #146 / #147 (Chat-written)

- **#146** (ADOPTED, unbound, `residual_risk=accepted`) — **Territory Scouting** (spec §4B item 6)
  scope resolved and build authorized: standalone, **executive-only**, deal-independent territory
  sizing reports, never rep-visible, never on the National Map. Key decisions:
  - **Separate table** (`territory_scouting_reports`), **not** a new status value on the shared
    `territories` table. Rejected the shared-table approach: every existing rep-facing consumer of
    `territories` has no status filter today, so each would need independent retrofitting — the
    same class of leak this codebase has now shipped twice (National Map, Deal Territories list).
  - **Access: executive only for v1.** No broader "internally approved member" concept exists
    today; deferred until a real person needs access without being a full executive.
  - **Engine reuse:** the v3 sizing pipeline already supports pure ad-hoc center-only jobs with no
    `territoryId` (`territory_sizing_jobs.input_territory_id` is nullable by design). Territory
    Scouting must call the underlying `createSizingJob` / `triggerSizingJob` / `getSizingJob`
    **library functions directly** from new, dedicated, executive-gated routes — **not** reuse the
    existing `/api/territories/size` HTTP endpoints, which are only authenticated-gated, not
    executive-gated (a narrow shared-surface gap otherwise).
- **#147** (ADOPTED, `related_pr=116`, `related_repo=ghmd-sales-platform`, `residual_risk=none`) —
  the PR #116 build and its verification (see §1).

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| Territory creation + TopBar search/quick-add + Prospects redesign | — | **SHIPPED** (PR #114, `5435b60`); migration applied + QA-verified |
| Deal Territories draft-visibility fix | — | **SHIPPED** (PR #116, `a9e2adc`) — reps no longer see `status='draft'` rows; execs retain full visibility |
| Territory Scouting full build | future Coder | **AUTHORIZED, brief sent, not yet built** (decision #146, **ultrareview** tier). New `territory_scouting_reports` table + executive-only RLS + new exec-gated routes (reuse the v3 engine's library fns, not `/api/territories/size`) + new page + nav wiring (`nav-items.ts` `Territory Scouting` entry is `comingSoon:true`, needs `href:'/territory-scouting'`) + `docs/SALES-OS-SPEC.md` §4B rewrite (add the missing **National Map** entry — live via #121/#122/#132 but never written into the spec — and correct the Territory Scouting item, whose current description actually describes what became the PR #114 New Territory flow) |
| `prospects/new/page.tsx` raw-Tailwind tokenization | future Coder | **Brief sent, not yet built** — small, standard tier, no open questions (only the prospects *list* page was tokenized in #114) |
| Session E / Platform RBAC | Trace authorization | **Next sequencing item** after the two above land — but **not yet authorized**. Trace said "then we move to Session E" as sequencing intent, not a scoping green light; treat like any unopened item — needs its own authorization/scoping pass before code starts |
| TopBar global search — parallel nullable-status exposure | future Coder | **Flagged, not yet decided.** TopBar search queries `territories` with no draft filter; if a draft-hiding filter is ever added there it carries the identical nullable-status trap as #116 (must use `IS DISTINCT FROM`, not bare neq). Deliberately out of scope for #116 |
| Legacy ArcGIS sold-territory import (#141) | Trace | Deferred — blocked on Trace's ArcGIS data-cleanup pass, not started |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, per #136/#137) | **Still live in production, by explicit ongoing decision** — not a lapsed cleanup item (see note below) |
| Demo/test data cleanup (#128) | future Coder | Untouched. Includes concrete row `f0404c01` ("QA114 — Cherry Creek Denver", the live draft left in place to support migration verification) — delete at go-live |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused externally, unchanged |

## Note on `AUTH_GATE_DISABLED`

Per Trace's explicit correction: this is **not** a lapsed residual risk to re-flag as forgotten —
it was a deliberate decision (#136/#137) to stop it blocking build momentum, made knowingly. It
remains live in production. Continue noting it in every go-live-readiness session, but do not
frame it as an oversight.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
