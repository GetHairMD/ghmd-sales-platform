# GHMD Sales Platform — Handoff v2.57

**What this file is**: historical narrative plus a timestamped close-of-session
snapshot — what shipped, why, judgment calls, residual risks, deferrals, the
decision queue. Mutable state — including main HEAD, decision-log status,
advisor results, environment flags, and open-item status — must be rederived
live before acting, from git, ops.decision_log, and get_advisors, per the
2026-07-08 handoff-protocol restructure (decision #100). Any status recorded
below is a snapshot at session close, not a live source of truth. Supersedes
v2.56.

## What shipped this session

Two Phase 0 containment PRs merged, applied to the live database, and
independently verified by Chat against live state — not taken on Coder's
self-report.

**PR #153 (PR-0b) merged (squash `eb217d0`).** Revoked client (anon/
authenticated) grants on `territory_sizing_jobs`, whose RLS-enabled/zero-policy
state still carried full DML grants — the grants-vs-RLS exposure shape flagged
in v2.56. Migration applied live by Chat; verified relacl reduced to
`{postgres, service_role}`, RLS enabled, 0 policies, service_role
rolbypassrls=true. Also shipped `docs/PLATFORM-GOTCHAS.md` (new — gotchas #1–8)
and an `docs/AGENTS.md` pointer.

Mid-task discovery on PR-0b: the `spatial_ref_sys` REVOKE is **inert from
migrations** — the table is owned by `supabase_admin`, every grant was issued
by `supabase_admin`, and `postgres` (the migration role) is not a member, so a
non-grantor REVOKE warns and silently no-ops. Confirmed by rehearsal (revoke
succeeds, ACL byte-identical before/after). The same wall applies to the
Supabase console SQL editor (also runs as `postgres`). Shipped as a
half-scope: `territory_sizing_jobs` revoke only (grantor=postgres, provably
effective), `spatial_ref_sys` documented as NOT-REMEDIABLE-BY-MIGRATION and
escalated to Supabase support (ticket #SU-426558).

**PR #154 (PR-0d-interim) merged (squash `e453606`).** Two functions, two
dispositions:
- `public.rls_auto_enable()` — **REMEDIATED**. Revoked EXECUTE from PUBLIC,
  anon, authenticated (owner/grantor postgres → genuinely effective). This
  function is NOT unused — it backs a live enabled event trigger `ensure_rls`
  (ddl_command_end) that auto-enables RLS on new tables. Rehearsed with a
  positive control before authoring, and re-verified against committed state
  post-merge: the trigger still fires (event-trigger dispatch is server-internal
  and does not consult EXECUTE privileges), anon/authenticated EXECUTE now
  false, service_role retained. Migration applied live by Chat.
- `public.st_estimatedextent(...)` (×3 overloads) — **NOT REMEDIABLE BY
  MIGRATION**, documentation only. Identical `supabase_admin`-owner/grantor
  inert-REVOKE problem as spatial_ref_sys. Escalation folded into #SU-426558.

Both migrations followed the fail-closed postcondition standard (decisions
#194/#195): every security-relevant grant migration must fail loud when its
intended postcondition is not achieved, using `has_function_privilege`
effective-privilege checks rather than raw ACL string matching.

## Judgment calls made this session

**"Merged ≠ applied" held twice.** Both PR #153 and PR #154's migrations sat in
main but UNAPPLIED after merge — the live grant state was unchanged until Chat
explicitly applied each migration. Live verification before logging any
remediation as ADOPTED caught this both times. This is now a load-bearing habit,
not a one-off.

**Second-Opinion Gate binding failures on PR #153 — v2.56's "nondeterminism"
characterization SUPERSEDED by a verified deterministic root cause.** v2.56
residual item #3 stated, verbatim: "Second-Opinion Gate nondeterminism, first
observed this session. Flagged as a process risk requiring attention BEFORE Task
4 touches gate_decision_for_pr — the gate proved demonstrably load-bearing."
This session investigated the specific failures behind that flag and found two
deterministic causes, not nondeterminism: (1) no decision-log row was bound to
the PR at all; (2) the bound row carried a bare `related_repo` value
(`ghmd-sales-platform`) while the gate workflow passes the full `owner/repo`
form (`GetHairMD/ghmd-sales-platform`) — the binding lookup lower()-normalizes
case but does NOT supply a missing owner prefix, so the join silently missed.
Evidence: both failures reproduced and then resolved by (a) writing the bound
row and (b) a guarded UPDATE to the full owner/repo form, after which the gate
bound correctly on the first attempt for PR #154 — the thing PR #153 could not
do before the fix. A bulk sweep then updated all 18 remaining bare-form bound
rows to full owner/repo form; zero bare-form rows remain. The working gate
sequence is now documented: open PR as draft WITHOUT a classification block →
initial run passes "not in scope" → Chat writes ONE bound row (full owner/repo
form) → add classification block with decision_log_id → the edited event fires
the first classified run → expected coder-residual escalation when
residual_risk=unresolved → Trace manually clears. The unique index on
(lower(related_repo), related_pr) permits exactly ONE bound row per PR; closure
entries use related_pr=NULL.

Scope of this supersession, stated precisely: it resolves the specific binding
failures observed on PR #153/#151 as deterministic and explains them. It does
NOT assert that every possible future gate failure is deterministic — external-
reviewer unreachability (Sol timeouts), GPT-side unavailability, and network/CI
faults remain genuinely nondeterministic failure modes and are dispositioned
differently (a `gpt-unavailable`/unreachable escalation requires a re-run, not
treatment as a pass or a finding). The v2.56 flag is superseded as a
characterization of the observed binding problem, not as a blanket claim that
the gate can never fail nondeterministically.

**Credential-exposure incident (decision #199, OPEN).** A Netlify env-var
inventory call intended to list key NAMES returned plaintext VALUES for several
variables, breaching the credential-handling boundary documented in decision
#199. Handled by immediate disclosure + rotation
planning; NO complete credential values were repeated after the initial tool
output, though one four-character suffix fragment of one key was repeated once
in chat before Trace flagged it — recorded honestly in #199 rather than denied.
Rule established for all future sessions: never use value-returning env-var
calls; name/metadata-only inventories only. Details, consumer inventories, and
the dependency-aware rotation plan live in #199 and in the held
credential-compatibility brief (below). No credential values or fragments
appear in this handoff.

**Ungated legacy proposal route found (decision #200, OPEN — pre-live
blocker).** `src/app/proposals/[prospectId]/page.tsx` is public, service-role-
backed (RLS-bypassing), and renders prospect identity, practice, specialty,
territory, addressable-market data, and pricing to any unauthenticated caller
who obtains the URL. Critically, `isPublicPath()` (src/lib/auth-gate.ts)
exempts `pathname.startsWith('/proposals/')` BY DESIGN — so the exposure
survives removal of the temporary AUTH_GATE_DISABLED bypass; it is not merely a
side effect of that flag. Found incidentally during the Task 5 credential-
consumer review. No known disclosure of real prospect data has been identified,
and the affected stored records were verified as dummy data — but this does not
establish that the public route was never accessed (access logs were not
reviewed). It converts to real PII/pricing exposure the instant real prospect
data loads. Live reads also found 7 stored `deals.proposal_url` values pointing
at the legacy route (all doubly demo-tagged; 1 has a gated proposal record, 6
do not). Full closure definition in #200. A tightly scoped route-removal
ultrareview brief is ready for Coder (reproduced at the end of this handoff).

**External-reviewer corrections were material this session.** Trace-relayed
reviews corrected several Chat conclusions before they were acted on: the
ensure_rls event-trigger dependency (do not treat rls_auto_enable as unused);
`has_function_privilege` over raw ACL matching; the one-bound-row constraint;
draft-first gate sequencing; the sb_secret_ apikey-header compatibility issue;
dependency-aware rotation over naive Netlify-slot overwrite; the middleware
isPublicPath exemption; the seven stored legacy URLs; that a Postgres migration
cannot read NEXT_PUBLIC_PROPOSAL_BASE_URL; and that the migration must use a
single `DO $$ … $$` block with NO EXCEPTION handler (an EXCEPTION handler could
intercept the guard failure unless it explicitly re-raised it; handlers are
prohibited here so every failure propagates unconditionally). Chat also self-corrected several
factual overclaims caught on review. The durable lesson: independent live
verification before every ADOPTED/closed write, and never state as verified
what was only inferred.

## Decision-log entries this session

#192 (OPEN, bound PR #153 — spatial_ref_sys not migration-remediable,
escalated). #194 (ADOPTED — Hard Rule 7 manual gate clear PR #153; also made
self-verifying migrations a mandatory acceptance criterion). #195 (ADOPTED —
PR-0b merged+applied+verified closure). #196 (OPEN, bound PR #154 — combined
disposition; updated post-deploy: rls_auto_enable applied/verified,
st_estimatedextent sole remaining residual). #197 (ADOPTED — Hard Rule 7 manual
gate clear PR #154). #198 (ADOPTED — PR-0d-interim closure, rls_auto_enable
done). #64 set SUPERSEDED, superseded_by #198 (original "inert by return type,
accept grant" disposition superseded by the actual revoke; historical content
untouched). #199 (OPEN — credential-exposure incident). #200 (OPEN — ungated
proposal route pre-live blocker).

