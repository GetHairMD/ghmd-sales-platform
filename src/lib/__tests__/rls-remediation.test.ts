import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Hard Rule 10 — RLS remediation guardrail (source-scan).
 *
 * The repo has no live-DB RLS harness, so — exactly like public-proposal-guardrails —
 * this scans the migration source on disk to lock in the remediation invariants:
 *   • the 7 blanket policies are dropped by their EXACT names (activities differs);
 *   • the 4 rep-facing tables get an allow-list-gated (non-`true`) policy;
 *   • the 3 server-only tables are left policy-less (service-role-only);
 *   • membership is seeded in the SAME migration as the swap (no deploy lockout);
 *   • no NEW `USING (true)` / `WITH CHECK (true)` blanket policy is introduced;
 *   • the accepted-disposition objects are not altered.
 */

const REMEDIATION = 'supabase/migrations/20260708120000_hard_rule_10_rls_remediation.sql'
const sql = readFileSync(join(process.cwd(), REMEDIATION), 'utf8')
// Comment-stripped view: the header documents banned tokens (NIP ref, USING(true),
// the accepted-disposition function names) in prose, so structural / absence checks
// must scan executable SQL only.
const code = sql
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')

const REP_FACING = ['prospects', 'deals', 'territories', 'activities']
const SERVER_ONLY = ['call_scores', 'spoke_candidates', 'outreach_touches']

describe('Hard Rule 10 RLS remediation migration', () => {
  it('targets the sales project and never references the NIP project in SQL', () => {
    expect(sql).toMatch(/cprltmwwldbxcsunsafl/)
    expect(code).not.toMatch(/kjweckggegifjmmqccul/)
  })

  it('drops the blanket policies by their exact names (activities differs)', () => {
    for (const t of ['prospects', 'deals', 'territories', ...SERVER_ONLY]) {
      expect(code).toMatch(
        new RegExp(`drop policy if exists\\s+"authenticated_all"\\s+on public\\.${t}`, 'i'),
      )
    }
    expect(code).toMatch(
      /drop policy if exists\s+"authenticated_full_access"\s+on public\.activities/i,
    )
  })

  it('creates an allow-list-gated policy on every rep-facing table', () => {
    for (const t of REP_FACING) {
      expect(code).toMatch(new RegExp(`create policy "internal_users_all" on public\\.${t}`, 'i'))
    }
    // The gate references the allow-list rather than a blanket true.
    expect(code).toMatch(/internal_users iu where iu\.user_id = \(select auth\.uid\(\)\)/i)
  })

  it('does NOT create any policy on the server-only tables', () => {
    for (const t of SERVER_ONLY) {
      expect(code).not.toMatch(new RegExp(`create policy[^\\n]* on public\\.${t}`, 'i'))
    }
  })

  it('seeds internal_users from auth.users before the rep-facing policies are created', () => {
    expect(code).toMatch(/insert into public\.internal_users/i)
    expect(code).toMatch(/from auth\.users/i)
    expect(code.search(/insert into public\.internal_users/i)).toBeLessThan(
      code.search(/create policy "internal_users_all"/i),
    )
  })

  it('enables RLS on internal_users with a self-read-only policy', () => {
    expect(code).toMatch(/alter table public\.internal_users enable row level security/i)
    expect(code).toMatch(/create policy "self_read" on public\.internal_users\s+for select/i)
  })

  it('introduces no new blanket USING (true) / WITH CHECK (true) policy', () => {
    expect(code).not.toMatch(/using \(true\)/i)
    expect(code).not.toMatch(/with check \(true\)/i)
  })

  it('does not alter the accepted-disposition objects', () => {
    expect(code).not.toMatch(/gate_decision_for_pr/i)
    expect(code).not.toMatch(/rls_auto_enable/i)
    expect(code).not.toMatch(/st_estimatedextent/i)
  })
})
