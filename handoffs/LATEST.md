# GHMD Sales Platform — Handoff v2.56

**What this file is**: narrative only — what shipped, why, judgment calls,
residual risks, deferrals, the decision queue. NEVER a source of state facts
(main HEAD, decision-log tip, advisor status) — those are derived live every
session from git, ops.decision_log, and get_advisors per the 2026-07-08
handoff-protocol restructure (decision #100).

## What shipped this session

**PR #151 (PR-0a.1) merged to main at `0f92185`**, atop PR-0a (`8fb5e9a`).
Shared-secret authentication on the sizing Background Function
(`size-territory-background`) plus a runtime serve-refusal check
(`shouldRefuseServing`) closing the last gap in Sprint 0.1 emergency
containment. **Deployed to production and independently verified**: Netlify
deploy `6a5e2e9a7f3bf1000848f824`, `state: ready`, `commit_ref: 0f92185`,
`context: production`, published `2026-07-20T14:21:01.110Z`. The
`size-territory-background` function's deployed digest changed to
`3a8545c4…`, confirmed via direct Netlify API read (not taken on Coder's
self-report) — the auth code genuinely redeployed rather than serving from
cache. Deploy-time secret scan clean (3193 files, 0 matches) — this is a
CURRENT-TREE scan only; it does not discharge Task 5's full git-history scan.

Core changes:
- `src/lib/sizing-function-auth.ts` — shared-secret module (SHA-256 +
  constant-time compare), imported by both the Background Function handler
  and the trigger caller so header name and comparison semantics can't
  drift apart. Minimum secret length floor (32 chars) enforced on BOTH
  sides — sender calls the same `isSizingSecretConfigured` the verifier
  uses, not a separate truthiness check.
- `netlify/functions/size-territory-background.mts` — auth check is now
  the literal first thing in the handler, before body parse, before the
  service-role client, before any external call.
- `src/lib/deployment-guard.mjs` — new `isHostedRuntime`/`shouldRefuseServing`,
  deliberately a DIFFERENT context discriminator than the build-time guard.
  `NETLIFY` is build-only metadata and is absent from Netlify's edge
  runtime — empirically verified live, not assumed.
- `src/middleware.ts` — calls the runtime refusal first, before any
  Supabase client construction.
- `src/lib/territory-sizing-jobs.ts` — stale-queued watchdog (lazy,
  read-time, 5-minute inclusive threshold) for invocations the platform
  202-accepted but never executed; a separate `markTriggerFailed` path for
  trigger failures the caller can see immediately (non-202, secret
  unprovisioned) so those no longer wait on the lazy watchdog.

## Judgment calls made this session

**Scope B chosen for the 202-ack problem** (Trace decision): Netlify
Background Functions acknowledge with 202 before executing and discard the
handler's Response, so the trigger caller cannot observe auth outcomes.
Chose honest semantics (the accepted-detail string says explicitly that
execution/auth are unconfirmed) + a lazy read-time watchdog, over building
new scheduling infrastructure. The contract is precisely: a stale job is
failed on the FIRST STATUS READ at or after 5 minutes, not unconditionally
within 5 minutes.

**Edge-runtime env variables were empirically probed, not assumed.** The
first implementation keyed runtime detection on `process.env.NETLIFY`,
which is BUILD metadata absent at serve time. Verified live with Trace's
approval via a deliberately build-clean/runtime-dirty deploy preview.
Measured shape: `NETLIFY=false, SITE_ID=true, SITE_NAME=true, URL=true,
NODE_ENV=false`. Fixed to OR across SITE_ID/SITE_NAME/URL.

**Eight-finding Second-Opinion Gate cycle on PR #151, severity decayed
monotonically**, plus two further findings on the final run that
re-asserted an already-superseded framing — declined as re-litigation, not
new findings. One finding (persistent service-role write failure during
the watchdog) accepted as a bounded residual (decision #186): persisting a
failed state IS a write through the same failing path — the demanded
remedy is logically unsatisfiable.

**Sol (external reviewer) consolidation pass** caught three real gaps the
gate cycle hadn't: known trigger failures no longer wait on the lazy
watchdog; the secret-strength floor is enforced on BOTH sides, not just
the verifier; the residual language corrected from "globally degraded" to
"bounded, possibly table-specific."

**End-to-end verification.** Trace ran one authorized sizing job on the
final preview (job `65ddb65e…`): queued 14:17:53 → running 14:17:54 →
succeeded 14:18:30 — live proof the rotated 64-hex `SIZING_FUNCTION_SECRET`
clears the new floor and the full pipeline works under the new controls.

**Post-merge, Coder ran production verification (function digest, regression
matrix across auth-gated and public routes, secret scan) without an explicit
Chat-issued brief scoping that pass.** Nothing adverse resulted, and Chat
independently re-verified the material claims (deploy state, digest,
secret-scan result) against live Netlify/GitHub state before accepting them.
Noted here as a process observation, not logged as a decision: future
sessions should scope post-merge production verification explicitly in the
brief rather than have Coder self-initiate it, to keep the audit trail
unambiguous about who authorized what.

## New finding this session — folded into Task 3 scope

While investigating the stale-queued watchdog, Coder found (and Chat
independently confirmed via `information_schema.role_table_grants` and
`pg_policies`) that `territory_sizing_jobs` has RLS enabled with ZERO
policies, yet `anon` and `authenticated` both still hold full
SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants — the identical
grants-vs-RLS exposure shape Task 3 (PR-0b) already targets for
`spatial_ref_sys`. Not a live exploit today (RLS blocks both roles by
default-deny with no policies), but weak defense-in-depth on a table now
central to the sizing pipeline. **Folded into Task 3's scope** — see the
PR-0b brief already drafted and ready for the next session.

## Decision-log entries this session

#181–183 (continued from prior session), #184–190 (five consumed by
constraint-violation retries — platform enum is `sales`/`nip`/`cross`, not
`supabase`; residual_risk enum is `none`/`accepted`/`unresolved`, not free
text — harmless under append-only rules), #186 (accepted residual — sizing
watchdog persistence-failure path), #188 (#181/#182 closure), #189 (rollback
residual — OPEN, Trace action), #191 (Hard Rule 7 manual clear record).
**Tip: #191.**

