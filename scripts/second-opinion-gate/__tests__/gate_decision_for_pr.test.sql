-- Second-Opinion Gate — SQL function-level tests for
-- public.gate_decision_for_pr(repo, pr_number). Closes decision_log row #24.
-- Verifies the isolation/behaviour invariants:
--   1. returns the single bound row's minimal fields (id, residual_risk, status)
--   1b. a same-numbered PR under a different repo returns nothing (cross-repo scope)
--   2. returns nothing when no row is bound to the (repo, pr)
--   3. the CI role (anon) can EXECUTE the function but CANNOT read ops.decision_log
--
-- Run against the Sales project (cprltmwwldbxcsunsafl) with a role that can insert
-- into ops.decision_log (service_role / postgres):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f gate_decision_for_pr.test.sql
--
-- Wrapped in a transaction that ROLLBACKs so the append-only decision_log is not
-- polluted by the test row. Each assertion RAISEs EXCEPTION on failure, so a
-- non-zero psql exit means a test failed.

begin;

-- Fixture: one accepted-risk row bound to a sentinel repo + PR number.
insert into ops.decision_log
  (decided_on, platform, title, decision, status, residual_risk, related_repo, related_pr)
values
  ('2026-07-02', 'sales', '__gate_test_row__', 'test decision', 'ADOPTED', 'accepted',
   'GetHairMD/ghmd-sales-platform', 999999);

do $$
declare
  r         record;
  n         integer;
begin
  -- 1. matching (repo, pr) returns exactly one row with the minimal fields.
  select count(*) into n
    from public.gate_decision_for_pr('GetHairMD/ghmd-sales-platform', 999999);
  if n <> 1 then
    raise exception 'TEST 1 FAILED: expected 1 row for PR 999999, got %', n;
  end if;
  select * into r
    from public.gate_decision_for_pr('GetHairMD/ghmd-sales-platform', 999999);
  if r.residual_risk <> 'accepted' then
    raise exception 'TEST 1 FAILED: residual_risk expected accepted, got %', r.residual_risk;
  end if;
  if r.status <> 'ADOPTED' then
    raise exception 'TEST 1 FAILED: status expected ADOPTED, got %', r.status;
  end if;

  -- 1b. same PR number under a different repo must NOT match (cross-repo scope).
  select count(*) into n
    from public.gate_decision_for_pr('GetHairMD/gethairmd-network', 999999);
  if n <> 0 then
    raise exception 'TEST 1b FAILED: expected 0 rows for a different repo, got %', n;
  end if;

  -- 2. no-match returns zero rows.
  select count(*) into n
    from public.gate_decision_for_pr('GetHairMD/ghmd-sales-platform', 888888);
  if n <> 0 then
    raise exception 'TEST 2 FAILED: expected 0 rows for unbound PR 888888, got %', n;
  end if;

  -- 3. isolation: anon can EXECUTE the function but cannot reach the table.
  if has_table_privilege('anon', 'ops.decision_log', 'SELECT') then
    raise exception 'TEST 3 FAILED: anon has SELECT on ops.decision_log (isolation broken)';
  end if;
  if has_schema_privilege('anon', 'ops', 'USAGE') then
    raise exception 'TEST 3 FAILED: anon has USAGE on schema ops (isolation broken)';
  end if;
  if not has_function_privilege('anon', 'public.gate_decision_for_pr(text,integer)', 'EXECUTE') then
    raise exception 'TEST 3 FAILED: anon cannot EXECUTE gate_decision_for_pr (CI would fail closed)';
  end if;

  raise notice 'gate_decision_for_pr: all SQL function tests passed.';
end $$;

rollback;
