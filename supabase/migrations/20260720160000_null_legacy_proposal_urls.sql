-- ─────────────────────────────────────────────────────────────────────────────
-- Null legacy deals.proposal_url values pointing at the retired public route
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network) is never touched.
--
-- Sprint 0.1, Phase 0 containment (decision #200). Companion to the code removal
-- of the public, service-role-backed page /proposals/[prospectId] and its
-- isPublicPath() exemption (+ a pre-auth middleware tombstone).
--
-- Live state at authoring (verified this session): exactly the demo-seeded rows
-- carry a proposal_url at the retired origin `https://proposals.gethairmd.com/proposals/`,
-- every one of them doubly demo-tagged (deals.notes = '[demo_seed]' AND the linked
-- prospects.lead_source = 'demo_seed'). This migration NULLs exactly those rows.
--
-- It does NOT map them to a replacement URL. Rationale (deliberate — do not "improve"):
--   • The gated generator (src/lib/proposal/generate.ts) derives proposal URLs from
--     proposals.slug and returns them to the caller; it does NOT persist into
--     deals.proposal_url. Inventing a persistence pattern here is out of scope.
--   • A Postgres migration cannot read NEXT_PUBLIC_PROPOSAL_BASE_URL, so no correct
--     canonical absolute URL can be constructed in SQL anyway.
--   • Whether deals.proposal_url should be a maintained field is a separate
--     data-model decision (flag to Chat if ever needed) — not made here.
--
-- STRUCTURE (load-bearing, per the decision-#200 brief): the precondition guard, the
-- UPDATE, and the postcondition all live inside ONE `do $$ ... $$` block with NO
-- `EXCEPTION` handler. Every failed check is an uncaught `raise exception`, so it
-- escapes the block and rolls back the entire statement. A handler is deliberately
-- ABSENT: it could swallow a guard failure unless it explicitly re-raised, so it is
-- prohibited — every failure must propagate unconditionally.
--
-- Portable + deterministic: the ONLY hardcoded hostname is the retired legacy origin,
-- used purely as a cleanup predicate (its intended match target). No current/replacement
-- hostname appears. Re-runnable: once the rows are NULL they no longer match, so a
-- second apply is a clean zero-row no-op.
--
-- REHEARSED live in aborted transactions (evidence in the PR comment):
--   • zero matching rows                   → succeeds, no-op;
--   • demo-tagged legacy rows              → set to NULL;
--   • exact-origin row with notes IS NULL  → pre-mutation guard raises, rolls back;
--   • a non-demo-notes legacy row present  → pre-mutation guard raises, rolls back;
--   • a wrong-origin /proposals/ row       → pre-mutation guard raises, rolls back;
--   • an unexpected URL left behind        → postcondition raises, rolls back.
-- The notes-IS-NULL case is the null-safety fix: the earlier `NOT (…)`/INNER-JOIN guard
-- excluded it (three-valued logic + inner-join drop); the LEFT JOIN + `IS NOT TRUE`
-- guard now identifies it BEFORE the UPDATE, per the decision-#200 contract.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_legacy_origin constant text := 'https://proposals.gethairmd.com/proposals/';
  v_unexpected    bigint;
  v_updated       bigint;
  v_remaining     bigint;
begin
  -- ── Pre-mutation guard ─────────────────────────────────────────────────────
  -- Protect real records in ANY environment: if a deals.proposal_url references a
  -- '/proposals/' path but is NOT a demo-tagged row at the exact retired origin,
  -- refuse to touch anything and roll the whole statement back.
  --
  -- NULL-SAFE (load-bearing): deals.notes is nullable, and a deal may in principle be
  -- unlinked. Both the plain-`NOT (…)` form and an INNER JOIN would silently DROP such
  -- rows from the count — `NOT (… AND NULL …)` is NULL (not true), and an inner join
  -- discards a row with no matching prospect. Either would let an unexpected
  -- '/proposals/' row slip past the guard (the postcondition would still roll back, but
  -- the guard MUST be the identifier per the decision-#200 contract). So: LEFT JOIN (keep
  -- unlinked rows) + `(expected-row predicate) IS NOT TRUE` (treat NULL/false alike as
  -- "unexpected"). Do NOT rewrite this as `NOT (predicate)`.
  select count(*)
    into v_unexpected
    from public.deals d
    left join public.prospects p on p.id = d.prospect_id
   where d.proposal_url like '%/proposals/%'
     and (
           d.proposal_url like v_legacy_origin || '%'
       and d.notes = '[demo_seed]'
       and p.lead_source = 'demo_seed'
     ) is not true;

  if v_unexpected > 0 then
    raise exception
      'legacy-proposal-url guard: % deals.proposal_url row(s) reference /proposals/ but are not demo-tagged rows at the retired origin (%); refusing to modify',
      v_unexpected, v_legacy_origin;
  end if;

  -- ── Targeted cleanup ───────────────────────────────────────────────────────
  -- NULL ONLY the demo-tagged rows at the exact retired origin. Zero rows is success.
  with tgt as (
    select d.id
      from public.deals d
      join public.prospects p on p.id = d.prospect_id
     where d.proposal_url like v_legacy_origin || '%'
       and d.notes = '[demo_seed]'
       and p.lead_source = 'demo_seed'
  )
  update public.deals d
     set proposal_url = null
    from tgt
   where d.id = tgt.id;

  get diagnostics v_updated = row_count;
  raise notice 'legacy-proposal-url cleanup: nulled % demo row(s)', v_updated;

  -- ── Post-mutation postcondition ────────────────────────────────────────────
  -- No deals.proposal_url may reference '/proposals/' anywhere after the cleanup
  -- (catches orphans / anything the targeted UPDATE did not reach).
  select count(*)
    into v_remaining
    from public.deals
   where proposal_url like '%/proposals/%';

  if v_remaining > 0 then
    raise exception
      'legacy-proposal-url postcondition: % deals.proposal_url row(s) still reference /proposals/ after cleanup',
      v_remaining;
  end if;
end $$;
