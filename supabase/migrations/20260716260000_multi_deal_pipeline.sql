-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-Deal Pipeline Architecture — un-deprecate deals.stage, derive
-- prospects.stage, and open the (governed) repeat-customer deal-creation path.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
--
-- Partially revises decision #53 item (A) ("deals demoted to Territory Agreement
-- record, deals.stage DEPRECATED") — the same partial-revision pattern #110 applied
-- to #53's skipped_triage portion. Confirmed by Trace 2026-07-16; supersedes the
-- PR #139 Round 4 deferral of multi-deal UX. Coder never writes ops.decision_log —
-- the completion entry is Chat's at phase close.
--
-- WHY (brief §1): GHMD has real multi-territory repeat customers. Customer-level
-- prospects.stage cannot represent two independent negotiations; PR #139 Round 4
-- fixed the revenue counting but deferred the model. deals.stage becomes the
-- authoritative per-territory pipeline position; prospects.stage becomes a
-- DERIVED, trigger-maintained customer-level roll-up (MAX over non-lost deals).
--
-- SECTION ORDER IS LOAD-BEARING. The backfill (§4) runs BEFORE the deal-close
-- trigger (§10) exists: all 23 legacy Funded/Won prospects have funded_won_at
-- NULL (verified live 2026-07-16), so their deals' stage 1→11 backfill crossing
-- WOULD satisfy the close trigger's WHEN clause and false-stamp 23 close dates
-- with today's timestamp + re-mark territories sold. Backfill first, triggers
-- after.
--
-- Contents:
--   §1  deals.stage un-deprecation (comment + 1..12 domain CHECK)
--   §2  deals.deal_status (active|stalled|lost) — brief §3 scope extension; NOT
--       optional: the MAX-excluding-lost derivation needs a per-deal lost marker
--   §3  deals.funded_won_at (per-deal close stamp; prospect-level stays)
--   §4  lossless backfill: stage/deal_status/funded_won_at from the parent
--       prospect (28 rows, all single-deal prospects — verified live, brief §1)
--   §5  recompute_prospect_pipeline(): the derivation trigger on deals
--   §6  prospects stage-derivation guard (direct stage writes rejected while a
--       non-lost deal exists; GUC escape hatch for §5 / break-glass)
--   §7  ensure_priced_deal() + set_deal_price(): first-deal inserts INHERIT the
--       prospect's stage/deal_status (a default stage-1 insert would drag a
--       stage-10 prospect back to 1 through §5)
--   §8  create_territory_deal(): the ONLY rep-facing deal-creation path (brief §4)
--   §9  move_deal_stage(): exec-gated stage movement, qualification hard gate
--       enforced IN the database
--   §10 stamp_deal_funded_won(): per-deal close trigger (territory sold marking
--       via deals.territory_id — the authoritative link)
--   §11 set_customer_deal_status() / set_deal_status(): governed status writes
--   §12 revoke authenticated UPDATE on deals (pre-existing dormant surface that
--       §5 would weaponize — Round 5/8 class, closed before it goes live)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Un-deprecate deals.stage ───────────────────────────────────────────────
-- Same 1-based domain as PIPELINE_STAGES / STAGE.* in src/lib/pipeline-stages.ts
-- (1 = STAGE.NEW_LEAD .. 12 = STAGE.IMPLEMENTATION_HANDOFF_SCHEDULED). SQL cannot
-- import the TS constants; the literals here are pinned by
-- multi-deal-pipeline.test.ts (the e0b idiom).
comment on column public.deals.stage is
  'AUTHORITATIVE per-territory pipeline position (1–12, = STAGE.* in '
  'src/lib/pipeline-stages.ts). Un-deprecated 2026-07-16 (partial revision of '
  'decision #53 item A): with multi-territory repeat customers, each deal carries '
  'its own stage; prospects.stage is DERIVED from these rows (MAX over non-lost '
  'deals) by recompute_prospect_pipeline(). Client UPDATE is revoked — movement '
  'goes through move_deal_stage() only.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deals'::regclass and conname = 'deals_stage_domain_check'
  ) then
    alter table public.deals
      add constraint deals_stage_domain_check check (stage between 1 and 12);
  end if;
end $$;

