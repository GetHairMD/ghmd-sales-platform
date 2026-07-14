-- ─────────────────────────────────────────────────────────────────────────────
-- E-1 — Scoreboard + Bell Ringing (Session E, module 1; decision #159).
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Depends on E-0a (PR #124) + E-0b (PR #126), both merged to main:
--   • prospects.assigned_rep_id (uuid) — the rep-attribution column the RLS
--     policies actually key on (rep_read_own, territories.rep_read). This module
--     attributes ALL rep figures by assigned_rep_id, NOT the text assigned_rep
--     column, so the scoreboard stays consistent with the security boundary.
--     (Verified live before writing this migration: assigned_rep_id is the sole
--     column any RLS policy references; assigned_rep text is display-only.)
--   • prospects.funded_won_at — the durable "deal closed" signal E-0b built once
--     for this exact reuse. Bell Ringing keys off its NULL → non-NULL transition.
--   • stamp_prospect_funded_won() (E-0b BEFORE UPDATE OF stage trigger) — stamps
--     every associated non-locked territory sold (status/sold_by/sold_at) at the
--     first Funded/Won crossing. Bell Ringing hangs a SECOND, AFTER-timed trigger
--     off the same moment and reads the territories that trigger just stamped.
--
-- WHAT this migration does:
--   1. public.community_board_posts — the shared celebration/announcement feed
--      (table + rep-agnostic SELECT RLS for any internal user; NO client INSERT
--      path for any role, any post_type — see §2). Exists now so E-2 (Community
--      Board authoring) needs no schema migration later; nothing writes to it in
--      this PR except the bell-ringing trigger.
--   2. ring_bell_on_funded_won() — SECURITY DEFINER trigger, AFTER UPDATE on
--      prospects, fires exactly once on the funded_won_at NULL → non-NULL
--      transition and inserts one 'bell_ringing' post per territory this close
--      stamped sold (0 territories → one territory-less "closed a deal" post).
--      Rep NAME + territory NAME are INTENTIONALLY disclosed here — this is a
--      celebration feature visible to every internal user, NOT a minimal-
--      disclosure surface. It is deliberately NOT modeled on the #158 /
--      territory_sold_summary() narrower projection; do not conflate them.
--   3. scoreboard_summary() — SECURITY DEFINER, returns ONE row per rep of
--      AGGREGATE figures only (deal count, active-pipeline count, proposal-
--      engagement count, and the set of close-months for streak). This IS the
--      minimal-disclosure boundary: no individual prospect identity, no territory
--      geometry, no addressable/census, ever. Parameterless → no narrowing input
--      exists to reconstruct another rep's individual pipeline.
--
-- DELIBERATE ARCHITECTURE NOTE (flagged to Chat in the PR body): the money
-- multiplication (pipeline_value = active count × $179,000) and the calendar
-- streak walk are computed in TypeScript, NOT here. scoreboard_summary() returns
-- the raw active-pipeline COUNT and the raw set of close MONTHS; the /scoreboard
-- server page multiplies by the single-source TERRITORY_STANDARD_PRICE constant
-- (src/components/proposal/constants.ts) and walks the streak. Rationale:
--   • the $179K price stays single-sourced in TS (CLAUDE.md: never hardcode the
--     price inline; SQL cannot import the TS constant, so embedding a literal here
--     would duplicate it), and
--   • the calendar-boundary streak logic becomes a pure, unit-tested function
--     exercised at every boundary (year rollover, gap, current-month-empty)
--     without seeding time-dependent DB fixtures.
-- Net effect on disclosure: this SQL surface is NARROWER than returning a
-- pre-multiplied value — it never even embeds the price.
--
-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. community_board_posts — the shared feed ───────────────────────────────
create table if not exists public.community_board_posts (
  id           uuid primary key default gen_random_uuid(),
  post_type    text not null
    check (post_type in ('bell_ringing','announcement','win','materials','training','competitive')),
  rep_id       uuid references auth.users(id),         -- nullable: an unassigned prospect can close
  territory_id uuid references public.territories(id), -- nullable: 0-territory close, or non-bell post
  title        text not null,
  body         text,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.community_board_posts is
  'Shared internal celebration/announcement feed (Session E). SELECT-visible to '
  'EVERY internal user (both designations) by design — everyone sees everyone''s '
  'wins. This PR (E-1) writes to it ONLY via the ring_bell_on_funded_won() trigger '
  '(SECURITY DEFINER); there is NO client-callable INSERT policy for any role or '
  'post_type. Authoring announcement/win/etc. posts is E-2 (Community Board) scope — '
  'the table exists now so E-2 adds a write path without a schema migration.';
comment on column public.community_board_posts.post_type is
  'bell_ringing is trigger-written only (this PR). The other five values are E-2 '
  'authoring types with no write path yet — enumerated now so the CHECK need not '
  'change later.';
comment on column public.community_board_posts.rep_id is
  'auth.users uid of the celebrated rep (prospects.assigned_rep_id at close). '
  'Nullable — an unassigned prospect closes with rep_id NULL and a generic name.';
comment on column public.community_board_posts.territory_id is
  'Territory this bell-ringing post celebrates. Nullable — a close that stamped no '
  'territory (none associated, or all qa_locked) still rings one territory-less bell.';

create index if not exists community_board_posts_feed_idx
  on public.community_board_posts (pinned desc, created_at desc);

-- RLS: readable by any internal user; NO write policy of any kind.
alter table public.community_board_posts enable row level security;

-- PostgREST needs a table-level SELECT grant for the policy to matter; withhold
-- every write privilege and withhold anon entirely (RLS also denies anon, since it
-- has no auth.uid() — defense in depth).
--
-- Supabase's default privileges auto-grant ALL DML (insert/update/delete/…) on new
-- public tables to `authenticated` and `service_role`. RLS with no write policy
-- already denies an authenticated client write — but revoke the write GRANTS from
-- authenticated too, so "no client write path" is closed at BOTH the grant and the
-- policy layer (fail-closed). postgres (the SECURITY DEFINER trigger's owner) and
-- service_role (server-only) keep their grants, so the bell insert still fires.
grant select on public.community_board_posts to authenticated;
revoke insert, update, delete, truncate on public.community_board_posts from authenticated;
revoke all on public.community_board_posts from anon;

-- SELECT for any internal_users row (executive OR rep). No designation split — the
-- feed is a shared surface by design.
drop policy if exists community_board_select_internal on public.community_board_posts;
create policy community_board_select_internal
  on public.community_board_posts
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
    )
  );

-- NO insert/update/delete policy is created. With RLS enabled and no permissive
-- write policy, PostgREST INSERT/UPDATE/DELETE by anon OR authenticated (rep or
-- exec) is denied — there is no client-forgeable path to fabricate a celebration
-- post. The trigger below runs SECURITY DEFINER (owner = postgres) and so bypasses
-- RLS; service_role (server-only) likewise bypasses RLS by design, not a client path.

-- ── 2. Bell Ringing trigger (SECURITY DEFINER) ───────────────────────────────
-- AFTER UPDATE (not BEFORE, and not "OF stage"): by AFTER time the E-0b BEFORE
-- trigger has already (a) stamped new.funded_won_at and (b) run its territories
-- UPDATE, so the sold territories this close created are readable here. Keying the
-- WHEN clause on the funded_won_at NULL → non-NULL transition (rather than the
-- stage crossing) is the crispest idempotency guard — it mirrors E-0b's own
-- "key off funded_won_at" design and fires exactly once no matter what path first
-- sets funded_won_at. search_path pinned empty; every reference schema-qualified.
create or replace function public.ring_bell_on_funded_won()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rep_name text;
  v_terr     record;
  v_any      boolean := false;
begin
  -- Rep display name (nullable full_name, or an unassigned close) → generic label.
  -- CLAUDE.md: full_name is nullable; never render 'null' or crash.
  select coalesce(nullif(btrim(iu.full_name), ''), 'A GetHairMD rep')
    into v_rep_name
  from public.internal_users iu
  where iu.user_id = new.assigned_rep_id;
  if v_rep_name is null then           -- no row (assigned_rep_id NULL or not internal)
    v_rep_name := 'A GetHairMD rep';
  end if;

  -- One celebration post per territory THIS close stamped sold. The E-0b BEFORE
  -- trigger set territories.sold_at = new.funded_won_at (the identical value), so
  -- matching on it selects only the territories closed by this transition — never a
  -- territory sold on some earlier, unrelated write. Excludes qa_locked rows (E-0b
  -- never stamps them; a QA anchor is not real sold inventory to celebrate).
  for v_terr in
    select t.id, t.name
    from public.territories t
    where t.prospect_id = new.id
      and t.status = 'sold'
      and t.sold_at = new.funded_won_at
      and coalesce(t.qa_locked, false) = false
  loop
    insert into public.community_board_posts (post_type, rep_id, territory_id, title, body)
    values (
      'bell_ringing',
      new.assigned_rep_id,
      v_terr.id,
      '🔔 ' || v_rep_name || ' closed ' || v_terr.name || '!',
      v_rep_name || ' just closed ' || v_terr.name || '. Ring the bell! 🎉'
    );
    v_any := true;
  end loop;

  -- Zero-territory close (prospect with no associated territory, or all qa_locked):
  -- still ring the bell once, without a territory reference.
  if not v_any then
    insert into public.community_board_posts (post_type, rep_id, territory_id, title, body)
    values (
      'bell_ringing',
      new.assigned_rep_id,
      null,
      '🔔 ' || v_rep_name || ' closed a deal!',
      v_rep_name || ' just closed a deal. Ring the bell! 🎉'
    );
  end if;

  return null;  -- AFTER trigger: return value is ignored
end;
$$;

comment on function public.ring_bell_on_funded_won() is
  'Bell Ringing (E-1). AFTER UPDATE on prospects: on the funded_won_at NULL → '
  'non-NULL transition, inserts one community_board_posts bell_ringing row per '
  'territory this close stamped sold (0 → one territory-less post). Rep name + '
  'territory name are INTENTIONALLY disclosed (celebration feed for all internal '
  'users) — deliberately NOT the #158 minimal-disclosure pattern. SECURITY DEFINER '
  'so the RLS-write-less community_board_posts table still receives the insert; '
  'idempotent via the funded_won_at transition WHEN guard.';

-- Explicit-grant discipline (mirrors E-0b's stamp_prospect_funded_won): a trigger
-- function inherits the default PUBLIC EXECUTE grant, which PostgREST would expose
-- as a callable /rest/v1/rpc endpoint (anon-forgeable celebration posts!). Trigger
-- invocation does NOT check EXECUTE on the function, so revoking ALL closes the RPC
-- surface with zero effect on firing. No grant back — nobody calls it directly.
-- (get_advisors must confirm it appears in NEITHER the anon- nor authenticated-
-- executable SECURITY DEFINER findings, exactly like stamp_prospect_funded_won.)
revoke all on function public.ring_bell_on_funded_won() from public, anon, authenticated;

drop trigger if exists prospects_ring_bell_funded_won on public.prospects;
create trigger prospects_ring_bell_funded_won
  after update on public.prospects
  for each row
  when (old.funded_won_at is null and new.funded_won_at is not null)
  execute function public.ring_bell_on_funded_won();

-- ── 3. scoreboard_summary() — aggregate leaderboard (SECURITY DEFINER) ────────
-- ⚠ SUPERSEDED by migration 20260714154000 (E-1 follow-up #2): the `close_months`
-- return column below was a second Second-Opinion Gate finding — returning the raw
-- month array to a shared leaderboard leaked peer deal-timing for low-volume reps. The
-- follow-up DROPs and recreates this function WITHOUT close_months, returning a
-- `current_streak integer` computed IN SQL instead. The definition below is retained
-- as the historical as-shipped version (supersede-never-delete); the live/canonical
-- shape is the follow-up's. The "streak computed in TypeScript" note in this file's
-- header (§ DELIBERATE ARCHITECTURE NOTE) applies only to that superseded version —
-- only pipeline_value is TS now.
-- One row per REP (internal_users.designation = 'rep'), returned to ANY internal
-- user (the leaderboard is visible to all — that's the point). SECURITY DEFINER so
-- it can aggregate across every rep's prospects (a rep cannot read another rep's
-- prospects directly under rep_read_own) WITHOUT exposing a single individual row.
--
-- MINIMAL-DISCLOSURE BOUNDARY (contrast with the bell posts above, which DO name
-- rep + territory): this function returns ONLY aggregate figures —
--   • rep_id / rep_name (the rep being ranked; their own identity, not a prospect's)
--   • deals_closed_count   — COUNT(prospects with funded_won_at) for that rep
--   • active_pipeline_count — COUNT(active, not-yet-won prospects) for that rep
--   • proposal_engagement_score — raw COUNT(proposal_events → that rep's prospects);
--       v1, unweighted, open to refinement (flagged in the PR)
--   • close_months         — the SET of 'YYYY-MM' (UTC) months the rep closed in,
--       the streak input; aggregate timing, never per-prospect identity
-- It returns NO prospect name, NO territory id/name/geometry, NO addressable/census.
-- It takes NO arguments, so there is no narrowing parameter an attacker could vary
-- to reconstruct another rep's individual pipeline — every caller gets the identical
-- full-board aggregate.
--
-- Attribution is by assigned_rep_id (the RLS-load-bearing uuid), never the text
-- assigned_rep column. deals_closed_count is defined by funded_won_at (the durable
-- close signal), NOT stage >= 11 — a legacy row parked at stage 12 with funded_won_at
-- still NULL is intentionally NOT counted as closed (it never crossed via the trigger).
create or replace function public.scoreboard_summary()
returns table (
  rep_id                     uuid,
  rep_name                   text,
  deals_closed_count         integer,
  active_pipeline_count      integer,
  proposal_engagement_score  integer,
  close_months               text[]
)
language sql
security definer
set search_path = ''
as $$
  with reps as (
    -- Gate: only emit rows when the caller is an internal user. If auth.uid() is not
    -- in internal_users (anon, or a non-allow-listed signed-in user) this EXISTS is
    -- false, reps is empty, and the whole function returns zero rows (fail closed).
    select iu.user_id, iu.full_name
    from public.internal_users iu
    where iu.designation = 'rep'
      and exists (
        select 1 from public.internal_users me where me.user_id = auth.uid()
      )
  ),
  closed as (
    select
      p.assigned_rep_id as rid,
      count(*)::int      as cnt,
      array_agg(distinct to_char(p.funded_won_at at time zone 'UTC', 'YYYY-MM')) as months
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
  )
  select
    r.user_id                                              as rep_id,
    coalesce(nullif(btrim(r.full_name), ''), 'Unnamed rep') as rep_name,
    coalesce(c.cnt, 0)                                     as deals_closed_count,
    coalesce(pl.cnt, 0)                                    as active_pipeline_count,
    coalesce(e.cnt, 0)                                     as proposal_engagement_score,
    coalesce(c.months, array[]::text[])                   as close_months
  from reps r
  left join closed c     on c.rid = r.user_id
  left join pipeline pl  on pl.rid = r.user_id
  left join engagement e on e.rid = r.user_id
  order by deals_closed_count desc, rep_name asc;
$$;

revoke all on function public.scoreboard_summary() from public, anon, authenticated;
grant execute on function public.scoreboard_summary() to authenticated;

comment on function public.scoreboard_summary() is
  'Aggregate rep leaderboard (E-1). SECURITY DEFINER, search_path pinned, gated on '
  'internal_users membership; EXECUTE to authenticated only, never anon. Returns ONE '
  'row per rep of aggregate figures ONLY — deal count, active-pipeline count, '
  'proposal-engagement count, and the set of close-months (streak input) — and NEVER '
  'individual prospect identity, territory geometry, or addressable/census. '
  'Parameterless: no narrowing input exists to reconstruct another rep''s pipeline. '
  'Attribution by assigned_rep_id; closes defined by funded_won_at. pipeline_value '
  '(× $179K) and the streak are computed in TS from these primitives (see migration '
  'header) so the price stays single-sourced and the calendar logic stays unit-testable.';
