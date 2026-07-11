# GHMD Sales Platform — Handoff v2.40

Date: 2026-07-11 | Prepared by: Coder at session close (docs/AGENTS.md session-close rule),
for Chat/Trace review | Purpose: capture the infra/governance session of 2026-07-11 — the
**GPT-5.6 Sol** Second-Opinion-Gate model swap (#135/#139), the **temporary, fail-closed
`AUTH_GATE_DISABLED` auth bypass** (#136/#137, PR #112, merged), the manual gate clear (#140),
and a newly-surfaced **decision-log → PR binding** governance note (now documented in
`docs/AGENTS.md`). Supersedes v2.39. No application feature or methodology change this session.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only. If a state fact appears below, it is
> illustrative context as-of the handoff date, not a source of truth.

## Stable identifiers (these do not drift)

| Item | Value |
|------|-------|
| Repo | `GetHairMD/ghmd-sales-platform` |
| Supabase project | `cprltmwwldbxcsunsafl` (ghmd-sales-platform) — NIP `kjweckggegifjmmqccul` is a separate production system, **never touch** |
| Netlify | `ghmdsalesplatform.netlify.app` (main auto-deploys); site id `0a339783-…` |
| monday.com Sprint Board | `18419216445` ("GHMD Sales Platform — Sprint Board", per `docs/AGENTS.md`) |

## State as of this handoff (illustrative — verify live)

- Main HEAD `fc2554b` (PR #112 squash-merge; parent `3dd3332`). Decision-log tip: **#140**.
  Open PRs: the v2.40 handoff PR itself (this one); otherwise 0.
- **Decision-log sequence note:** rows #135–#140 landed this session, **with no #138** — that id
  is a gap from a rolled-back insert. This is normal append-only behavior (ids are not reused),
  **not** a data-integrity problem. Do not "reconcile" the gap.
- `get_advisors` (security, re-run post-merge): **no new advisory introduced this session** — this
  was an auth-env-var + middleware + CI-variable + docs session with **zero DDL**, so the advisor
  set is byte-for-byte the standing set. Standing items only, all previously adjudicated/accepted:
  `public.spatial_ref_sys` RLS-disabled **ERROR** (accepted/standing via decision **#92** —
  PostGIS SRID artifact); `postgis` extension-in-public **WARN**; several service-role-only tables
  (`call_scores`, `census_block_group_cache`, `outreach_touches`, `proposal_events`,
  `proposal_sessions`, `proposals`, `spoke_candidates`, `territory_sizing_jobs`) at
  `rls_enabled_no_policy` **INFO** **by design** (deny-all + service_role bypass); and
  `SECURITY DEFINER` function WARNs (PostGIS `st_estimatedextent`, plus `gate_decision_for_pr`,
  `rls_auto_enable`, `territory_status_map` — all pre-existing from prior sessions). Do not re-open
  these on a future advisor run without a fresh Trace decision.

## What shipped since v2.39

### 1. Second-Opinion Gate model → GPT-5.6 Sol — decisions #135 (ADOPTED) / #139 (ADOPTED)

The `OPENAI_MODEL` **GitHub Actions repository variable** was created and set to `gpt-5.6-sol`.
It **did not previously exist** — `run-gate.ts` had been silently falling back to plain `gpt-5`
via its code-level default. Pinned to the explicit model id (`gpt-5.6-sol`), **not** the
`gpt-5.6` alias, so a future OpenAI default-routing change cannot silently swap the model
(#135; `residual_risk = unresolved` on the row until confirmed). **Confirmed live** via the actual
gate job console output — the line `run-gate.ts` logs for auditability read
`GPT-5 raw response (model gpt-5.6-sol)` — which closed the loop as **#139** (`residual_risk =
none`). #135's own row is left unmodified per append-only discipline; #139 confirms it in effect.

### 2. Temporary fail-closed `AUTH_GATE_DISABLED` bypass — decisions #136/#137 (ADOPTED), PR #112, merged `fc2554b`

`src/middleware.ts` previously redirected any unauthenticated request on a non-public path to
`/login`. This session added an **explicit, fail-closed** bypass: the redirect is skipped **only**
when the env var `AUTH_GATE_DISABLED` equals the exact string `'true'`. The decision logic was
extracted to `src/lib/auth-gate.ts` (`isAuthGateDisabled` / `isPublicPath` /
`shouldRedirectToLogin`) so the fail-closed truth table is exhaustively unit-testable
(`src/lib/__tests__/auth-gate.test.ts`, 47 cases incl. the adversarial near-miss battery —
`'True'`, `'TRUE'`, `'1'`, `' true'`, `''`, unset, whitespace, etc. all keep auth **required**).
The public-path set and the middleware `matcher` are byte-identical to before. Full suite: **1059
tests passing**; `next lint` clean; `next build` bundles the middleware (alias resolves in the Edge
bundle).

**Mechanism & scope (deliberate):** an env var was chosen over a code deletion specifically so
re-enabling auth is a one-step var removal, not a revert PR that could be missed (#136). Per
Trace's explicit direction in **#137** (addendum to #136), the var was set on **all** Netlify
contexts — **production + deploy-preview + branch-deploy** — **not** the narrower preview/branch
scoping a bypass like this would normally get. Chat set it via the Netlify MCP on site
`ghmdsalesplatform`; **confirmed live** with `AUTH_GATE_DISABLED=true`, context `all`. Risk
accepted (#136/#137, `residual_risk = accepted`) on the basis that all current data is
test/validation (#128) and no link is shared/known outside Trace.

**Live QA (PR #112 deploy preview, no session):** with the var effective, `/dashboard` and the
other gated routes (`/pipeline`, `/prospects`, `/territories`, bare `/proposals`, `/national-map`)
render 200 with no redirect; public paths unaffected; zero console errors. An early preview built
*before* the var was set redirected `/dashboard → /login`, giving a clean two-state demonstration
of the fail-closed default on the same code.

### 3. Manual Second-Opinion Gate clear on PR #112 — decision #140 (ADOPTED)

PR #112's gate block declared `category: 1`, `coder_residual_risk: accepted`. GPT-5.6 Sol returned
**`NO_ISSUE`**; the gate escalated **solely** because `accepted` residual risk always forces
conscious human review by design (asymmetric-agreement rule) — **not** a defect finding. Trace
manually cleared it (logged as #140 per the Hard-Rule-7 / #48 manual-clear precedent). The
underlying risk acceptance and reversal condition remain governed by #136/#137, unchanged.

### 4. Governance gap found & fixed — decision-log → PR binding (now in `docs/AGENTS.md`)

#136/#137 were correctly logged with `related_pr = NULL` **before PR #112 existed**. Once the PR
opened and declared `decision_log_id: 137` in its gate block, the gate's declaration-integrity
check (`verify-no-row-nonzero`) failed because no row was yet bound to PR #112. The fix was to
**`UPDATE`** row #137's `related_pr`/`related_repo` to `112` / `GetHairMD/ghmd-sales-platform`
(**not** insert a new row: `gate_decision_for_pr` requires the bound row's `id` to equal the PR's
declared `decision_log_id`, and a unique index allows only one bound row per PR, so a new row would
fail a *different* check, `verify-id-mismatch`). Verified by calling
`gate_decision_for_pr('GetHairMD/ghmd-sales-platform', 112)` directly, then by the re-run's job log
and PR comment. **Row #137 now shows `related_pr = 112`.** The reusable process note is now
captured in `docs/AGENTS.md` (Gate & Governance) so future sessions don't re-derive it under time
pressure. This is a Chat-only decision-log operation; Coder did not write the log.

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

**Open decisions in `ops.decision_log`: none tracked for this cycle.** The v2.39-era #96
anchor-classification question is now **resolved** — decision **#131** (ADOPTED, 2026-07-11,
predating this session) kept the three v3 QA anchors as **point-in-time references, not promoted**
to hard regression targets; #96 is SUPERSEDED by #131. (See the reconciliation note near the end.)

**Narrative backlog (no decision entry, or externally owned) — carried forward; verify each before
acting, do not assume this wording is still current:**

| Item | Owner | Status |
|---|---|---|
| Demo/test data cleanup (see #128) — e.g. ~66 territories / ~42 demo prospects; two ordered deletes (territories `LIKE 'Demo — %'` then prospects `lead_source='demo_data'`) | future Coder | Untouched; **no rush**, folded into #128's go-live wipe |
| `docs/SALES-OS-SPEC.md` §4B / National Map spec-amendment question (#122) | Trace | Untouched; not resolved; not urgent |
| Territory-creation / authoring flow scoping | future Coder | Deferred; needs its own scoping brief |
| v3 authoring-flow **polling UI** (enqueue/poll `territory_sizing_jobs`) | future Coder | Unopened |
| Session E; Platform RBAC | Trace authorization | Unopened |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused externally, unchanged |
| Authenticated deploy-preview QA automation gap | Trace / future Coder | Longstanding; note the `AUTH_GATE_DISABLED` bypass now *incidentally* unblocks authed-route browser QA while it is set — but that is temporary and must not become the assumed QA path |
| Rick Dahlson copy review (#68/#71, `legal_flag`); proposal revenue-model gap (§14 illustrative-only, #71/#76); legacy public `/proposals/[prospectId]` retirement; `reserved_for` dead column; repo-wide token-lint; Resend + Calendly provisioning | various | All unchanged from v2.36–v2.39 — carry forward, do not re-litigate |

## Residual risks (stated plainly)

- **`AUTH_GATE_DISABLED` is LIVE in production — NEW standing gate (#136/#137).** The whole app is
  currently publicly reachable across all Netlify contexts. Per #136/#137's **explicit reversal
  condition**, the var **must be removed from every Netlify context, confirmed live**, before (a)
  go-live and (b) any real prospect/rep data enters the system. **Treat "is `AUTH_GATE_DISABLED`
  still set?" as a required check in every future session touching go-live readiness — do not
  assume cleanup happened.** This is intertwined with #128 (any real data ⇒ both the data wipe and
  the auth re-enable must precede it).
- **Go-live data-wipe precondition — standing gate (#128).** All platform data is test data; a full
  wipe (including front-end/dashboard surfaces) is required before real-prospect go-live. `qa_locked`
  territories-row disposition at wipe time is **unresolved**. Formula/methodology and code-level QA
  fixtures (incl. the #96 freeze) are explicitly out of wipe scope.
- **#135 model pin — `residual_risk: unresolved` at the row, confirmed in effect by #139.** The gate
  now runs GPT-5.6 Sol, verified from live console output. No further action expected; flagged only
  so a future reader doesn't mistake #135's standalone `unresolved` for an open task.
- **#96 freeze scope limitation — accepted (unchanged).** The offline regression fixture reproduces
  the addressable arithmetic at each anchor's locked winning minute only, not the full
  expansion/minute-selection search. A green freeze test ≠ whole-engine certification.
- **RLS-bypass write pattern — CLOSED at the DB layer** (PR #104), unchanged this session; two
  accepted residuals remain (postgres-as-sole-admin `sold_boundary_geom` escape hatch; no DB-level
  DELETE guard on sold/reserved rows beyond the frozen boundary).

## Note: #96 supersession reconciled (a transient data-integrity flag, now resolved)

An earlier draft of this handoff flagged `ops.decision_log` **#96** as `status = 'SUPERSEDED'` with
`superseded_by = NULL` (an invariant gap under CLAUDE.md's supersede-never-delete rule). **Chat has
reconciled it:** #96's `superseded_by` is now set to **131**, and #131's own reasoning text states
it supersedes #96 (ADOPTED 2026-07-11, predating this session). The #96 anchor-classification
question is therefore **resolved, not open** — #131 kept the three v3 QA anchors as point-in-time
references, **not** promoted to hard regression targets. No further action; recorded here only so
the earlier flag isn't mistaken for still-live.

## Not This Session (escalate, don't creep)

The territory-authoring flow, the v3 polling UI, Session E / Platform RBAC, and Box Sign all remain
unopened/unauthorized — each requires explicit Trace authorization before a future session works it.
This session was infra/auth-posture + governance docs only.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable (deploy-preview QA reassigned to Coder — see `docs/AGENTS.md`) |