-- ── 2. deals.deal_status ──────────────────────────────────────────────────────
-- Brief §3 scope extension, included deliberately: leaving deal_status singular
-- on prospects while stage moves to deals recreates the same "customer-level
-- field can't represent two independent deals" problem one level down — and the
-- stage derivation itself needs a per-deal lost marker to exclude. Domain
-- mirrors prospects_deal_status_check exactly (DEAL_STATUSES, pipeline-stages.ts).
alter table public.deals
  add column if not exists deal_status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deals'::regclass and conname = 'deals_deal_status_check'
  ) then
    alter table public.deals
      add constraint deals_deal_status_check
      check (deal_status in ('active', 'stalled', 'lost'));
  end if;
end $$;

comment on column public.deals.deal_status is
  'Per-deal health (active|stalled|lost), mirrors DEAL_STATUSES in '
  'src/lib/pipeline-stages.ts. prospects.deal_status is DERIVED from these rows by '
  'recompute_prospect_pipeline(): any non-lost active → active; non-lost exist but '
  'none active → stalled; deals exist and all lost → lost. Lost deals are excluded '
  'from the prospects.stage MAX. Client UPDATE revoked — writes go through '
  'set_deal_status()/set_customer_deal_status().';

-- ── 3. deals.funded_won_at ────────────────────────────────────────────────────
-- Per-deal close stamp (deal-history panel needs a close date PER territory; a
-- repeat customer''s prospects.funded_won_at only records the FIRST close).
-- Stamped by stamp_deal_funded_won() (§10) on the deal''s own 11-crossing.
alter table public.deals
  add column if not exists funded_won_at timestamptz;

comment on column public.deals.funded_won_at is
  'Per-deal close stamp, set once by stamp_deal_funded_won() on the deal''s first '
  'crossing into Funded/Won (stage >= 11 = STAGE.FUNDED_WON). The prospect-level '
  'prospects.funded_won_at (first close, E-1 bell/scoreboard signal) is unchanged '
  'and still stamped by stamp_prospect_funded_won(). NULL until this deal closes. '
  'NULL on the 23 legacy backfilled won deals (their prospects.funded_won_at is '
  'also NULL — close date genuinely unknown).';

-- ── 4. Lossless backfill (brief §2 — exact, not fuzzy) ────────────────────────
-- Every one of the 28 existing deals is its prospect''s ONLY deal (verified live
-- 2026-07-16: 0 multi-deal prospects), so the linked prospect''s CURRENT stage /
-- deal_status / funded_won_at transfer losslessly. Deliberately NOT reconstructed
-- from proposal_sent_at / signed_at (brief §2). Runs BEFORE §5/§10 triggers exist
-- (see header). The Round-1 validate_deal_discount_authorization trigger does fire
-- here but short-circuits (discount_authorized_by unchanged).
update public.deals d
set stage         = p.stage,
    deal_status   = p.deal_status,
    funded_won_at = case when p.stage >= 11 then p.funded_won_at else null end
from public.prospects p
where p.id = d.prospect_id;

-- ── 5. Derivation: recompute_prospect_pipeline() ──────────────────────────────
-- prospects.stage / prospects.deal_status become trigger-maintained roll-ups the
-- moment a prospect has deals (brief §3 — trigger-maintained, NOT computed-on-read,
-- so every existing consumer of prospects.stage keeps working untouched):
--   stage       = MAX(deals.stage) over this prospect''s NON-LOST deals
--   deal_status = any non-lost active → 'active'; non-lost exist, none active →
--                 'stalled'; deals exist, all lost → 'lost'
-- A prospect with NO deals keeps direct-write semantics (nothing to derive from);
-- if every deal is lost, stage FREEZES at its last value (MAX over an empty set
-- must never null/zero a stage) and status derives to 'lost'.
--
-- The prospects UPDATE below fires the existing prospects triggers naturally —
-- that is the point: stamp_prospect_funded_won() still stamps the FIRST 11-crossing
-- and the E-1 bell still rings off funded_won_at, with zero changes to either.
-- stage_updated_at is stamped only when stage actually changes (days-in-stage math).
--
-- SECURITY DEFINER: the writer of a deals row (e.g. a rep through
-- create_territory_deal) has no prospects UPDATE privilege; the derivation must
-- succeed regardless of the acting principal. search_path pinned empty.
--
-- GUC handshake: sets ghmd.stage_recompute = '1' (transaction-local) around its
-- prospects write so the §6 guard recognizes the ONE legitimate deriver; reset to
-- '0' immediately after so a later statement in the same transaction gets no free
-- pass.
create or replace function public.recompute_prospect_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prospect_id uuid;
begin
  -- On UPDATE the deal may have been re-parented (service-role only today);
  -- recompute BOTH sides so no prospect is left with a stale roll-up.
  if tg_op = 'DELETE' then
    v_prospect_id := old.prospect_id;
  else
    v_prospect_id := new.prospect_id;
  end if;

  perform public.recompute_prospect_pipeline_for(v_prospect_id);

  if tg_op = 'UPDATE' and old.prospect_id is distinct from new.prospect_id then
    perform public.recompute_prospect_pipeline_for(old.prospect_id);
  end if;

  return null; -- AFTER trigger
