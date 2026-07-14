-- ─────────────────────────────────────────────────────────────────────────────
-- E-0b — Deal Territories rework: sold-attribution columns, the shared
-- stage→Funded/Won close trigger, rep-siloed territories RLS, and a minimal
-- sold-summary projection.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Decision log: Session E RBAC scoping (#150 authorized E-0a/E-0b; the completion
-- number is Chat's to assign at write time — Coder never writes ops.decision_log).
--
-- Depends on E-0a (PR #124, merged 3e2c1d7): internal_users.full_name, the
-- hardened prospects.rep_read_own (designation-guarded), and assigned_rep_id
-- wiring are all assumed present.
--
-- WHAT this migration does:
--   1. territories: add state (text), sold_by (uuid → auth.users), sold_at
--      (timestamptz). prospects: add funded_won_at (timestamptz).
--   2. Backfill territories.state on DEMO rows by parsing the trailing ", ST" from
--      name — BACKFILL ONLY, and scoped `where qa_locked = false` (the qa_locked
--      guard trigger rejects ANY write to a locked row, and the 3 v3 anchors don't
--      carry a ", ST" suffix anyway → they stay NULL, handled gracefully in the UI).
--      Forward-going population is a real Census geography lookup at territory
--      creation time (src/app/api/territories/route.ts), NEVER string parsing.
--   3. stamp_prospect_funded_won(): the shared "deal closed" trigger. Fires once on
--      the first crossing into Funded/Won and stamps prospects.funded_won_at plus
--      every associated territory (status='sold', sold_by, sold_at). Built once,
--      subscribed twice (this page today, E-1 Bell Ringing later).
--   4. territory_sold_summary(): SECURITY DEFINER projection of the minimal sold
--      fields every rep may see for ANY sold territory (twin of
--      territory_status_map, decision #132) — never exposes addressable/census.
--   5. RLS: replace the over-broad internal_users_all (any internal user = full
--      access — the rep-siloing gap) with exec_all (FOR ALL, executive) + rep_read
--      (FOR SELECT, rep, siloed). The restrictive qa_locked UPDATE policy and both
--      qa_locked guard triggers are untouched.
--
-- STAGE PIN: the literal 11 in the trigger MUST equal STAGE.FUNDED_WON in
-- src/lib/pipeline-stages.ts. SQL cannot import the TS constant, so
-- pipeline-stages.test.ts pins STAGE.FUNDED_WON === 11 — any renumber breaks CI
-- loudly instead of silently stamping territories sold at the wrong stage. (The
-- brief's "stage index 10" predates decision #110's insertion of Qualification
-- Review at id 5, which shifted Funded/Won from 10 to 11; stage 10 is now Contract
-- Signed. Confirmed live against pipeline-stages.ts + dashboard/data.ts wonCount.)
--
-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.territories
  add column if not exists state text,
  add column if not exists sold_by uuid references auth.users(id),
  add column if not exists sold_at timestamptz;

comment on column public.territories.state is
  'USPS 2-letter state code for the territory. Forward-going rows are populated '
  'from a real Census geography lookup (geoToFips → abbrForStateFips) at creation '
  'time — NEVER string-parsed. NULL is allowed (e.g. the v3 QA anchors, or a '
  'lookup miss); every consumer renders NULL gracefully (generic bucket), never crashes.';
comment on column public.territories.sold_by is
  'auth.users uid of the rep credited with the sale (prospects.assigned_rep_id at '
  'close). Stamped by stamp_prospect_funded_won() on the first Funded/Won crossing. '
  'Nullable: an unassigned prospect closes with sold_by NULL.';
comment on column public.territories.sold_at is
  'Close timestamp, = prospects.funded_won_at at the moment of the first Funded/Won '
  'crossing. Stamped by stamp_prospect_funded_won(). NULL until sold.';

alter table public.prospects
  add column if not exists funded_won_at timestamptz;

comment on column public.prospects.funded_won_at is
  'Durable "deal closed" signal: set once by stamp_prospect_funded_won() on the '
  'first crossing into Funded/Won (stage >= STAGE.FUNDED_WON). Idempotency guard for '
  'the trigger and the single detection point other features (E-1 Bell Ringing) key '
  'off without rebuilding close-detection. NULL until the deal first closes.';

-- ── 2. Backfill state on demo rows (string-parse — BACKFILL ONLY) ────────────
-- Scoped `where qa_locked = false`: the territories_qa_lock_guard trigger rejects
-- ANY write to a locked row (even a no-op), and the 3 v3 anchors carry a
-- "City – Neighborhood" name with no ", ST" to parse — so they are correctly left
-- NULL. Regexp captures a trailing 2-letter uppercase state after a comma.
update public.territories
set state = substring(name from ',\s*([A-Z]{2})\s*$')
where qa_locked = false
  and state is null
  and name ~ ',\s*[A-Z]{2}\s*$';

-- ── 3. Shared stage→Funded/Won close trigger ─────────────────────────────────
-- BEFORE UPDATE OF stage (not AFTER): stamping NEW.funded_won_at in-place only
-- persists in a BEFORE trigger; an AFTER trigger would need a recursive self-UPDATE
-- on prospects. SECURITY DEFINER so the territories write succeeds regardless of the
-- acting principal's territories-write RLS (a rep advancing a prospect has no direct
-- territories UPDATE grant). search_path pinned empty; every reference schema-qualified.
create or replace function public.stamp_prospect_funded_won()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reached only via the trigger WHEN clause: OLD.stage < 11, NEW.stage >= 11,
  -- funded_won_at still NULL. 11 == STAGE.FUNDED_WON (pipeline-stages.ts; pinned by
  -- pipeline-stages.test.ts). This is the first (and, by the funded_won_at IS NULL
  -- guard, only) crossing into Funded/Won.
  new.funded_won_at := now();

  -- Stamp EVERY associated territory (0/1/many — no unique constraint on
  -- territories.prospect_id, so never assume exactly one). Exclude qa_locked rows:
  -- the territories_qa_lock_guard trigger would raise on them and roll back the whole
  -- stage move, and a QA anchor is never real sold inventory.
  update public.territories
  set status  = 'sold',
      sold_by = new.assigned_rep_id,
      sold_at = new.funded_won_at
  where prospect_id = new.id
    and coalesce(qa_locked, false) = false;

  return new;
end;
$$;

comment on function public.stamp_prospect_funded_won() is
  'Shared deal-close trigger (E-0b). BEFORE UPDATE OF stage on prospects: on the '
  'first crossing into Funded/Won (OLD.stage < 11, NEW.stage >= 11, funded_won_at '
  'NULL — 11 == STAGE.FUNDED_WON, pinned by test) sets prospects.funded_won_at and '
  'marks every associated non-locked territory sold (status/sold_by/sold_at). '
  'SECURITY DEFINER so the territories write is not gated by the acting rep''s '
  'territories RLS; still subject to the qa_locked guard trigger (locked rows '
  'excluded in the WHERE). Idempotent via the funded_won_at IS NULL guard.';

-- Explicit-grant discipline (brief §2): a trigger function inherits the default
-- PUBLIC EXECUTE grant, so PostgREST would expose it as a callable RPC to anon.
-- Trigger invocation does NOT check EXECUTE on the function (the trigger system,
-- not the caller, runs it), so revoking ALL execute closes the /rest/v1/rpc
-- surface with zero effect on the trigger firing. No grant back — nobody calls it
-- directly. (get_advisors confirms it drops out of both the anon- and
-- authenticated-executable SECURITY DEFINER findings.)
revoke all on function public.stamp_prospect_funded_won() from public, anon, authenticated;

drop trigger if exists prospects_stamp_funded_won on public.prospects;
create trigger prospects_stamp_funded_won
  before update of stage on public.prospects
  for each row
  when (
    old.stage < 11
    and new.stage >= 11
    and new.funded_won_at is null
  )
  execute function public.stamp_prospect_funded_won();

-- ── 4. Minimal sold-summary projection (SECURITY DEFINER) ────────────────────
-- The twin of territory_status_map() (decision #132): lets EVERY internal user see
-- the minimal "sold" facts for ANY sold territory — practice sold to, closing rep's
-- name, close date — WITHOUT exposing the underlying prospects / internal_users
-- rows (a rep cannot read another rep's prospect via rep_read_own, nor another
-- internal user's row via self_read). Deliberately projects NO addressable / census
-- / boundary / center column: those must never reach a non-owning rep, and the only
-- way to guarantee that is for this single privileged path to omit them entirely.
create or replace function public.territory_sold_summary()
returns table (
  id uuid,
  name text,
  state text,
  sold_at timestamptz,
  sold_to_practice text,   -- prospects.practice_name of the buyer
  closed_by_name text      -- internal_users.full_name of the crediting rep
)
language sql
security definer
set search_path = ''
as $$
  select
    t.id,
    t.name,
    t.state,
    t.sold_at,
    p.practice_name              as sold_to_practice,
    iu.full_name                 as closed_by_name
  from public.territories t
  left join public.prospects p on p.id = t.prospect_id
  left join public.internal_users iu on iu.user_id = t.sold_by
  where t.status = 'sold'
    and exists (
      select 1 from public.internal_users me where me.user_id = auth.uid()
    );
$$;

revoke all on function public.territory_sold_summary() from public, anon, authenticated;
grant execute on function public.territory_sold_summary() to authenticated;

comment on function public.territory_sold_summary() is
  'Minimal sold-territory projection for the Deal Territories index (E-0b), twin of '
  'territory_status_map (#132). SECURITY DEFINER, search_path pinned: returns only '
  'name/state/sold_at/sold_to_practice/closed_by_name for sold territories to any '
  'internal user, exposing NO prospects/internal_users row and NO addressable/census/'
  'boundary column. Gated on internal_users membership; EXECUTE to authenticated only, '
  'never anon.';

-- ── 5. RLS: replace internal_users_all with exec_all + rep_read (siloed) ──────
-- internal_users_all granted FULL access to ANY internal user (rep included) — the
-- rep-siloing gap this sprint closes. Replace with an executive FOR ALL policy
-- (mirrors prospects.exec_all) and a rep FOR SELECT policy whose row visibility is:
--   • unclaimed/available (prospect_id IS NULL) — every rep may see what's sellable
--   • the rep's OWN rows (any status) via prospect_id → prospects.assigned_rep_id
-- Every OTHER rep's in-flight AND sold rows are ABSENT from the base table for a
-- rep — no addressable/census can leak through ANY base-table read path (index,
-- detail, future). The "all reps see sold minimally" requirement is served solely
-- by territory_sold_summary() above.
--
-- E-0a FAILURE-MODE GUARD (do not remove): rep_read independently re-establishes
-- designation='rep' via an EXISTS on internal_users — it never authorizes on a
-- prospect_id/uid match alone. A uid that merely matches assigned_rep_id is NOT
-- proof the caller is a rep (the exact hole hardened in 20260713163000 for
-- prospects.rep_read_own).
drop policy if exists internal_users_all on public.territories;
drop policy if exists exec_all on public.territories;
drop policy if exists rep_read on public.territories;

create policy exec_all
  on public.territories
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  )
  with check (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

create policy rep_read
  on public.territories
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'rep'
    )
    and status is distinct from 'draft'
    and (
      prospect_id is null
      or exists (
        select 1 from public.prospects p
        where p.id = territories.prospect_id
          and p.assigned_rep_id = (select auth.uid())
      )
    )
  );
