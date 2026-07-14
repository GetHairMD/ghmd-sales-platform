# GHMD Sales Platform — Handoff v2.48

Date: 2026-07-14 | Prepared by: Chat | Purpose: close out PR #128 (E-1
Scoreboard + Bell Ringing), including two fixed Second-Opinion Gate findings
and one Chat/Trace-overridden finding (decision #160). Supersedes v2.47.

> **State facts are never read from this file.** Main HEAD, decision-log tip,
> open PRs, and security-advisor status are derived live at every session
> start (git, `ops.decision_log`, `get_advisors`). This handoff carries
> narrative only.

## State as of this handoff (as-of-session — verify live next session)

- **Main HEAD: `9a62f12`** — PR #128 squash-merged, parent `ffed9cb` (the
  v2.47 handoff). This handoff PR is the only thing after it.
- **Decision-log tip: #160.** #159 authorized Session E and E-1 specifically;
  **#160 is the E-1 completion entry** (residual_risk: `accepted`).
- **`get_advisors` (security):** the one new finding from PR #128 —
  `scoreboard_summary()` under `authenticated_security_definer_function_executable`
  — is the intended, accepted-class addition (7th entry in that class). `anon`
  class unchanged (5 entries). Confirm fresh at next session start regardless.
- **Open PRs: none** (this handoff excepted).

## What shipped this cycle

### PR #128 — MERGED (`9a62f12`) — E-1 Scoreboard + Bell Ringing (ultrareview, decision #159 → #160)

Session E, module 1 of 6. Aggregate rep leaderboard + close-triggered
celebration feed.

- **`community_board_posts`** — shared feed table. SELECT for any
  `internal_users` row (both designations); **no client write path for any
  role or post_type**, fail-closed at both the RLS-policy layer and the grant
  layer. Exists now so E-2 (Community Board) adds only a write path, no
  schema migration. Nothing writes to it in this PR except the bell trigger.
- **`ring_bell_on_funded_won()`** — SECURITY DEFINER, AFTER UPDATE on
  `prospects`, fires on the `funded_won_at` NULL→non-NULL transition. One
  `bell_ringing` post per territory the close stamped sold (0 → one
  territory-less post). Rep name + territory name **intentionally**
  disclosed — a celebration feature, deliberately not modeled on the #158
  minimal-disclosure pattern. `REVOKE ALL` → never RPC-callable directly.
- **`scoreboard_summary()`** — SECURITY DEFINER, membership-gated,
  authenticated-only, parameterless. One aggregate row per rep:
  `deals_closed_count`, `active_pipeline_count`, `proposal_engagement_score`,
  `current_streak` (integer). No individual prospect identity, no territory
  geometry, no addressable/census, no month-level detail.
- **`SlideOverDetailPanel`** — new tokens-only accessible drawer primitive
  (spec §4A listed it as unbuilt; E-1 introduces it, doesn't reuse existing
  code — flagged and confirmed in the PR).
- **`/scoreboard`** — top-3 rank cards + sortable table + rep slide-over
  (own aggregate detail only), zero-rep `EmptyState`, nav item visible to all
  internal users.
- **Verify-first catch (AC1):** `prospects.assigned_rep_id` (uuid) confirmed
  as the sole RLS-load-bearing rep-attribution column against live
  E-0a/E-0b policy definitions, before any scoreboard code was written.
  `assigned_rep` (text) is display-only, referenced by zero policies.

### Second-Opinion Gate — four escalations, three outcomes

1. **`funded_won_at` client-forgeable — FIXED.** `authenticated` held a
   table-level UPDATE grant on `prospects` covering every column; only
   `exec_all` RLS gated writes, so an executive could directly
   `UPDATE prospects SET funded_won_at = now()` and forge a close (fake bell
   + inflated `deals_closed_count`), no real stage crossing required. Chat's
   first proposed fix (a column-level `REVOKE`) would have been a **no-op**
   — a table-level grant is not reduced by a column-level revoke — caught by
   Coder before Chat caught it independently. Actual fix: drop the
   table-level UPDATE grant, re-grant column UPDATE on every column except
   `funded_won_at` (generated dynamically from the live schema). Chat
   independently verified: `has_column_privilege` confirms `funded_won_at`
   is not `authenticated`-writable; a live rolled-back adversarial UPDATE
   attempt (arbitrary UUID) was denied `42501` at the grant layer,
   unconditional of RLS row-matching. Legitimate stage-move path unaffected
   (app only ever `SET`s `stage`/`stage_updated_at`; the BEFORE trigger sets
   `funded_won_at` as a NEW-record side effect, not subject to the
   statement's column-privilege check). **Maintenance note for future
   sessions: `prospects` is now on column-level UPDATE grants — a future
   migration adding a column the app must edit via the authenticated client
   needs an explicit grant, or the edit silently fails.** Pinned by a
   guardrail test.
2. **`close_months` peer-disclosure — FIXED.** `scoreboard_summary()`
   originally returned the raw `close_months text[]` array. Because the
   function is membership-gated to *any* internal user, every rep saw every
   other rep's exact closing months — for a low-volume rep (1–2 closes),
   this effectively discloses individual deal-timing to peers, which is not
   an aggregate figure and wasn't required by spec (only a streak number
   was). Fixed: `current_streak` is now computed server-side in SQL
   (gaps-and-islands over close-months); the function is dropped and
   recreated (return-shape change) with `close_months` removed entirely.
   `pipeline_value` stays TS-side, untouched (sound reason: SQL can't import
   the single-sourced $179K TS constant). `computeCurrentStreak` in
   `src/lib/scoreboard/scoreboard.ts` is retained as a **test-only reference
   implementation**, no live caller. Verified independently via
   `get_advisors` diff and live return-shape/streak-boundary checks.