## Residual risks / open items

1. **Rollback-to-vulnerable-deploy (decision #189, OPEN).** Trace action:
   prune or lock pre-`8fb5e9a` deploys in the Netlify console.
2. **Bounded watchdog-persistence residual (decision #186, accepted).**
   Logged, not alerted. Future work: alerting.
3. **Second-Opinion Gate nondeterminism, first observed this session.**
   Flagged as a process risk requiring attention BEFORE Task 4 touches
   `gate_decision_for_pr` — the gate proved demonstrably load-bearing.
4. **`territory_sizing_jobs` grants exposure** — see above, folded into
   Task 3.
5. Standing advisor set unchanged (spatial_ref_sys ERROR, etc.).
6. CRM-003 v1.1 §13.6 acknowledgment slots (Trace + Bruce) still blank.
7. Hard Rule 10 + legal flags #68/#71 still block live prospect sends.
8. Territory-methodology extraction to private store — Trace decision
   still pending.

## Sprint 0.1 — remaining tasks, in priority order

- **Task 3**: PR-0b — PostGIS write revokes, NOW EXPANDED to also cover
  `territory_sizing_jobs` grants, plus a docs commit capturing five durable
  platform gotchas from the PR-0a.1 arc into `docs/AGENTS.md`. Brief already
  fully drafted (see prior session log) — ready to hand to Coder as the
  first action of the next session.
- **Task 4**: PR-0d-interim. Precondition: verify `second-opinion-gate.yml`'s
  auth path before touching `gate_decision_for_pr`, given the gate-nondeterminism
  observation above.
- **Task 5** (ELEVATED): rotate `SUPABASE_SERVICE_ROLE_KEY` +
  `PROPOSAL_GATE_SECRET` (Trace, console only); full git-history secret
  scan (repo is public) — NOT discharged by this session's deploy-time scan.
- **Task 6**: next closing handoff, once Tasks 3–5 land.
