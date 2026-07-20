-- ─────────────────────────────────────────────────────────────────────────────
-- PR-0d-interim — triage of accidental anon-executable privileged functions
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network) is never touched.
--
-- Sprint 0.1, Phase 0 emergency containment wave (GHMD-CRM-003 §7.1, row
-- "0d-interim"). Scope is deliberately NARROW: the two accidental
-- anon-executable SECURITY DEFINER functions named in that row. The full
-- grant-by-grant audit of every SECURITY DEFINER function is 0d proper (§7.4).
--
-- EXPLICITLY NOT TOUCHED HERE:
--   • public.gate_decision_for_pr(text, integer) — deliberate and CI-load-bearing.
--     The Second-Opinion Gate workflow (.github/workflows/second-opinion-gate.yml)
--     calls it as the anon role via SUPABASE_ANON_KEY. Revoking it breaks the gate.
--   • The nine `authenticated`-executable custom RPCs (community_board_authors,
--     create_territory_deal, ensure_priced_deal, move_deal_stage,
--     scoreboard_summary, set_customer_deal_status, set_deal_status,
--     territory_sold_summary, territory_status_map) — 0d proper, §7.4.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION A — public.rls_auto_enable()  ·  REMEDIATED BY THIS MIGRATION
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Measured baseline (live, 2026-07-20):
--   owner    : postgres
--   secdef   : true
--   proacl   : {=X/postgres,postgres=X/postgres,anon=X/postgres,
--               authenticated=X/postgres,service_role=X/postgres}
--
-- Every grant was issued BY postgres, and migrations run AS postgres — so unlike
-- spatial_ref_sys / st_estimatedextent this revoke is genuinely effective, not
-- inert (see docs/PLATFORM-GOTCHAS.md #6).
--
-- Note the leading bare `=X/postgres`: that is a grant to PUBLIC. Revoking only
-- anon + authenticated would leave it fully intact and the function would remain
-- executable by every role. PUBLIC is therefore revoked explicitly below
-- (docs/PLATFORM-GOTCHAS.md #7).
--
-- ⚠ THIS FUNCTION IS NOT UNUSED. It backs a live, ENABLED event trigger:
--     evtname 'ensure_rls' · evtevent 'ddl_command_end' · evtenabled 'O'
--     · owner postgres
--   which auto-enables RLS on newly created tables. Earlier disposition
--   (decision #64, and the header of 20260708120000_hard_rule_10_rls_remediation)
--   recorded this finding as accepted/"inert by return type". That reasoning is
--   PARTIALLY superseded here: the return type does make it non-RPC-invocable,
--   but the EXECUTE grant itself is real and is removed rather than reasoned away.
--   The trigger's own dispatch is unaffected — see the rehearsal below.
--
-- FUNCTIONAL REHEARSAL — run live in an aborted transaction before authoring
-- this migration (revoke + CREATE TABLE + relrowsecurity read + positive
-- control, all rolled back). Measured result:
--
--   user=postgres
--   control_rls=t   ← table created with grants INTACT   → ensure_rls fires
--   test_rls=t      ← table created AFTER the revoke     → ensure_rls STILL fires
--   anon=f  authenticated=f  service_role=t
--   acl_after={postgres=X/postgres,service_role=X/postgres}
--
--   Post-rollback re-read confirmed 0 leftover tables and proacl restored to the
--   baseline above. The positive control is what makes test_rls=t meaningful:
--   it proves the probe can actually observe the trigger firing.
--
--   Mechanism: event-trigger dispatch is server-internal invocation, not a
--   session-issued call, so it does not consult EXECUTE privileges at all.
--   (docs/PLATFORM-GOTCHAS.md #9.)

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Fail-closed postcondition (decisions #194/#195 standard). Effective-privilege
-- checks via has_function_privilege — NOT raw proacl string matching, which would
-- miss privileges inherited through role membership.
do $$
begin
  if has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') then
    raise exception 'anon retains EXECUTE on rls_auto_enable() after revoke';
  end if;
  if has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') then
    raise exception 'authenticated retains EXECUTE on rls_auto_enable() after revoke';
  end if;
  if not has_function_privilege('service_role', 'public.rls_auto_enable()', 'EXECUTE') then
    raise exception 'service_role unexpectedly lost EXECUTE on rls_auto_enable()';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION B — public.st_estimatedextent(...)  ·  NOT REMEDIABLE BY MIGRATION
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ⚠ DOCUMENTATION ONLY. There is deliberately NO executable SQL in this section.
-- Do not "complete" this migration by adding a revoke here — see the measurement
-- below for why that would produce a false remediation record.
--
-- Affected overloads (all three):
--   public.st_estimatedextent(text, text)
--   public.st_estimatedextent(text, text, text)
--   public.st_estimatedextent(text, text, text, boolean)
--
-- Measured baseline (live, 2026-07-20), identical across all three:
--   owner  : supabase_admin
--   secdef : true
--   proacl : {=X/supabase_admin,supabase_admin=X/supabase_admin,
--             postgres=X/supabase_admin,anon=X/supabase_admin,
--             authenticated=X/supabase_admin,service_role=X/supabase_admin}
--
-- Every grant was issued BY supabase_admin. Migrations run as postgres, which is
-- not a member of supabase_admin, so a REVOKE here is INERT — and inert in the
-- most dangerous way. Rehearsed live in an aborted transaction:
--
--   revoke_error = NO ERROR RAISED   ← the statement SUCCEEDS
--   anon_before  = t
--   anon_after   = t                 ← and changes absolutely nothing
--   acl_before   == acl_after        ← byte-identical
--
-- So a revoke placed here would pass CI, be recorded as applied in
-- supabase_migrations, and stand as a permanent record claiming remediation that
-- never occurred. `merged ≠ applied ≠ working`, with even *applied* being true.
-- (docs/PLATFORM-GOTCHAS.md #6.)
--
-- ⚠ The Supabase console SQL editor is NOT a workaround. It also runs as
-- postgres and no-ops identically. This is the same wall PR-0b hit on
-- public.spatial_ref_sys.
--
-- EXPOSURE CHARACTERIZATION (measured, deliberately not overclaimed):
-- all three overloads are callable by anon at the grant level, including via the
-- bare PUBLIC grant. This establishes grant-level exposure, with potential for
-- spatial-metadata disclosure through elevated PostGIS statistics access. It does
-- NOT, on its own, establish that a materially sensitive information leak has
-- been demonstrated.
--
-- ESCALATION: Supabase support ticket #SU-426558 (shared with the spatial_ref_sys
-- item from PR-0b). The request must explicitly ask for the revoke on anon,
-- authenticated, AND PUBLIC for all three overloads. Durable fix is the same as
-- spatial_ref_sys: relocate the postgis extension out of the public schema.
-- Tracked as an unresolved residual, not as remediated.
-- ─────────────────────────────────────────────────────────────────────────────
