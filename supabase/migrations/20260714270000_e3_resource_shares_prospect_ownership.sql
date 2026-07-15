-- ─────────────────────────────────────────────────────────────────────────────
-- E-3 — Resource Library: resource_shares INSERT policy hardening (prospect
-- ownership). Supersedes the rep INSERT policy shipped in
-- 20260714250000_e3_resource_shares.sql — that file is ALREADY APPLIED to the live
-- DB and is NOT edited (supersede-never-delete; it stays a truthful record of what
-- it shipped). This migration drops and recreates the ONE policy it patched.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- ── WHY (Second-Opinion Gate BLOCK on PR #136) ───────────────────────────────
-- The original resource_shares_insert_rep_own WITH CHECK enforced three things:
-- rep_id = auth.uid(), the caller is a rep, and the target asset is active. It
-- enforced NOTHING about prospect_id. A rep could therefore INSERT a share naming
-- ANY prospect in the system — including one assigned to a DIFFERENT rep.
--
-- That is not a cosmetic gap. computeResourceFeed() (src/lib/dashboard/triggers.ts)
-- attributes each resource-open feed item by prospects.assigned_rep_id, NOT by who
-- created the share. So a forged share against another rep's prospect surfaces as
-- fabricated engagement in *that other rep's* dashboard feed — corrupting a peer's
-- activity signal, the exact cross-rep boundary E-3 is required to hold.
--
-- The original adversarial pass tested rep_id forgery (blocked by the BEFORE INSERT
-- trigger) but never tested prospect_id forgery — a different axis of the same
-- policy. This migration closes that axis; new probes cover it.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
-- Add a fourth WITH CHECK clause: the named prospect must be assigned to the
-- calling rep. Because prospects.assigned_rep_id is NULLABLE (unassigned prospects
-- exist), an unassigned prospect fails this check for EVERY rep — `NULL = auth.uid()`
-- is never true, so nobody owns it and nobody may share against it. That is the
-- correct, intended behaviour (confirmed by an explicit adversarial probe): a share
-- must always be attributed to a specific prospect the sharer actually owns.
--
-- Scope note: this policy is rep-only (executives have NO INSERT policy on
-- resource_shares — they are graders, not sharers), so this change does not
-- interact with any executive/QA-exec path.
--
-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists resource_shares_insert_rep_own on public.resource_shares;
create policy resource_shares_insert_rep_own
  on public.resource_shares
  as permissive
  for insert
  to authenticated
  with check (
    -- rep_id is also server-stamped from auth.uid() by the BEFORE INSERT trigger;
    -- this re-asserts it (defence in depth).
    rep_id = (select auth.uid())
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'rep'
    )
    -- the asset must be active — no tracked link to a retired asset.
    and exists (
      select 1 from public.resource_assets ra
      where ra.id = asset_id
        and ra.active = true
    )
    -- NEW (gate BLOCK fix): the prospect must be assigned to THIS rep. Forbids a rep
    -- forging a share against another rep's prospect (which would inject fabricated
    -- engagement into that rep's dashboard feed). An unassigned prospect
    -- (assigned_rep_id IS NULL) fails for everyone — nobody owns it.
    and exists (
      select 1 from public.prospects p
      where p.id = prospect_id
        and p.assigned_rep_id = (select auth.uid())
    )
  );

comment on table public.resource_shares is
  'Per-rep, per-prospect tracked share links for Resource Library assets (E-3, §4C.3). '
  'rep_id is SERVER-STAMPED from auth.uid() by a BEFORE INSERT trigger and re-checked by '
  'the rep INSERT policy — never taken from the client, so a rep cannot forge another '
  'rep''s share. prospect_id is NOT NULL AND (as of migration 20260714270000, gate BLOCK '
  'fix) must be assigned to the calling rep — a rep cannot share against another rep''s '
  'prospect, nor against an unassigned one. READ: a rep sees only their own shares; an '
  'executive sees all. The open-tracking columns (first_opened_at/last_opened_at/open_count) '
  'are NOT client-writable — no client UPDATE policy exists and UPDATE is revoked; only the '
  'SECURITY DEFINER open-logging function (open_resource_share) writes them. DELETE is '
  'revoked for every client role.';
