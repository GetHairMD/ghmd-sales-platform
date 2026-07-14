-- ─────────────────────────────────────────────────────────────────────────────
-- E-1 follow-up — make prospects.funded_won_at NOT client-writable.
--
-- ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP (kjweckggegifjmmqccul) never touched.
--
-- WHY: funded_won_at is the durable "deal closed" signal. It is meant to be set ONLY
-- by stamp_prospect_funded_won() (E-0b, SECURITY DEFINER) on the genuine stage>=11
-- crossing — nothing else. E-1's Bell Ringing trigger and scoreboard_summary() both
-- key off it (bell fires on its NULL->non-NULL transition; deals_closed_count counts
-- funded_won_at IS NOT NULL), so a client able to set it directly could forge a
-- celebration post and inflate the leaderboard WITHOUT a real close.
--
-- Before this migration that path was open to executives: prospects' only UPDATE RLS
-- policy is exec_all (reps have no UPDATE policy at all), and `authenticated` held a
-- TABLE-LEVEL UPDATE grant covering every column — so an exec client could
-- `UPDATE prospects SET funded_won_at = now()` directly. A column-level REVOKE alone
-- does NOT close this: a table-level UPDATE grant covers all columns and column
-- revokes do not subtract from it. The fix is to drop the table-level UPDATE grant
-- and re-grant column-level UPDATE on every column EXCEPT funded_won_at.
--
-- The legitimate write path is unaffected:
--   • The app's stage move (src/app/(app)/pipeline/actions.ts) only ever SETs
--     stage / stage_updated_at / skipped_funding_prequal — never funded_won_at — so
--     it still holds the needed column grants.
--   • stamp_prospect_funded_won() sets NEW.funded_won_at from inside a BEFORE trigger;
--     a trigger's NEW-column assignment is NOT checked against the statement's
--     column-UPDATE privileges, and the function is SECURITY DEFINER (owner postgres)
--     regardless. service_role (server-only) bypasses grants entirely.
-- Net: only the SECURITY DEFINER trigger and service_role can ever write funded_won_at.
--
-- Grant is generated dynamically (all columns except funded_won_at) so it matches the
-- live schema exactly and cannot drift on a typo. NOTE (maintenance): a future
-- migration that adds a prospects column the app must UPDATE via the authenticated
-- client must grant UPDATE on that new column to `authenticated` — table-level UPDATE
-- is intentionally no longer held. Pinned by e1-scoreboard-bell-ringing.test.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the blanket table-level UPDATE (it silently re-covers funded_won_at otherwise).
revoke update on public.prospects from authenticated;

-- Re-grant column-level UPDATE on every column EXCEPT funded_won_at.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'prospects'
    and column_name <> 'funded_won_at';

  execute format('grant update (%s) on public.prospects to authenticated', v_cols);
end
$$;
