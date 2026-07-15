-- ─────────────────────────────────────────────────────────────────────────────
-- E-3 — Resource Library: resource_shares (per-rep, per-prospect tracked links).
-- Decision #159 (Session E sequence). Spec: docs/SALES-OS-SPEC.md §4C.3.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Depends on 20260714240000 (resource_assets) and the existing prospects table.
--
-- WHAT this migration does:
--   One row per tracked share a rep generates: (asset, rep, prospect) → an
--   unguessable `token` that becomes /r/<token>. The prospect opens the link; the
--   /r/[token] server path (via a SECURITY DEFINER function in the next migration)
--   stamps the open-tracking columns. Nothing on the client may write those columns.
--
-- ── TWO AUDIT-INTEGRITY INVARIANTS (the security core of this migration) ──────
--   1. rep_id is SERVER-STAMPED from auth.uid(), never taken from the client body —
--      the same pattern as community_board_posts.reviewed_by. A BEFORE INSERT
--      trigger overwrites whatever rep_id the client sent with auth.uid() (when an
--      authenticated principal is present), and the rep INSERT policy's WITH CHECK
--      re-asserts rep_id = auth.uid() as defence in depth. A rep therefore cannot
--      forge a share attributed to a DIFFERENT rep (AC5) — the value is silently
--      overridden, then re-checked.
--   2. The open-tracking columns (first_opened_at / last_opened_at / open_count) are
--      NOT client-writable at all: there is NO client UPDATE policy and UPDATE is
--      revoked at the grant layer, so only the service-role / SECURITY DEFINER
--      event-write path can touch them — the same "RLS gates who, but the honest
--      value comes from the server" reasoning as reviewed_by/reviewed_at.
--
-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ─────────────────────────────────────────────────────────────────
-- prospect_id is NOT NULL by design: every tracked link is attributed to a specific
-- prospect — there is no anonymous/generic-share path in E-3.
create table if not exists public.resource_shares (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid not null references public.resource_assets(id) on delete cascade,
  rep_id          uuid not null references auth.users(id),
  prospect_id     uuid not null references public.prospects(id) on delete cascade,
  token           text not null unique,
  created_at      timestamptz not null default now(),
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      integer not null default 0
);

create index if not exists resource_shares_rep_id_idx      on public.resource_shares (rep_id);
create index if not exists resource_shares_prospect_id_idx on public.resource_shares (prospect_id);
create index if not exists resource_shares_asset_id_idx    on public.resource_shares (asset_id);

-- ── 2. Server-stamp rep_id + zero the tracking columns on INSERT ─────────────
-- SECURITY INVOKER (default) ON PURPOSE: the function must observe the CALLING rep's
-- auth.uid(), which a DEFINER context would replace with the owner's.
--
-- The `auth.uid() is not null` guard matters: under the service-role client (fixtures,
-- seeding) there is no auth.uid(), so the explicitly-supplied rep_id is kept. Under an
-- authenticated rep (the real share-creation path) rep_id is FORCED to auth.uid(),
-- making it non-forgeable. Tracking columns are always reset — a share always starts
-- unopened, so a client cannot pre-seed a fake open_count.
create or replace function public.resource_shares_stamp_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at      := now();
  new.first_opened_at := null;
  new.last_opened_at  := null;
  new.open_count      := 0;
  if (select auth.uid()) is not null then
    new.rep_id := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.resource_shares_stamp_insert() from public, anon, authenticated;

drop trigger if exists resource_shares_stamp_insert on public.resource_shares;
create trigger resource_shares_stamp_insert
  before insert on public.resource_shares
  for each row
  execute function public.resource_shares_stamp_insert();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
alter table public.resource_shares enable row level security;

-- Grant INSERT and SELECT only. UPDATE/DELETE/TRUNCATE stay revoked for every client
-- role: the open-tracking columns are written exclusively by the SECURITY DEFINER
-- event path (next migration), never by a client.
grant select, insert on public.resource_shares to authenticated;
revoke update, delete, truncate on public.resource_shares from authenticated;
revoke all on public.resource_shares from anon;

-- INSERT — a rep may create a share attributed to themselves, for an ACTIVE asset.
-- rep_id = auth.uid() re-asserts the trigger's stamp (defence in depth). The asset
-- must be active — a rep cannot mint a tracked link to a retired asset. Executives are
-- graders, not sharers, and have no INSERT policy here (they can use a rep seat to test).
drop policy if exists resource_shares_insert_rep_own on public.resource_shares;
create policy resource_shares_insert_rep_own
  on public.resource_shares
  as permissive
  for insert
  to authenticated
  with check (
    rep_id = (select auth.uid())
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'rep'
    )
    and exists (
      select 1 from public.resource_assets ra
      where ra.id = asset_id
        and ra.active = true
    )
  );

-- SELECT — a rep sees ONLY their own shares; an executive sees all.
drop policy if exists resource_shares_select_own on public.resource_shares;
create policy resource_shares_select_own
  on public.resource_shares
  as permissive
  for select
  to authenticated
  using (rep_id = (select auth.uid()));

drop policy if exists resource_shares_select_executive_all on public.resource_shares;
create policy resource_shares_select_executive_all
  on public.resource_shares
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

-- No UPDATE policy and no DELETE policy for any client role, by design (see §3 grant).

comment on table public.resource_shares is
  'Per-rep, per-prospect tracked share links for Resource Library assets (E-3, §4C.3). '
  'rep_id is SERVER-STAMPED from auth.uid() by a BEFORE INSERT trigger and re-checked by '
  'the rep INSERT policy — never taken from the client, so a rep cannot forge another '
  'rep''s share. prospect_id is NOT NULL: every link is attributed to a specific prospect. '
  'READ: a rep sees only their own shares; an executive sees all. The open-tracking '
  'columns (first_opened_at/last_opened_at/open_count) are NOT client-writable — no client '
  'UPDATE policy exists and UPDATE is revoked; only the SECURITY DEFINER open-logging '
  'function (open_resource_share) writes them. DELETE is revoked for every client role.';
