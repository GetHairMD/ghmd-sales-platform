import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * PR-0d-interim — accidental anon-executable privileged functions (source-scan).
 *
 * Same guardrail idiom as rls-remediation.test.ts: the repo has no live-DB
 * harness, so the migration source on disk is what we lock invariants against.
 *
 * The invariant that actually matters here is the NEGATIVE one. `st_estimatedextent`
 * is supabase_admin-owned, so a REVOKE against it succeeds without error and
 * changes nothing (docs/PLATFORM-GOTCHAS.md #6) — shipping one would create a
 * permanent record claiming a remediation that never happened. Section B of the
 * migration is therefore documentation-only BY DESIGN, and this test is what stops
 * a later well-meaning edit from "finishing the job".
 */

const MIGRATION =
  'supabase/migrations/20260720140000_revoke_rls_auto_enable_client_execute.sql'
const sql = readFileSync(join(process.cwd(), MIGRATION), 'utf8')

// The header documents banned tokens (st_estimatedextent, gate_decision_for_pr)
// in prose, so absence checks must scan EXECUTABLE SQL only.
const code = sql
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')

describe('PR-0d-interim function-grant triage migration', () => {
  it('targets the sales project and never references the NIP project', () => {
    expect(sql).toMatch(/cprltmwwldbxcsunsafl/)
    expect(code).not.toMatch(/kjweckggegifjmmqccul/)
  })

  it('revokes EXECUTE on rls_auto_enable from public, anon AND authenticated', () => {
    expect(code).toMatch(
      /revoke execute on function public\.rls_auto_enable\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    )
  })

  it('revokes the bare PUBLIC grant, not just the two named roles', () => {
    // proacl carried `=X/postgres` (a PUBLIC grant). Revoking anon+authenticated
    // alone would leave the function executable by everyone.
    const revoke = code.match(/revoke execute on function public\.rls_auto_enable\(\)[^;]*/i)
    expect(revoke).not.toBeNull()
    expect(revoke![0]).toMatch(/\bpublic\b/i)
  })

  it('ships no executable SQL touching st_estimatedextent (inert-revoke trap)', () => {
    expect(code).not.toMatch(/st_estimatedextent/i)
    // ...while the documentation-only disposition IS present in the header.
    expect(sql).toMatch(/st_estimatedextent/i)
    expect(sql).toMatch(/NOT REMEDIABLE BY MIGRATION/i)
    expect(sql).toMatch(/SU-426558/)
  })

  it('does not touch the CI-load-bearing gate accessor', () => {
    expect(code).not.toMatch(/gate_decision_for_pr/i)
  })

  it('carries a fail-closed postcondition using effective-privilege checks', () => {
    expect(code).toMatch(/has_function_privilege\(\s*'anon'/i)
    expect(code).toMatch(/has_function_privilege\(\s*'authenticated'/i)
    // service_role must be asserted to still HOLD execute (negated check).
    expect(code).toMatch(/if not has_function_privilege\(\s*'service_role'/i)
    expect(code).toMatch(/raise exception/i)
  })

  it('leaves the nine authenticated-executable RPCs to 0d proper', () => {
    for (const fn of [
      'community_board_authors',
      'create_territory_deal',
      'ensure_priced_deal',
      'move_deal_stage',
      'scoreboard_summary',
      'set_customer_deal_status',
      'set_deal_status',
      'territory_sold_summary',
      'territory_status_map',
    ]) {
      expect(code).not.toMatch(new RegExp(`revoke[^;]*${fn}`, 'i'))
    }
  })
})
