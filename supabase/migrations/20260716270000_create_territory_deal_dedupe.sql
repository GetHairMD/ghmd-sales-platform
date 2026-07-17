-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-deal follow-up — create_territory_deal(): reject a DUPLICATE deal on the
-- same territory for the same prospect.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
--
-- GAP (found during the PR-B picker E2E design, fixed here rather than left for a
-- gate round): 20260716260000 §8 blocked sold/draft territories and enforced
-- caller identity, but nothing stopped the SAME prospect opening a SECOND deal on
-- the SAME territory — each call another stage-1 / $179,000 row. There is
-- deliberately no unique constraint on (prospect_id, territory_id) — a prospect
-- may genuinely re-approach a territory after a LOST deal — so the rule is
-- "no duplicate while a NON-LOST deal on that territory exists", which only a
-- function-level check can express.
--
-- CREATE OR REPLACE (supersede-never-edit: 20260716260000 is applied and not
-- touched). Body identical except the new duplicate guard between the
-- availability check and the insert.
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

  -- NEW (this migration): no duplicate open negotiation — the SAME prospect may
  -- not hold two NON-LOST deals on the SAME territory. A lost deal does not
  -- block a genuine re-approach. Runs inside the prospect lock, so two
  -- concurrent calls cannot both pass it.
  if exists (
    select 1 from public.deals d
    where d.prospect_id = p_prospect_id
      and d.territory_id = p_territory_id
      and d.deal_status <> 'lost'
  ) then
    raise exception
      'Prospect % already has an open deal on territory %.', p_prospect_id, p_territory_id
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
  'draft/NULL fail closed); the prospect may not already hold a NON-LOST deal on '
  'the same territory (20260716270000 — a lost deal does not block a '
  're-approach); inserts at $179,000 list with NULL discount fields; first deal '
  'inherits the prospect''s stage/deal_status, subsequent deals start at stage '
  '1/active. Locks the prospect row (serializes with ensure_priced_deal/'
  'set_deal_price) and the territory row (serializes with a concurrent close).';

-- Grants restated (CREATE OR REPLACE preserves existing ACLs, but restating makes
-- the migration self-contained and the test pins explicit).
revoke all on function public.create_territory_deal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_territory_deal(uuid, uuid) to authenticated;