end;
$$;

create or replace function public.recompute_prospect_pipeline_for(p_prospect_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage  integer;
  v_status text;
  v_n      integer;
begin
  select
    max(d.stage) filter (where d.deal_status <> 'lost'),
    case
      when count(*) filter (where d.deal_status = 'active') > 0 then 'active'
      when count(*) filter (where d.deal_status <> 'lost')  > 0 then 'stalled'
      else 'lost'
    end,
    count(*)
  into v_stage, v_status, v_n
  from public.deals d
  where d.prospect_id = p_prospect_id;

  if v_n = 0 then
    return; -- no deals: prospects keeps direct-write semantics, nothing to derive
  end if;

  -- All deals lost → stage freezes at its last value; only status derives.
  perform set_config('ghmd.stage_recompute', '1', true);

  update public.prospects p
  set stage            = coalesce(v_stage, p.stage),
      stage_updated_at = case
        when coalesce(v_stage, p.stage) is distinct from p.stage then now()
        else p.stage_updated_at
      end,
      deal_status      = v_status
  where p.id = p_prospect_id
    and (coalesce(v_stage, p.stage) is distinct from p.stage
         or v_status is distinct from p.deal_status);

  perform set_config('ghmd.stage_recompute', '0', true);
end;
$$;

comment on function public.recompute_prospect_pipeline() is
  'AFTER INSERT/UPDATE/DELETE trigger on deals: re-derives the parent prospect''s '
  'customer-level roll-up (prospects.stage = MAX stage over non-lost deals; '
  'deal_status = active > stalled > lost precedence) via '
  'recompute_prospect_pipeline_for(). Recomputes both parents on a re-parenting '
  'UPDATE. SECURITY DEFINER (deal writers have no prospects UPDATE privilege); '
  'sets the ghmd.stage_recompute GUC so the prospects stage-derivation guard '
  'admits exactly this writer.';

comment on function public.recompute_prospect_pipeline_for(uuid) is
  'Derivation worker for recompute_prospect_pipeline() (see there). No-op for a '
  'prospect with zero deals; freezes stage when every deal is lost. Stamps '
  'stage_updated_at only on a genuine stage change. SECURITY DEFINER, '
  'search_path pinned, not client-callable.';

-- Trigger functions must never be PostgREST-callable (E-2 discipline): revoking
-- EXECUTE has zero effect on trigger firing. The _for worker is DEFINER and writes
-- prospects, so it must be equally unreachable.
revoke all on function public.recompute_prospect_pipeline() from public, anon, authenticated;
revoke all on function public.recompute_prospect_pipeline_for(uuid) from public, anon, authenticated;

drop trigger if exists deals_recompute_prospect_pipeline on public.deals;
create trigger deals_recompute_prospect_pipeline
  after insert or update of stage, deal_status, prospect_id or delete on public.deals
  for each row
  execute function public.recompute_prospect_pipeline();

-- ── 6. prospects stage-derivation guard ───────────────────────────────────────
-- Makes "derived" enforced rather than aspirational: once a prospect has a
-- non-lost deal, a DIRECT prospects.stage write (raw PostgREST as an exec, a
-- legacy code path, a future regression) is rejected — it would silently diverge
-- from the deal set and be clobbered by the next recompute. The ONE legitimate
-- writer is §5''s recompute (GUC handshake). Deal-less prospects are untouched:
-- moveProspectStage still direct-writes their stage exactly as today.
--
-- Break-glass: a postgres-role operator can set the same transaction-local GUC
-- (select set_config('ghmd.stage_recompute','1',true)) — the sold_boundary_geom
-- freeze precedent (decision #126 class). service_role bypasses RLS/grants but
-- NOT this trigger, deliberately.
--
-- Trigger-order note: 'prospects_stage_derivation_guard' sorts BEFORE
-- 'prospects_stamp_funded_won' (both BEFORE UPDATE OF stage; PostgreSQL fires
-- same-event triggers in name order), so an illegitimate stage write is rejected
-- before any close stamping runs.
create or replace function public.guard_prospect_stage_derivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('ghmd.stage_recompute', true), '0') = '1' then
    return new;
  end if;

  if exists (
    select 1 from public.deals d
    where d.prospect_id = new.id
      and d.deal_status <> 'lost'
  ) then
    raise exception
      'prospects.stage is derived from deals for prospect % (non-lost deals exist). Move the deal via move_deal_stage() instead of writing prospects.stage directly.',
      new.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.guard_prospect_stage_derivation() is
  'BEFORE UPDATE OF stage on prospects: rejects direct stage writes for a prospect '
  'holding any non-lost deal — prospects.stage is derived (MAX over non-lost '
  'deals.stage) and a direct write would silently diverge until the next recompute '
  'clobbered it. Admits recompute_prospect_pipeline_for() via the transaction-local '
  'ghmd.stage_recompute GUC (also the documented postgres-role break-glass). '
  'Deal-less prospects pass through unchanged.';

revoke all on function public.guard_prospect_stage_derivation() from public, anon, authenticated;

drop trigger if exists prospects_stage_derivation_guard on public.prospects;
create trigger prospects_stage_derivation_guard
  before update of stage on public.prospects
  for each row
  when (old.stage is distinct from new.stage)
  execute function public.guard_prospect_stage_derivation();

-- ── 7. First-deal inserts INHERIT the prospect's position ─────────────────────
-- With §5 live, an insert at the column default (stage 1) would DRAG the parent
-- prospect back to stage 1 through the derivation — e.g. the standard-price
-- backstop firing during a stage-10 close would briefly commit the customer to
-- New Lead. The first deal for an in-flight prospect IS the existing negotiation
-- being given a territory record, so it inherits stage AND deal_status — the
-- exact same lossless rule as §4''s backfill. (Deals created for a prospect that
-- already has deals are NEW negotiations and start at stage 1 — that path is
-- create_territory_deal, §8.)
--
-- ensure_priced_deal: body identical to 20260716220000 (Round 8, SECURITY
-- DEFINER) except the insert now carries stage/deal_status from the prospect.
-- Lock, zero-deal guard, grants: unchanged.
create or replace function public.ensure_priced_deal(p_prospect_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal_id uuid;
begin
  perform 1 from public.prospects where id = p_prospect_id for update;

  select id into v_deal_id
  from public.deals
  where prospect_id = p_prospect_id
  limit 1;

  if v_deal_id is null then
    insert into public.deals (prospect_id, territory_price, stage, deal_status)
    select p.id, 179000, p.stage, p.deal_status
    from public.prospects p
    where p.id = p_prospect_id
    returning id into v_deal_id;
  end if;

  return v_deal_id;
end;
$$;

comment on function public.ensure_priced_deal(uuid) is
  'Atomically guarantees a priced deals row exists for a prospect (§4D Round 6; '
  'SECURITY DEFINER since Round 8). Locks the prospect row FOR UPDATE, then '
  'check-and-inserts a $179,000 standard-price deal only if none exists. The '
  'insert INHERITS the prospect''s stage and deal_status (multi-deal build): a '
  'default stage-1 insert would drag the prospect back to New Lead through the '
  'derivation trigger. Never overwrites an existing deal.';

revoke all on function public.ensure_priced_deal(uuid) from public, anon;
grant execute on function public.ensure_priced_deal(uuid) to authenticated;

-- set_deal_price: body identical to 20260716200000 (Round 7) except the 0-deal
-- insert inherits stage/deal_status (same reasoning). Lock, 0/1/≥2 branch,
-- service_role-only EXECUTE: unchanged.
create or replace function public.set_deal_price(
  p_prospect_id            uuid,
  p_territory_price        numeric,
  p_discount_reason        text,
  p_discount_authorized_by uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  perform 1 from public.prospects where id = p_prospect_id for update;

  select array_agg(id order by created_at asc) into v_ids
  from public.deals
  where prospect_id = p_prospect_id;

  if v_ids is null then
    insert into public.deals (prospect_id, territory_price, discount_reason, discount_authorized_by, stage, deal_status)
    select p.id, p_territory_price, p_discount_reason, p_discount_authorized_by, p.stage, p.deal_status
    from public.prospects p
    where p.id = p_prospect_id;
    return 'inserted';
  elsif array_length(v_ids, 1) = 1 then
    update public.deals
      set territory_price        = p_territory_price,
          discount_reason        = p_discount_reason,
          discount_authorized_by = p_discount_authorized_by
      where id = v_ids[1];
    return 'updated';
  else
    return 'multiple';
  end if;
end;
$$;

comment on function public.set_deal_price(uuid, numeric, text, uuid) is
  'Atomic deal price/discount write for setTerritoryPrice (§4D Round 7). Locks the '
  'prospect row FOR UPDATE (same target as ensure_priced_deal — the two serialize). '
  '0→insert (INHERITING the prospect''s stage/deal_status — multi-deal build) / '
  '1→update / ≥2→''multiple'' unchanged. SECURITY DEFINER; EXECUTE service_role '
  'only — the sole caller is the authorization-gated setTerritoryPrice action. '
  'validate_deal_discount_authorization() still fires on its writes.';

revoke all on function public.set_deal_price(uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.set_deal_price(uuid, numeric, text, uuid) to service_role;

-- ── 8. create_territory_deal() — the governed repeat-customer path (brief §4) ──
-- HARD CONSTRAINT carried from PR #139 Round 8: NO blanket authenticated INSERT
-- grant returns to deals. This narrowly-scoped SECURITY DEFINER function is the
-- ONLY client path that creates a deal for an existing prospect. Rules:
--   • caller must be the prospect''s assigned_rep_id (designation ''rep''
--     re-established independently — the E-0a failure-mode guard) OR an executive;
--   • the target territory must exist and be status = 'available': 'sold' is the
--     brief''s hard block, and 'draft'/NULL are rejected too (fail-closed — the
--     picker excludes drafts, and Hard Rule 10 says a missing button is not a
--     security control, so the function enforces what the UI implies);
--   • inserts at list price ($179,000); discount fields stay NULL — discount
--     entry remains the exec-authorized setTerritoryPrice path, unchanged;
--   • stage: FIRST deal inherits the prospect''s stage/deal_status (§7 rule);
--     a SUBSEQUENT deal starts at stage 1 / active — a new territory negotiation
--     runs its own qualification/proposal/funding/contract gates (brief §2);
--   • locks the prospect row FOR UPDATE — the SAME lock target as
--     ensure_priced_deal/set_deal_price, so first-deal creation serializes with
--     the close backstop and the price path (no duplicate-first-deal race);
--   • locks the territory row FOR UPDATE so a concurrent close marking it sold
--     serializes with the availability check.
create or replace function public.create_territory_deal(
  p_prospect_id  uuid,
  p_territory_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid              uuid;
  v_is_exec          boolean;
  v_is_assigned_rep  boolean;
  v_prospect_stage   integer;
  v_prospect_status  text;
  v_has_deals        boolean;
  v_territory_status text;
  v_deal_id          uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  -- Identity: executive, or the prospect's assigned rep with designation 'rep'
  -- re-established independently (never authorize on the uid match alone — E-0a).
  select exists (
    select 1 from public.internal_users iu
    where iu.user_id = v_uid and iu.designation = 'executive'
  ) into v_is_exec;

  select exists (
    select 1
    from public.internal_users iu
    join public.prospects p on p.assigned_rep_id = iu.user_id
    where iu.user_id = v_uid
      and iu.designation = 'rep'
      and p.id = p_prospect_id
  ) into v_is_assigned_rep;

  if not (v_is_exec or v_is_assigned_rep) then
    raise exception
      'Only the prospect''s assigned rep or an executive can add a territory deal.'
      using errcode = '42501';
  end if;

  -- Lock the prospect (serializes with ensure_priced_deal / set_deal_price) and
  -- read the inherit-values inside the locked window.
  select p.stage, p.deal_status into v_prospect_stage, v_prospect_status
  from public.prospects p
  where p.id = p_prospect_id
  for update;
  if not found then
    raise exception 'Prospect % not found.', p_prospect_id using errcode = 'P0002';
  end if;

  -- Lock the territory and enforce availability (fail-closed).
  select t.status into v_territory_status
  from public.territories t
  where t.id = p_territory_id
  for update;
  if not found then
    raise exception 'Territory % not found.', p_territory_id using errcode = 'P0002';
  end if;
  if v_territory_status = 'sold' then
    raise exception 'Territory % is already sold.', p_territory_id using errcode = '23514';
  end if;
  if v_territory_status is distinct from 'available' then
    raise exception
      'Territory % is not available (status: %).', p_territory_id, coalesce(v_territory_status, 'NULL')
      using errcode = '23514';
  end if;

  select exists (select 1 from public.deals d where d.prospect_id = p_prospect_id)
    into v_has_deals;

  insert into public.deals (prospect_id, territory_id, territory_price, stage, deal_status)
  values (
    p_prospect_id,
    p_territory_id,
    179000,
    case when v_has_deals then 1 else v_prospect_stage end,
    case when v_has_deals then 'active' else v_prospect_status end
  )
  returning id into v_deal_id;

  return v_deal_id;
end;
$$;

comment on function public.create_territory_deal(uuid, uuid) is
  'The ONLY client path that creates a deals row for an existing prospect '
  '(multi-deal build, brief §4; the Round-8 INSERT revoke stands). SECURITY '
  'DEFINER: caller must be the prospect''s assigned rep (designation re-checked) '
  'or an executive; territory must be status=''available'' (sold hard-blocked, '
  'draft/NULL fail closed); inserts at $179,000 list with NULL discount fields; '
  'first deal inherits the prospect''s stage/deal_status, subsequent deals start '
  'at stage 1/active (a new negotiation runs its own gates). Locks the prospect '
  'row (serializes with ensure_priced_deal/set_deal_price) and the territory row '
  '(serializes with a concurrent close).';

revoke all on function public.create_territory_deal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_territory_deal(uuid, uuid) to authenticated;

-- ── 9. move_deal_stage() — governed stage movement ────────────────────────────
-- With §12 revoking client UPDATE on deals, this is the only client path that
-- moves a deal''s stage. Executive-only: stage movement is ALREADY effectively
-- exec-only today (prospects has no rep UPDATE policy — a rep''s board drag
-- silently no-ops), so this preserves the standing posture while making it
-- explicit. The qualification HARD gate (decision #110) moves INTO the database
-- for this path: crossing from below Qualification Review (stage < 6 =
-- STAGE.PROPOSAL_SENT) to at-or-past it requires the prospect''s
-- qualification_reviews.recommendation = 'proceed' — previously app-layer only.
-- The funding pre-qual SOFT gate (confirm + flag) stays app-side by design: a
-- confirm dialog is an interaction, not a data rule.
create or replace function public.move_deal_stage(
  p_deal_id      uuid,
  p_target_stage integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid;
  v_prospect_id  uuid;
  v_deal_stage   integer;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.internal_users iu
    where iu.user_id = v_uid and iu.designation = 'executive'
  ) then
    raise exception 'Only executives can move deal stages.' using errcode = '42501';
  end if;

  if p_target_stage is null or p_target_stage < 1 or p_target_stage > 12 then
    raise exception 'Invalid stage %.', p_target_stage using errcode = '23514';
  end if;

  select d.prospect_id, d.stage into v_prospect_id, v_deal_stage
  from public.deals d
  where d.id = p_deal_id;
  if v_prospect_id is null then
    raise exception 'Deal % not found.', p_deal_id using errcode = 'P0002';
  end if;

  -- Serialize with every other deal-writing function (same lock target).
  perform 1 from public.prospects where id = v_prospect_id for update;

  -- Re-read the deal''s stage inside the locked window (it may have moved while
  -- we waited on the lock).
  select d.stage into v_deal_stage from public.deals d where d.id = p_deal_id;

  -- Qualification HARD gate, PER DEAL (brief §2: a new negotiation runs its own
  -- gates), against the prospect-level review record — per-deal qualification
  -- reviews do not exist in the schema (flagged in the PR body, not silently
  -- invented). 6 = STAGE.PROPOSAL_SENT (pinned by multi-deal-pipeline.test.ts).
  if v_deal_stage < 6 and p_target_stage >= 6 then
    if not exists (
      select 1 from public.qualification_reviews qr
      where qr.prospect_id = v_prospect_id
        and qr.recommendation = 'proceed'
    ) then
      raise exception
        'Qualification Review must be cleared with a ''Proceed'' recommendation before this deal can advance past it.'
        using errcode = '23514';
    end if;
  end if;

  update public.deals set stage = p_target_stage where id = p_deal_id;
end;
$$;

comment on function public.move_deal_stage(uuid, integer) is
  'The only client path that moves deals.stage (client UPDATE on deals is revoked). '
  'SECURITY DEFINER, executive-only — stage movement was already effectively '
  'exec-only (reps have no prospects UPDATE policy). Validates the 1–12 domain, '
  'locks the prospect row (serializing with ensure_priced_deal / set_deal_price / '
  'create_territory_deal), and enforces the qualification HARD gate (decision #110) '
  'in-database on the deal''s own below-6 → 6+ crossing (6 = STAGE.PROPOSAL_SENT). '
  'The soft funding pre-qual confirm stays app-side. Downstream: the deal-close '
  'trigger stamps funded_won_at / marks the territory sold on an 11-crossing, and '
  'the recompute trigger re-derives the prospect roll-up.';

revoke all on function public.move_deal_stage(uuid, integer) from public, anon, authenticated;
grant execute on function public.move_deal_stage(uuid, integer) to authenticated;

-- ── 10. stamp_deal_funded_won() — per-deal close ──────────────────────────────
-- The prospect-level stamp_prospect_funded_won() fires only on the prospect''s
-- FIRST 11-crossing (funded_won_at IS NULL guard) and marks territories linked
-- via territories.prospect_id. A repeat customer''s SECOND close never re-fires
-- it — so the second deal''s territory would never be marked sold. This trigger
-- closes that per-deal: on a deal''s own 11-crossing it stamps
-- deals.funded_won_at and marks the deal''s OWN territory (deals.territory_id —
-- the authoritative link) sold, stamping territories.prospect_id to the winning
-- prospect so territory_sold_summary() attribution keeps working.
--
-- Created AFTER §4''s backfill on purpose (see header): the backfill''s 1→11
-- transitions must not stamp 23 legacy closes with today''s date.
--
-- KNOWN RESIDUAL (flagged, not silently fixed): the E-1 bell rings off
-- prospects.funded_won_at''s NULL→non-NULL transition, so a SECOND close does not
-- ring the bell. Deliberately out of scope — the bell trigger chain was hardened
-- across multiple E-2 gate rounds and is not casually re-entered here.
create or replace function public.stamp_deal_funded_won()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rep uuid;
begin
  new.funded_won_at := now();

  if new.territory_id is not null then
    select p.assigned_rep_id into v_rep
    from public.prospects p
    where p.id = new.prospect_id;

    update public.territories t
    set status      = 'sold',
        prospect_id = new.prospect_id,
        sold_by     = v_rep,
        sold_at     = new.funded_won_at
    where t.id = new.territory_id
      and coalesce(t.qa_locked, false) = false;
  end if;

  return new;
end;
$$;

comment on function public.stamp_deal_funded_won() is
  'BEFORE UPDATE OF stage on deals, WHEN old.stage < 11 and new.stage >= 11 and '
  'new.funded_won_at is null (11 = STAGE.FUNDED_WON, pinned by test): stamps the '
  'per-deal close date and marks the deal''s own territory (deals.territory_id) '
  'sold — status/sold_by/sold_at/prospect_id — excluding qa_locked rows (guard '
  'cooperation). Complements stamp_prospect_funded_won(), which only fires on the '
  'prospect''s FIRST close and only covers territories.prospect_id links. '
  'SECURITY DEFINER (the mover has no territories UPDATE privilege). Idempotent '
  'via the funded_won_at IS NULL guard.';

revoke all on function public.stamp_deal_funded_won() from public, anon, authenticated;

drop trigger if exists deals_stamp_funded_won on public.deals;
create trigger deals_stamp_funded_won
  before update of stage on public.deals
  for each row
  when (
    old.stage < 11
    and new.stage >= 11
    and new.funded_won_at is null
  )
  execute function public.stamp_deal_funded_won();

-- ── 11. Governed deal_status writes ───────────────────────────────────────────
-- DealStatusSelector currently client-updates prospects.deal_status directly.
-- With §5 deriving that column, the direct write would be clobbered by the next
-- deals write — so status changes route through these functions instead.
-- Executive-only: the selector was already effectively exec-only (reps'
-- prospects UPDATE silently no-ops today — same posture argument as §9).
--
-- set_customer_deal_status: the customer-level selector. No deals → direct
-- prospects write (nothing to derive from). Deals exist → applies to every
-- NON-LOST deal (marking a customer active never resurrects lost deals; marking
-- lost loses every open negotiation), then §5 re-derives the roll-up. A customer
-- whose every deal is lost stays 'lost' until a new deal exists — un-losing is
-- adding a new territory negotiation, not flipping a flag.
create or replace function public.set_customer_deal_status(
  p_prospect_id uuid,
  p_status      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid;
  v_has_deals boolean;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.internal_users iu
    where iu.user_id = v_uid and iu.designation = 'executive'
  ) then
    raise exception 'Only executives can change deal status.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'stalled', 'lost') then
    raise exception 'Invalid deal_status %.', p_status using errcode = '23514';
  end if;

  perform 1 from public.prospects where id = p_prospect_id for update;
  if not found then
    raise exception 'Prospect % not found.', p_prospect_id using errcode = 'P0002';
  end if;

  select exists (select 1 from public.deals d where d.prospect_id = p_prospect_id)
    into v_has_deals;

  if not v_has_deals then
    update public.prospects set deal_status = p_status where id = p_prospect_id;
  else
    update public.deals
    set deal_status = p_status
    where prospect_id = p_prospect_id
      and deal_status <> 'lost'
      and deal_status is distinct from p_status;
    -- §5's trigger re-derives prospects.deal_status from the updated set.
  end if;
end;
$$;

comment on function public.set_customer_deal_status(uuid, text) is
  'Customer-level deal_status write (DealStatusSelector). Executive-only. '
  'No deals → direct prospects.deal_status write; deals exist → applies the status '
  'to every NON-LOST deal and lets the derivation trigger re-derive the roll-up. '
  'Never resurrects lost deals; a fully-lost customer un-loses only by gaining a '
  'new deal. SECURITY DEFINER (deals client UPDATE is revoked).';

revoke all on function public.set_customer_deal_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_customer_deal_status(uuid, text) to authenticated;

-- set_deal_status: the per-deal control (deal-history panel, PR-B). Same gate.
create or replace function public.set_deal_status(
  p_deal_id uuid,
  p_status  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid;
  v_prospect_id uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.internal_users iu
    where iu.user_id = v_uid and iu.designation = 'executive'
  ) then
    raise exception 'Only executives can change deal status.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'stalled', 'lost') then
    raise exception 'Invalid deal_status %.', p_status using errcode = '23514';
  end if;

  select d.prospect_id into v_prospect_id from public.deals d where d.id = p_deal_id;
  if v_prospect_id is null then
    raise exception 'Deal % not found.', p_deal_id using errcode = 'P0002';
  end if;

  perform 1 from public.prospects where id = v_prospect_id for update;

  update public.deals set deal_status = p_status where id = p_deal_id;
end;
$$;

comment on function public.set_deal_status(uuid, text) is
  'Per-deal deal_status write (deal-history panel). Executive-only, SECURITY '
  'DEFINER (deals client UPDATE is revoked). Locks the parent prospect row '
  '(standard serialization target), then writes the single deal; the derivation '
  'trigger re-derives the customer roll-up.';

revoke all on function public.set_deal_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_deal_status(uuid, text) to authenticated;

-- ── 12. Revoke authenticated UPDATE on deals ──────────────────────────────────
-- Pre-existing dormant surface, weaponized by this build if left open: Round 1
-- re-granted column-level UPDATE on most deals columns (stage, prospect_id,
-- territory_id, ...) under the ownership-free internal_users_all policy. While
-- deals.stage was deprecated that was inert; with §5 live, a raw
--     update deals set stage = 11 where id = <any deal>
-- from ANY internal user (rep included) would close any deal — firing the sold
-- marking and rolling the customer to Funded/Won — and bypass the qualification
-- gate. Audited src/**: ZERO client-side UPDATEs of deals exist (the only deal
-- writers are the DEFINER RPCs above and service_role paths), so nothing breaks.
-- Column-by-column AND table-level, the Round-8 idiom (a table-level revoke is
-- not guaranteed to retract column-level grants).
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'deals';

  execute format('revoke update (%s) on public.deals from authenticated', v_cols);
end
$$;

revoke update on public.deals from authenticated;

-- NOTE (maintenance, mirrors 20260716120000 §6): authenticated now holds NO
-- INSERT, NO UPDATE, NO DELETE on deals — only column-level SELECT (minus the
-- discount pair). Every client write goes through the SECURITY DEFINER functions
-- above. A future column the app must write via the authenticated client gets a
-- function, not a grant.
