-- ─────────────────────────────────────────────────────────────────────────────
-- Governed-row write guards on public.territories — DB-level protection
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network) is never touched.
--
-- AUTHORIZATION: ops.decision_log #124 (flags 1–4 of decision #123,
-- docs/RLS-BYPASS-WRITE-GUARD-SCOPING.md, merged PR #102) plus #125 (ADDENDUM to
-- #124, hardening piece 3 to value-scoped after an ultrareview adversarial finding)
-- plus #126 (ADDENDUM to #124, adding the symmetric qa_locked DELETE guard).
-- Remediates the root
-- pattern behind the 2026-07-10 Nashville incident: a service-role/admin write
-- silently overwrote a qa_locked QA anchor because NO layer — not RLS, not a
-- constraint — encoded the governed-row invariant. service_role bypasses RLS but
-- NOT triggers, so a BEFORE UPDATE trigger is the only mechanism that catches
-- every path (service-role, authenticated, and future write sites). The scoping
-- doc's recommended Option C.
--
-- THREE INDEPENDENT PIECES (flags 5/6 — proposals, generalized abstraction —
-- explicitly OUT of scope, deferred per #123/#124):
--
--   1. qa_locked immutability triggers. A locked row (qa_locked = true) rejects
--      every UPDATE EXCEPT the single unlock-only transition (qa_locked flips
--      true->false AND no other column changes), and rejects every DELETE (#126).
--      Two-step semantics (unlock, then edit-or-delete, then optionally re-lock)
--      are enforced entirely by the triggers' shape — no GUC or session flag.
--      Both fire on EVERY client incl. service_role.
--
--   2. RLS UPDATE tightening. A RESTRICTIVE policy layered on top of the existing
--      permissive `internal_users_all` (untouched) so the authenticated role
--      cannot produce a locked row: WITH CHECK (qa_locked = false). This AGREES
--      with the trigger on the unlock-only exception (an unlock leaves the new
--      row unlocked → passes) and adds defense-in-depth by making row-LOCKING
--      service-role-only. RLS cannot express the full OLD->NEW "unlock-only"
--      transition (a policy sees either the old row via USING or the new row via
--      WITH CHECK, never both) — that precision is the trigger's job; RLS is the
--      aligned backstop. SELECT/INSERT/DELETE are deliberately NOT touched.
--
--   3. sold_boundary_geom freeze (VALUE-scoped, decision #125). A separate BEFORE
--      UPDATE trigger: once sold_boundary_geom is set it is immutable on every
--      normal path REGARDLESS of status. Gated on OLD.sold_boundary_geom IS NOT
--      NULL so the first population at sale time is unaffected, but — unlike a
--      status-scoped guard — an un-sell -> edit -> re-sell round-trip can no longer
--      reach it. Every other column stays freely writable. Sole escape hatch: a
--      direct admin session (current_user = 'postgres') that has explicitly set the
--      app.sold_boundary_override GUC; no PostgREST/app path can satisfy either
--      half (app roles are authenticated/service_role, never postgres, and
--      PostgREST cannot issue SET), so the redraw is structurally out-of-band.
--
-- Idempotent (create-or-replace functions; drop-if-exists before trigger/policy).
-- Additive: no data change, no column change, no existing-policy change.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Piece 1: qa_locked immutability (except unlock-only) ──────────────────────
create or replace function public.reject_qa_locked_territory_write()
returns trigger
language plpgsql
set search_path = ''   -- pinned: uses only pg_catalog built-ins + OID-resolved type I/O
as $$
begin
  -- Reached only when OLD.qa_locked is true (see trigger WHEN clause). Permit the
  -- lone legal transition: qa_locked true->false with NO other column changed.
  -- Mask qa_locked out of both row images and compare as jsonb — exact equality
  -- that serializes the MULTIPOLYGON geometry columns via canonical EWKB text,
  -- sidestepping PostGIS '=' bounding-box semantics, and auto-covers any column
  -- added to the table in future (the invariant needs no per-column maintenance).
  if new.qa_locked = false
     and (to_jsonb(new) - 'qa_locked') = (to_jsonb(old) - 'qa_locked') then
    return new;
  end if;

  raise exception
    'territory % is qa_locked; only an unlock-only UPDATE (qa_locked true->false with no other column changed) is permitted while locked',
    old.id
    using errcode = 'check_violation';
end;
$$;

comment on function public.reject_qa_locked_territory_write() is
  'BEFORE UPDATE guard for territories.qa_locked (decision #124). Rejects any change to a qa_locked row except the unlock-only transition. Fires on every client including service_role (triggers are not bypassed by RLS-exempt roles).';

drop trigger if exists territories_qa_lock_guard on public.territories;
create trigger territories_qa_lock_guard
  before update on public.territories
  for each row
  when (old.qa_locked)
  execute function public.reject_qa_locked_territory_write();

-- ── Piece 1b: qa_locked DELETE guard (decision #126) ──────────────────────────
-- Symmetric to the UPDATE guard: a locked row cannot be deleted, closing the
-- delete+recreate anchor-loss vector. No new escape hatch — it reuses the #124
-- unlock step: to delete a locked row, first unlock it (qa_locked true->false),
-- then issue an ordinary DELETE on the now-unlocked row. Fires on every client.
create or replace function public.reject_qa_locked_territory_delete()
returns trigger
language plpgsql
set search_path = ''   -- pinned: no schema-qualified references
as $$
begin
  -- Reached only when OLD.qa_locked is true (see trigger WHEN), so every firing
  -- is a delete of a locked row and is rejected unconditionally.
  raise exception
    'territory % is qa_locked and cannot be deleted; unlock it first (qa_locked true->false), then delete',
    old.id
    using errcode = 'check_violation';
end;
$$;

comment on function public.reject_qa_locked_territory_delete() is
  'BEFORE DELETE guard for qa_locked territories (decision #126). A locked row cannot be deleted; unlock it first (the #124 UPDATE escape hatch), then delete. Fires on every client including service_role.';

drop trigger if exists territories_qa_lock_delete_guard on public.territories;
create trigger territories_qa_lock_delete_guard
  before delete on public.territories
  for each row
  when (old.qa_locked)
  execute function public.reject_qa_locked_territory_delete();

-- ── Piece 2: RLS UPDATE tightening (restrictive, aligned with the trigger) ────
-- Leaves the permissive internal_users_all policy (and SELECT/INSERT/DELETE)
-- entirely intact; restrictive policies AND with the permissive grant.
drop policy if exists territories_block_locked_row_update on public.territories;
create policy territories_block_locked_row_update
  on public.territories
  as restrictive
  for update
  to authenticated
  using (true)
  with check (qa_locked = false);

-- ── Piece 3: sold_boundary_geom value-scoped freeze (decision #125) ───────────
create or replace function public.reject_sold_boundary_change()
returns trigger
language plpgsql
set search_path = ''   -- pinned: uses only pg_catalog built-ins + OID-resolved type I/O
as $$
begin
  -- Reached only when OLD.sold_boundary_geom is not null (see trigger WHEN), i.e.
  -- the boundary has already been set. From that point it is frozen regardless of
  -- status. Canonical-text compare avoids the PostGIS '=' bounding-box gotcha and
  -- is NULL-safe (IS DISTINCT FROM). A no-op (or any non-boundary edit) leaves the
  -- two equal and passes through, so every other column stays writable.
  --
  -- SOLE ESCAPE HATCH: a direct admin session (current_user = 'postgres' — the
  -- migration / Supabase MCP / psql role) that has explicitly set the
  -- app.sold_boundary_override GUC. App clients reach the DB only via PostgREST as
  -- the authenticated or service_role role (never 'postgres'), and PostgREST
  -- cannot issue SET — so no application path (RLS-mediated OR service-role batch)
  -- can satisfy either condition. Both halves are required so a routine postgres
  -- migration doesn't silently redraw a boundary without the explicit intent flag.
  if new.sold_boundary_geom::text is distinct from old.sold_boundary_geom::text
     and not (
       current_user = 'postgres'
       and coalesce(current_setting('app.sold_boundary_override', true), '') = 'on'
     )
  then
    raise exception
      'territory % has a frozen sold_boundary_geom (decision #125); it is immutable once set. Redraw requires an out-of-band admin override.',
      old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.reject_sold_boundary_change() is
  'BEFORE UPDATE guard for territories.sold_boundary_geom (decision #125, addendum to #124). Value-scoped: once the sold boundary is set it is immutable regardless of status, closing the un-sell/edit/re-sell round-trip. Sole escape hatch: a direct admin session (current_user=postgres) that has set the app.sold_boundary_override GUC; no PostgREST/app path (authenticated or service_role) can satisfy either condition.';

drop trigger if exists territories_sold_boundary_guard on public.territories;
create trigger territories_sold_boundary_guard
  before update on public.territories
  for each row
  when (old.sold_boundary_geom is not null)
  execute function public.reject_sold_boundary_change();
