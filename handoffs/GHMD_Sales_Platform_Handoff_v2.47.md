# GHMD Sales Platform — Handoff v2.47

Date: 2026-07-14 | Prepared by: Chat, relayed via Coder brief | Purpose: close out PR #126
(E-0b Deal Territories), including the Second-Opinion Gate escalation and its resolution
(decision #158). Supersedes v2.46.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only — the values below are as-of-session.

## State as of this handoff (as-of-session — verify live next session)

- **Main HEAD: `7494225`** — PR #126 squash-merged, parent `b9ca801` (the v2.46 handoff). This
  handoff PR is the only thing after it.
- **Decision-log tip: #158.** #150 authorized E-0a/E-0b; #157 closed E-0a; **#158 is the E-0b
  completion entry, folding in the gate-escalation resolution as delivered state**
  (residual_risk: accepted).
- **`get_advisors` (security):** the one new finding from PR #126 —
  `territory_sold_summary()` under `authenticated_security_definer_function_executable` — is the
  intended, accepted-class twin of `territory_status_map()` (#132). Standing set otherwise
  unchanged. Confirm fresh at next session start regardless.
- **Open PRs: none** (this handoff excepted).

## What shipped this cycle

### PR #126 — MERGED (`7494225`) — E-0b Deal Territories (ultrareview, decision #150 → #158)

The Deal Territories rework: sold attribution, a shared close trigger, rep-siloed RLS, a
minimal sold-disclosure projection, and a searchable index.

- **Columns:** `territories.state` / `sold_by` (→ auth.users) / `sold_at`;
  `prospects.funded_won_at` (migration `20260714120000`). Demo-row `state` backfilled by
  name-parse (`qa_locked = false` only); forward-going population is a real Census geography
  lookup (`geoToFips` + `abbrForStateFips`) in `POST /api/territories`, never string-parsing.
- **Shared close trigger `stamp_prospect_funded_won()`** — `BEFORE UPDATE OF stage` on
  prospects, SECURITY DEFINER, fires **once** on the first crossing into Funded/Won
  (`OLD.stage < 11 AND NEW.stage >= 11 AND funded_won_at IS NULL`) and stamps every associated
  non-`qa_locked` territory sold. **`STAGE.FUNDED_WON = 11`** — the brief's stale literal "10"
  (predating decision #110's insertion of Qualification Review, which shifted Funded/Won from 10
  to 11; stage 10 is now Contract Signed) was caught against live source **before any code was
  written**, preventing a money-adjacent bug that would have stamped $179K territories sold one
  stage early. The `11` is pinned by `e0b-deal-territories.test.ts`. Built once for this and for
  future Bell Ringing (E-1), which keys off `funded_won_at`.
- **Territories RLS replaced:** the over-broad `internal_users_all` (any internal user, full
  access) → `exec_all` (executive, FOR ALL) + `rep_read` (rep, FOR SELECT), **every policy
  independently re-establishing `designation = 'rep'`** — the E-0a failure-mode guard (a bare
  uid/prospect match is not proof of rep-hood). **Fail-closed at the base table:** other reps'
  in-flight AND sold rows are structurally *absent* from `territories`, not filtered
  client-side, so no addressable/census can leak on the index, the detail route, or any future
  read path. Draft-hiding moved from the retired app-layer `.or()` filter into `rep_read`
  (`status IS DISTINCT FROM 'draft'`, NULL-preserving).
- **`territory_sold_summary()`** — SECURITY DEFINER minimal-disclosure twin of
  `territory_status_map()` (#132): sold-territory `name` / `state` / `sold_at` /
  `sold_to_practice` / `closed_by_name` to any internal user, **never** addressable/census. The
  sole path serving the truth-table "other reps see sold minimally" cell.
- **`/territories` reworked:** card grid → searchable-by-state index, design tokens only
  (Hard Rule 8).

### Second-Opinion Gate escalation — resolved, decision #158

PR #126's first open **silently auto-passed the gate** because its description was missing the
required `<!-- second-opinion-gate -->` classification block — no block means "not in scope =
automatic pass," so OpenAI was never called. This is the **same gap #154/#155 flagged on PR
#120–#122**, recurring here because the E-0b brief predated that corrective action and didn't
carry the block. Chat caught it before merge, had Coder add the block, and the gate then
genuinely ran GPT-5 (on the `edited` event), which returned **BLOCK** on
`territory_sold_summary()` for returning territory id/name/state beyond a `spec:` line Chat
itself had drafted too narrowly ("practice/closer/date only").

Chat independently verified live that the function discloses *less* than the already-shipped
precedent — `territory_status_map()` (#132) exposes exact coordinates + the full boundary
polygon + the buyer's personal name to the same audience with no designation check, whereas the
new function omits geometry/coordinates and the buyer's personal name — and recommended
acceptance. Trace reviewed and merged. Logged as **decision #158, residual_risk: accepted**
(the narrow spec line, not the code, was the defect; name/state are structurally required to
render a state-grouped index and are a subset of the #132 disclosure baseline).

### Independent verification performed by Chat (not accepted on Coder self-report)

- Live RLS truth table via Chat's own rolled-back adversarial fixtures (Rep A / Rep B / exec).
- Trigger idempotency + `qa_locked` exclusion via a second independent rolled-back transaction.
- `STAGE.FUNDED_WON = 11` confirmed against live source before accepting the "brief is stale"
  claim.
- `get_advisors` pre/post diff.
- Anon grant-level fail-closed check via `has_table_privilege` / `has_function_privilege`.

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| E-0b (Deal Territories rework) | — | **SHIPPED** (PR #126, `7494225`; decision #150 → #158, incl. gate-escalation resolution) |
| AC5 forward-going state population | future QA | **Code/build-verified only, not runtime-exercised** — needs exec auth + live Census geocoder (deploy-preview QA, not yet run against this merge) |
| Dashboard service-role RLS bypass (`src/lib/dashboard/data.ts`) | future Coder | Unchanged, carried from v2.46 — a rep's dashboard counts/feed reflect all prospects (service-role client bypasses `prospects` RLS) |
| No rep INSERT policy | future Coder | Unchanged, carried from v2.46 — reps still cannot self-create prospects |
| No DB-level check `assigned_rep_id` → `designation='rep'` | future Coder, low priority | Unchanged, carried from v2.46 — UI-enforced only; RLS visibility independently correct |
| Rep provisioning | Trace | Unchanged — **zero reps still provisioned** as of this handoff; re-confirm live. `/prospects/new` stays operationally blocked until ≥1 rep exists (intended E-0a consequence) |
| Session E modules proper (Scoreboard, Bell Ringing, Community Board, Resource Library, Template Gallery, Events) | Trace authorization | Not started — E-0a/E-0b were the RBAC prerequisite; **now both shipped** |
| Ultrareview gate-classification-block discipline | Chat, standing | **Carry as a standing Chat checklist item.** This session shows the #154/#155 corrective action (every ultrareview brief must carry the `<!-- second-opinion-gate -->` block) is still not reliably happening at brief-writing time — not just a one-time fix |
| TopBar global search — nullable-status exposure | future Coder | Unchanged, carried from v2.46 |
| Legacy ArcGIS sold-territory import (#141) | Trace | Unchanged, carried from v2.46 — deferred, blocked on Trace's data-cleanup pass |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, #136/#137) | Still live by explicit ongoing decision |
| Demo/test data cleanup (#128) | future Coder | Unchanged, carried from v2.46 |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Unchanged, carried from v2.46 — paused externally |

## Note on `AUTH_GATE_DISABLED`

Unchanged: deliberate, ongoing decision (#136/#137), not a lapsed oversight. Still live in
production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
