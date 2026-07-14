-- ─────────────────────────────────────────────────────────────────────────────
-- E-1 follow-up #2 — remove close_months disclosure from scoreboard_summary().
--
-- ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP (kjweckggegifjmmqccul) never touched.
--
-- SUPERSEDES the scoreboard_summary() shape shipped in 20260714150000. Second,
-- distinct Second-Opinion Gate finding on the same function (NOT the funded_won_at
-- forgery fix in 20260714153000 — that one is resolved).
--
-- FINDING: the original scoreboard_summary() returned raw `close_months text[]`.
-- Because the function is membership-gated to ANY internal user, every rep saw every
-- OTHER rep's month array. For a low-volume rep (1–2 closes) the exact month array
-- discloses WHEN that rep's individual deal(s) closed — peer-to-peer deal-timing
-- disclosure, not an aggregate figure, on a surface that is supposed to be minimal.
-- The leaderboard only needs a streak NUMBER.
--
-- FIX: compute current_streak IN SQL (gaps-and-islands over close-months) and return
-- it in place of close_months. No month-level detail leaves the function anymore.
-- Returned shape is now:
--   rep_id, rep_name, deals_closed_count, active_pipeline_count,
--   proposal_engagement_score, current_streak
-- (pipeline_value is still computed in TS from active_pipeline_count × the single-
-- source TERRITORY_STANDARD_PRICE — that deviation is sound, SQL can't import the TS
-- constant, and is unaffected by this fix.)
--
-- current_streak = the number of CONSECUTIVE calendar months, walking back from and
-- including the CURRENT month (UTC), in which the rep had >= 1 close. The run must be
-- anchored at the current month: a rep with no close this month has streak 0. The TS
-- computeCurrentStreak() is retained ONLY as a test-only reference implementation of
-- this same semantics (it is no longer called by any live path); the live adversarial
-- rolled-back proof is the source of truth for the SQL behaviour.
--
-- The return shape changes (close_months → current_streak), so the function must be
-- DROPPED and recreated — `create or replace` cannot alter OUT parameters. Dropping
-- clears the old grants, so the revoke/grant is restated below (the function fully
-- specifies its own security posture). get_advisors is unchanged: the function stays
-- in the accepted authenticated_security_definer class, never anon.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.scoreboard_summary();

create function public.scoreboard_summary()
returns table (
  rep_id                     uuid,
  rep_name                   text,
  deals_closed_count         integer,
  active_pipeline_count      integer,
  proposal_engagement_score  integer,
  current_streak             integer
)
language sql
security definer
set search_path = ''
as $$
  with reps as (
    -- Membership gate: non-internal caller (auth.uid() not in internal_users) → the
    -- EXISTS is false, reps is empty, the function returns zero rows (fail closed).
    select iu.user_id, iu.full_name
    from public.internal_users iu
    where iu.designation = 'rep'
      and exists (
        select 1 from public.internal_users me where me.user_id = auth.uid()
      )
  ),
  closed as (
    select p.assigned_rep_id as rid, count(*)::int as cnt
    from public.prospects p
    where p.funded_won_at is not null
      and p.assigned_rep_id is not null
    group by p.assigned_rep_id
  ),
  pipeline as (
    select p.assigned_rep_id as rid, count(*)::int as cnt
    from public.prospects p
    where p.deal_status = 'active'
      and p.funded_won_at is null
      and p.assigned_rep_id is not null
    group by p.assigned_rep_id
  ),
  engagement as (
    select p.assigned_rep_id as rid, count(*)::int as cnt
    from public.proposal_events ev
    join public.prospects p on p.id = ev.prospect_id
    where p.assigned_rep_id is not null
    group by p.assigned_rep_id
  ),
  -- ── current_streak, computed IN SQL — no month array leaves the function ──────
  -- Current calendar month as a 0-based ordinal (year*12 + month-1), UTC-bucketed.
  cur as (
    select (extract(year from (now() at time zone 'UTC'))::int * 12
            + extract(month from (now() at time zone 'UTC'))::int - 1) as mi
  ),
  -- Distinct close-months per rep as the same ordinal; only months <= the current
  -- month matter (a future-dated close can't extend a "walking back from now" streak).
  close_mi_all as (
    select distinct
      p.assigned_rep_id as rid,
      (extract(year from (p.funded_won_at at time zone 'UTC'))::int * 12
       + extract(month from (p.funded_won_at at time zone 'UTC'))::int - 1) as mi
    from public.prospects p
    where p.funded_won_at is not null
      and p.assigned_rep_id is not null
  ),
  close_mi as (
    select cm.rid, cm.mi
    from close_mi_all cm, cur
    where cm.mi <= cur.mi
  ),
  -- Gaps-and-islands: consecutive months share (mi - row_number()) as a group key.
  islands as (
    select rid, mi,
      mi - row_number() over (partition by rid order by mi) as g
    from close_mi
  ),
  -- The island group that contains the CURRENT month, per rep (only reps who closed
  -- this month qualify). Its member count = consecutive months ending at now = streak.
  anchor as (
    select i.rid, i.g
    from islands i, cur
    where i.mi = cur.mi
  ),
  streaks as (
    select i.rid, count(*)::int as streak
    from islands i
    join anchor a on a.rid = i.rid and a.g = i.g
    group by i.rid
  )
  select
    r.user_id                                              as rep_id,
    coalesce(nullif(btrim(r.full_name), ''), 'Unnamed rep') as rep_name,
    coalesce(c.cnt, 0)                                     as deals_closed_count,
    coalesce(pl.cnt, 0)                                    as active_pipeline_count,
    coalesce(e.cnt, 0)                                     as proposal_engagement_score,
    coalesce(s.streak, 0)                                 as current_streak
  from reps r
  left join closed c     on c.rid = r.user_id
  left join pipeline pl  on pl.rid = r.user_id
  left join engagement e on e.rid = r.user_id
  left join streaks s    on s.rid = r.user_id
  order by deals_closed_count desc, rep_name asc;
$$;

revoke all on function public.scoreboard_summary() from public, anon, authenticated;
grant execute on function public.scoreboard_summary() to authenticated;

comment on function public.scoreboard_summary() is
  'Aggregate rep leaderboard (E-1; close_months removed by follow-up #2). SECURITY '
  'DEFINER, search_path pinned, gated on internal_users membership; EXECUTE to '
  'authenticated only, never anon. ONE row per rep of aggregate figures ONLY — deal '
  'count, active-pipeline count, proposal-engagement count, and current_streak (an '
  'integer computed in SQL). Returns NO month-level detail, NO individual prospect '
  'identity, NO territory geometry, NO addressable/census. Parameterless (no narrowing '
  'input). Attribution by assigned_rep_id; closes defined by funded_won_at. '
  'pipeline_value (× $179K) is computed in TS from active_pipeline_count.';
