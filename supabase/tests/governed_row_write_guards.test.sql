-- ─────────────────────────────────────────────────────────────────────────────
-- Regression battery for the governed-row write guards.
-- Covers migration 20260710140000_governed_row_write_guards.sql
--   • qa_locked immutability trigger        (decision #124)
--   • RLS restrictive UPDATE policy         (decision #124)
--   • sold_boundary_geom VALUE-scoped freeze (decision #125, addendum to #124)
--
-- Non-destructive: every assertion runs against EPHEMERAL rows inside a single
-- transaction that always ROLLBACKs. It never touches the real qa_locked anchors
-- (the corruption of one such anchor is the incident this migration remediates).
--
-- It exercises three real Postgres roles, because the sold_boundary_geom escape
-- hatch discriminates on them: postgres (the out-of-band admin / Supabase MCP /
-- migration role), service_role (the app's RLS-bypassing batch role), and
-- authenticated (an internal-user session). SET ROLE / RESET ROLE is how a single
-- privileged connection simulates each client.
--
-- HOW TO RUN (against ghmd-sales-platform / cprltmwwldbxcsunsafl only):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/governed_row_write_guards.test.sql
--   or paste into the Supabase SQL editor.
-- A clean run prints NOTICE 'GOVERNED-ROW GUARD TESTS: ALL PASSED' and rolls back.
-- Any assertion failure RAISES with the failing case id and aborts.
--
-- Requires at least one row in public.internal_users (any real deployment has one)
-- to exercise the authenticated-role path; that user_id is used as the JWT sub.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

do $test$
declare
  v_uid   text;
  -- qa_locked / RLS fixtures
  lock_svc  uuid := '00000000-0000-0000-0000-0000000a0001';
  lock_auth uuid := '00000000-0000-0000-0000-0000000a0002';
  unl_auth  uuid := '00000000-0000-0000-0000-0000000a0003';
  del_svc   uuid := '00000000-0000-0000-0000-0000000a0004';  -- DELETE guard fixtures (#126)
  del_auth  uuid := '00000000-0000-0000-0000-0000000a0005';
  -- sold_boundary_geom fixtures (boundary already set unless noted)
  sold_admin uuid := '00000000-0000-0000-0000-0000000b0001';
  sold_svc   uuid := '00000000-0000-0000-0000-0000000b0002';
  sold_auth  uuid := '00000000-0000-0000-0000-0000000b0003';
  sold_null  uuid := '00000000-0000-0000-0000-0000000b0004';  -- boundary NULL (first-set case)
  p1 geometry := st_multi(st_setsrid(st_geomfromtext('POLYGON((0 0,0 1,1 1,1 0,0 0))'), 4326));
  p2 geometry := st_multi(st_setsrid(st_geomfromtext('POLYGON((0 0,0 2,2 2,2 0,0 0))'), 4326));
  v_lk boolean;
  v_state text;
  v_n int;
begin
  select user_id::text into v_uid from public.internal_users limit 1;
  if v_uid is null then
    raise exception 'PRECONDITION: public.internal_users is empty; cannot exercise the authenticated path';
  end if;

  insert into public.territories(id,name,center_lat,center_lng,qa_locked,status,boundary_geom) values
    (lock_svc ,'__lock_svc__' ,30,-97,true ,'available', p1),
    (lock_auth,'__lock_auth__',30,-97,true ,'available', p1);
  insert into public.territories(id,name,center_lat,center_lng,qa_locked,status) values
    (unl_auth ,'__unl_auth__' ,31,-95,false,'available'),
    (del_svc  ,'__del_svc__'  ,30,-97,true ,'available'),
    (del_auth ,'__del_auth__' ,30,-97,true ,'available');
  insert into public.territories(id,name,center_lat,center_lng,qa_locked,status,sold_boundary_geom) values
    (sold_admin,'__sold_admin__',32,-96,false,'sold', p1),
    (sold_svc  ,'__sold_svc__'  ,32,-96,false,'sold', p1),
    (sold_auth ,'__sold_auth__' ,32,-96,false,'sold', p1);
  insert into public.territories(id,name,center_lat,center_lng,qa_locked,status) values
    (sold_null ,'__sold_null__' ,33,-97,false,'sold');

  -- ═══ ADMIN (postgres) — sold_boundary_geom escape hatch ═══
  -- E1: postgres WITHOUT the override GUC is still rejected (explicit intent required).
  begin
    update public.territories set sold_boundary_geom = p2 where id = sold_admin;
    raise exception 'FAIL E1: postgres changed a frozen boundary without the override GUC';
  exception when check_violation then null; end;

  -- E2: postgres WITH the override GUC succeeds (the sole legitimate redraw path).
  perform set_config('app.sold_boundary_override', 'on', true);
  update public.territories set sold_boundary_geom = p2 where id = sold_admin;
  perform set_config('app.sold_boundary_override', 'off', true);

  -- ═══ SERVICE_ROLE — RLS bypassed; triggers are the guard ═══
  execute 'set local role service_role';

  -- qa_locked (decision #124): a locked row is immutable except unlock-only.
  begin update public.territories set name='x' where id=lock_svc;
    raise exception 'FAIL S1: service-role edit-while-locked allowed';
  exception when check_violation then null; end;
  begin update public.territories set name='x', qa_locked=false where id=lock_svc;   -- adversarial (a)
    raise exception 'FAIL S2: service-role edit+unlock allowed';
  exception when check_violation then null; end;
  begin update public.territories                                                     -- unlock + geometry edit
      set qa_locked=false, boundary_geom=p2 where id=lock_svc;
    raise exception 'FAIL S3: service-role unlock+geometry-edit allowed';
  exception when check_violation then null; end;
  update public.territories set qa_locked=false where id=lock_svc;                     -- unlock-only ok
  select qa_locked into v_lk from public.territories where id=lock_svc;
  if v_lk then raise exception 'FAIL S4: unlock-only did not clear qa_locked'; end if;
  update public.territories set name='edited' where id=lock_svc;                       -- edit unlocked ok
  update public.territories set qa_locked=true where id=lock_svc;                      -- re-lock ok (service-role)

  -- sold_boundary_geom (decision #125): frozen once set, regardless of status.
  begin update public.territories set sold_boundary_geom=p2 where id=sold_svc;         -- adversarial (c)
    raise exception 'FAIL V1: service-role changed a frozen sold boundary';
  exception when check_violation then null; end;
  update public.territories set notes='ok' where id=sold_svc;                          -- other column ok
  update public.territories set status='available' where id=sold_svc;                  -- un-sell (round-trip step 1) ok
  begin update public.territories set sold_boundary_geom=p2 where id=sold_svc;         -- round-trip step 2 — MUST fail
    raise exception 'FAIL V2: round-trip OPEN — boundary changed while status=available';
  exception when check_violation then null; end;
  perform set_config('app.sold_boundary_override', 'on', true);                        -- service_role cannot use the hatch
  begin update public.territories set sold_boundary_geom=p2 where id=sold_svc;
    raise exception 'FAIL E4: service_role used the escape hatch with the GUC set';
  exception when check_violation then null; end;
  perform set_config('app.sold_boundary_override', 'off', true);
  update public.territories set sold_boundary_geom=p1 where id=sold_null;              -- first-set at sale ok (old NULL)

  -- qa_locked DELETE guard (decision #126): a locked row cannot be deleted; the
  -- sanctioned path is unlock (the #124 UPDATE hatch) then an ordinary DELETE.
  begin delete from public.territories where id=del_svc;
    raise exception 'FAIL D1: service-role deleted a qa_locked row';
  exception when check_violation then null; end;
  update public.territories set qa_locked=false where id=del_svc;                      -- unlock
  delete from public.territories where id=del_svc;                                     -- then delete
  select count(*) into v_n from public.territories where id=del_svc;
  if v_n <> 0 then raise exception 'FAIL D3: service-role unlock-then-delete left the row'; end if;

  -- ═══ AUTHENTICATED — internal user, RLS enforced ═══
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', v_uid, true);
  execute 'set local role authenticated';

  begin update public.territories set name='x', qa_locked=false where id=lock_auth;    -- adversarial (a), auth
    raise exception 'FAIL A1: authenticated edit+unlock allowed';
  exception when check_violation then null; end;
  begin update public.territories set name='x' where id=lock_auth;                     -- keep-locked edit
    raise exception 'FAIL A2: authenticated edit-while-locked allowed';
  exception when check_violation or insufficient_privilege then null; end;
  update public.territories set qa_locked=false where id=lock_auth;                    -- auth unlock-only ok
  begin update public.territories set qa_locked=true where id=unl_auth;                -- re-lock blocked by RLS
    raise exception 'FAIL A3: authenticated re-lock allowed (RLS should deny)';
  exception when insufficient_privilege then
    get stacked diagnostics v_state = returned_sqlstate;   -- expect 42501 (row-level security)
  end;
  begin update public.territories set sold_boundary_geom=p2 where id=sold_auth;        -- adversarial (c), auth
    raise exception 'FAIL A4: authenticated changed a frozen sold boundary';
  exception when check_violation then null; end;
  perform set_config('app.sold_boundary_override', 'on', true);                        -- authenticated cannot use the hatch
  begin update public.territories set sold_boundary_geom=p2 where id=sold_auth;
    raise exception 'FAIL A5: authenticated used the escape hatch with the GUC set';
  exception when check_violation then null; end;
  perform set_config('app.sold_boundary_override', 'off', true);
  update public.territories set notes='auth-note' where id=sold_auth;                  -- other column ok

  begin delete from public.territories where id=del_auth;                              -- DELETE guard (#126)
    raise exception 'FAIL D2: authenticated deleted a qa_locked row';
  exception when check_violation or insufficient_privilege then null; end;
  update public.territories set qa_locked=false where id=del_auth;                      -- unlock
  delete from public.territories where id=del_auth;                                     -- then delete
  select count(*) into v_n from public.territories where id=del_auth;
  if v_n <> 0 then raise exception 'FAIL D4: authenticated unlock-then-delete left the row'; end if;

  execute 'reset role';
  raise notice 'GOVERNED-ROW GUARD TESTS: ALL PASSED (qa_locked UPDATE+DELETE + RLS + sold_boundary_geom value-scoped freeze)';
end
$test$;

rollback;