## Residual risks / open items

1. **Rollback-to-vulnerable-deploy (decision #189, OPEN).** Carried from v2.56.
   Trace action: prune or lock pre-`8fb5e9a` deploys in the Netlify console.
2. **`spatial_ref_sys` (decision #192, OPEN) and `st_estimatedextent` ×3
   (decision #196, OPEN)** — both await Supabase support action on ticket
   #SU-426558 (supabase_admin-level REVOKE of anon/authenticated/PUBLIC). Chat
   re-verifies relacl/proacl live before logging either closed. The
   st_estimatedextent amendment text is drafted and delivered to Trace;
   submission status unconfirmed.
3. **Credential-exposure incident (decision #199, OPEN).** Remediation NOT
   started. Rotation is console-only by Trace, dependency-aware (see held
   compatibility brief). Closure requires: SUPABASE_SERVICE_ROLE_KEY and
   PROPOSAL_GATE_SECRET rotated at the credential source (not merely one Netlify
   slot overwritten); all hosted consumers redeployed and smoke-tested; GitHub
   Actions secrets updated and the affected workflow exercised; any local
   credential stores updated and affected scripts tested; CENSUS/FRED/MAPBOX
   keys rotated as hygiene; evidence appended.
4. **Ungated proposal route (decision #200, OPEN — pre-live blocker).**
   Route-removal ultrareview PR is next in Coder's queue. Blocks loading any
   real prospect data.
5. **AUTH_GATE_DISABLED** still live in production — must be removed before
   go-live; independent of #200 (which survives its removal).
6. Standing advisor set unchanged (spatial_ref_sys ERROR, etc.).
7. CRM-003 v1.1 §13.6 acknowledgment slots (Trace + Bruce) still blank.
8. Legal flags #68/#71 still block live prospect sends.
9. Territory-methodology extraction to private store — Trace decision pending.

## Sprint 0.1 — remaining tasks, in priority order

- **Route-removal PR (NEW, from #200) — FIRST.** Tightly scoped ultrareview:
  delete/disable the legacy `/proposals/[prospectId]` page; remove the
  `/proposals/` exemption from isPublicPath(); mandatory pre-auth middleware
  tombstone (404 with zero DB/auth work); null the 7 demo-tagged stored URLs
  via a fail-loud single-DO-block migration; find every internal legacy link and
  either replace it with an already-available gated /p/[slug] URL or remove the
  legacy action — do NOT introduce a UUID-to-slug redirect. Brief ready (end of
  this handoff). Deploy + Chat
  live-verify + close #200 to ADOPTED/none (single-row close) before proceeding.
- **Task 5 — credential compatibility PR, then rotation (HELD behind #200).**
  Compatibility PR (ultrareview) introduces SUPABASE_SECRET_KEY with an exact
  fallback contract: the legacy SUPABASE_SERVICE_ROLE_KEY is used ONLY when
  SUPABASE_SECRET_KEY is absent/blank; the app fails loud if neither exists; and
  an authentication failure using the new key must NEVER fall back to the legacy
  key (fallback is for absence only, never for auth rejection). Also fixes
  run-sweep.ts to send
  the admin credential via apikey-only (dropping Authorization: Bearer for the
  service-to-service PostgREST call), maps GitHub Actions + all consumer stores,
  and includes a required local-execution inventory (name-only). Brief drafted,
  HELD until #200 is deployed/verified/closed. Actual rotation is Trace console-
  only, after the compatibility PR lands and verifies.
- **Task 5 — full git-history secret scan.** Repo is public; the PR-0a.1
  deploy-time current-tree scan does NOT discharge it. Trace is opening a fresh
  chat for this, seeded from this handoff.
- **Task 6 — next closing handoff**, once the above land.

## Pending Trace console actions (none started)

- Submit the #SU-426558 st_estimatedextent amendment (text delivered).
- Confirm sb_secret_ key availability in the Supabase dashboard (a modern
  sb_publishable_ key is already provisioned, suggesting sb_secret_ is creatable
  without regenerating the project JWT secret — needs dashboard confirmation).
- Prune/lock pre-`8fb5e9a` Netlify deploys (#189).
- The credential rotation sequence itself (after compatibility PR verifies).

## Appendix A — route-removal ultrareview brief (complete, authoritative)

This is the full, durable brief. It is the source of truth for the route-removal
PR; no in-conversation version supersedes it.

---

**Sprint:** 0.1, Phase 0 containment
**Tier:** ultrareview — auth/session-handling + prospect-facing surface + a data
migration touching prospect-facing URLs. Triggers independently apply.
**Bound decision-log row:** #200 (OPEN / unresolved).

### Decision-log authority (read first)

- Coder reports the PR number to Chat. Coder never writes or binds decision-log
  rows. Chat sets #200's related_pr / related_repo and owns all closure writes.
- Chat closes #200 itself to ADOPTED / none after verifying deployed behavior —
  single-row close, no separate closure entry.
- If anything here seems to warrant its own new decision, flag it to Chat.

### Why (one line)

/proposals/[prospectId] renders prospect identity, practice, specialty,
territory, addressable-market data, and pricing to any unauthenticated caller who
obtains the URL; isPublicPath() exempts it by design so it outlives
AUTH_GATE_DISABLED; and 7 stored deals.proposal_url values still point at it.
Full finding: decision #200.

### Scope — code

1. **Delete or permanently disable** `src/app/proposals/[prospectId]/page.tsx`.
   Deletion preferred if no legitimate caller remains. "Disable" must mean it
   cannot render data to an unauthenticated request under any env config.

2. **Remove `pathname.startsWith('/proposals/')` from `isPublicPath()`**
   (`src/lib/auth-gate.ts`). Load-bearing — without it the middleware keeps
   exempting any future `/proposals/*` route.

3. **Preserve the two coupled behaviors:**
   - Bare `/proposals` index stays auth-gated (the trailing slash currently
     excludes it — keep that true).
   - `/p/[slug]` stays publicly reachable BUT access-code enforced — do not
     touch its gate.

4. **Mandatory pre-auth tombstone** in `src/middleware.ts`: return 404 for
   `/proposals/[uuid]` requests BEFORE the `createServerClient()` call (~line 34)
   and `supabase.auth.getUser()` (~line 55). Zero database and zero auth work on
   an unauthenticated hit to the dead path.

5. **Find every internal link** to `/proposals/[prospectId]` (including template
   literals). Update legitimate ones to the gated `/p/[slug]` route. Do NOT add a
   UUID→slug redirect via another service-role lookup — that recreates the
   exposure one layer down. List each link + disposition in the PR body.

### Scope — stored data reconciliation

Live state (Chat, this session), all verified:
- 7 deals.proposal_url values contain the exact legacy origin
  `https://proposals.gethairmd.com/proposals/`.
- All 7 are doubly demo-tagged: deals.notes = '[demo_seed]' AND
  prospects.lead_source = 'demo_seed'. Zero legacy URLs sit outside the demo set.
- 1 of the 7 has a matching gated proposal record (by prospect_id); 6 do not.

**Null all seven. Do not map any of them.** Rationale (do not "improve" on this):
- The gated generator (`src/lib/proposal/generate.ts`) derives proposal URLs
  from `proposals.slug` and returns them to the caller. It does NOT persist into
  `deals.proposal_url`. Mapping a value in SQL would invent a persistence pattern
  the app does not currently maintain — out of scope for a containment fix.
- A Postgres migration cannot read `NEXT_PUBLIC_PROPOSAL_BASE_URL` anyway, so no
  correct canonical absolute URL can be constructed in SQL.
- Whether `deals.proposal_url` should be a maintained field is a separate
  data-model decision. If later deemed essential, populate it through application
  code using the canonical helper post-deploy — never SQL. Flag to Chat if you
  believe that decision is needed; do not make it here.

6. **Fix `scripts/seed-demo.ts`** (line ~343): stop populating
   `deals.proposal_url` with the legacy `/proposals/${prospectId}` URL. Leave
   `proposal_url` unset/NULL at seed time. (Gated proposal URLs continue to be
   derived from `proposals.slug` via the generator, unchanged.)

7. **Reconcile the 7 existing rows via migration** — deterministic, portable,
   with NO hardcoded replacement/current hostname; the exact retired legacy
   origin must be hardcoded as a cleanup predicate (that is the intended match
   target, not a contradiction). ATOMIC. The precondition, UPDATE, and
   postcondition MUST live inside a single `DO $$ ... $$` block with **NO
   `EXCEPTION` handler**. Every failed check uses an uncaught `RAISE EXCEPTION`
   so it escapes the block and rolls back the entire statement. Do NOT wrap this
   in a `BEGIN...EXCEPTION` construct — an EXCEPTION handler could intercept the
   guard failure unless it explicitly re-raised it; handlers are prohibited here
   so every failure propagates unconditionally.
   - **Pre-mutation guard:** fail loud if ANY row matching
     `proposal_url LIKE '%/proposals/%'` does NOT also satisfy the exact legacy
     origin prefix `https://proposals.gethairmd.com/proposals/` AND both demo
     markers (deal '[demo_seed]', prospect 'demo_seed'). Protects real records in
     any future environment.
   - **Target ONLY** rows matching the exact legacy origin AND both demo markers.
   - Set those `proposal_url` values to **NULL**.
   - **Accept zero matching rows** (clean dev/staging) as success.
   - **Post-mutation postcondition:** assert
     `SELECT count(*) FROM deals WHERE proposal_url LIKE '%/proposals/%'` is 0;
     RAISE if not.

### Migration rehearsals (run in aborted transactions)

- Zero-row environment → migration succeeds, no-ops.
- Demo-tagged legacy rows → set to NULL.
- Non-demo legacy row present → pre-mutation guard fails loud, rolls back.
- Postcondition failure (any legacy URL somehow remaining) → rolls back.

(No proposal-mapping rehearsals: this containment migration performs no mapping.)

### Tests (required, ultrareview)

- Unauthenticated request to `/proposals/<any-uuid>` → 404, with no database
  query and no auth call executed (assert tombstone-before-client ordering, not
  just status).
- `/p/[slug]` still requires its access code.
- Bare `/proposals` index still requires authentication.
- `auth-gate` tests updated; regression asserting
  `isPublicPath('/proposals/anything') === false`.
- No remaining internal link resolves to `/proposals/[prospectId]`.
- Post-migration: zero `deals.proposal_url` values matching `/proposals/`.
- `seed-demo.ts` no longer writes any `/proposals/` URL into deals.proposal_url.

### Suite / CI

`npm run lint`, `npm test`, `npm run build` — exact figures. Second-Opinion Gate
applies (ultrareview). Chat independently reproduces the suite, re-verifies the
middleware ordering AND the single-DO-block/no-EXCEPTION-handler migration
structure against committed state, and re-runs the stored-URL count live before
accepting, and again post-apply before closing #200.

### Report back to Chat

PR number, internal-link inventory with dispositions, and squash SHA once merged.
Chat binds #200 and owns its closure.

## Appendix B — credential-compatibility ultrareview brief (HELD)

HELD until #200 is deployed, independently verified, and closed to ADOPTED/none.
Not to be sent to Coder before then. No authoritative full brief exists yet.
When released, it must be drafted from decision #199 and a freshly verified
consumer inventory, then committed as a versioned repository artifact or embedded
in the next handoff — deliberately not inlined now to avoid presenting held work
as ready. Substance recorded in decision #199 and in residual item #3 above.