3. **Two further escalations — OVERRIDDEN, accepted (not sent back to
   Coder).** GPT-5 argued `active_pipeline_count` and
   `proposal_engagement_score` (exact, live, un-bucketed counts) could be
   differenced via repeated polling to reconstruct individual pipeline
   events, labeling this "PHI-adjacent." Chat and Trace jointly assessed
   this as a mislabeled finding: `prospects` contains **no PHI** — it is
   B2B licensee sales-pipeline/contact data (a physician as a prospective
   territory buyer), not patient/clinical data. The differencing argument,
   taken generally, would apply to any count-based dashboard anywhere and
   would require adding noise/bucketing/rate-limiting to a feature whose
   explicit spec-authorized purpose (decision #159) is showing reps
   exact comparative numbers. Logged as decision #160,
   `residual_risk: accepted`, rather than a third round-trip to Coder.

### Independent verification performed by Chat (not accepted on Coder self-report)

- Live grant-layer check (`has_column_privilege`, `has_table_privilege`) on
  `prospects.funded_won_at` before and after the lockdown migration.
- Chat's own rolled-back adversarial UPDATE attempt against `funded_won_at`
  (arbitrary UUID) — confirmed denial at the grant layer.
- `get_advisors` pre/post diff at each of the three migrations in this PR.
- Live migration file content pulled directly from the branch (not relayed
  from Coder's summary) for both follow-up fixes.
- Main-HEAD SHA and decision-log tip independently confirmed against live
  `git`/`ops.decision_log` before and after merge, not taken from the
  reported squash SHA alone.

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| E-1 (Scoreboard + Bell Ringing) | — | **SHIPPED** (PR #128, `9a62f12`; decision #159 → #160, incl. one overridden gate finding) |
| Session E remaining modules (E-2 Community Board, E-3 Resource Library — structure only, content unproduced — E-4 Template Gallery, E-5 Events & Invites, E-6 Objection playbook) | Trace authorization per #159 | E-2 next in the confirmed sequence; `community_board_posts` write-path (authoring non-bell-ringing posts) is E-2's first task, table already exists |
| E-5 blocked on a Trace call | Trace | Webinar registration source (Calendly vs. Zoom webhook) undecided — flagged in #159, not yet needed until E-5 comes up |
| AC5 forward-going state population (E-0b) | future QA | Still code/build-verified only, not runtime-exercised |
| Dashboard service-role RLS bypass (`src/lib/dashboard/data.ts`) | future Coder | Unchanged |
| No rep INSERT/UPDATE policy | future Coder | Unchanged — **now also relevant to E-1's `funded_won_at` lockdown**: when this gets built, remember `prospects` is on column-level UPDATE grants, not table-level: any new rep-write policy needs its columns explicitly granted, and must NOT include `funded_won_at` |
| No DB-level check `assigned_rep_id` → `designation='rep'` | future Coder, low priority | Unchanged |
| Rep provisioning | Trace | **Zero reps still provisioned.** E-1's leaderboard/streak/slide-over have had **no real rep-seat QA** — exec-seat + fixture/adversarial-transaction verification only, an explicit accepted limitation per #159, not an oversight |
| Ultrareview gate-classification-block discipline | Chat, standing | The block itself was present and functioning correctly on PR #128 (gate genuinely ran four times, on real content) — this specific standing item is not implicated this cycle |
| TopBar global search — nullable-status exposure | future Coder | Unchanged |
| Legacy ArcGIS sold-territory import (#141) | Trace | Unchanged, deferred |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, #136/#137) | Still live by explicit ongoing decision |
| Demo/test data cleanup (#128 — note: unrelated numeric collision with the merged PR #128) | future Coder | Unchanged |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Unchanged, paused externally |

## Note on `AUTH_GATE_DISABLED`

Unchanged: deliberate, ongoing decision (#136/#137), not a lapsed oversight.
Still live in production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
