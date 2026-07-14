import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural guardrail for Deal Territories draft visibility.
 *
 * HISTORY: PR #114 shipped the New Territory flow, so a fresh status='draft' row was
 * visible to reps on this list the moment it was created. The original fix (2026-07-12)
 * applied an app-layer `.or('status.is.null,status.neq.draft')` filter behind a `!isExec`
 * branch, because the then-current RLS (`internal_users_all`) let ANY internal user read
 * every row — the app was the only guard.
 *
 * E-0b MOVED THE GUARANTEE TO RLS. The `rep_read` policy now carries
 * `status is distinct from 'draft'` (NULL-preserving, same semantics as before), so drafts
 * are hidden from reps at the database boundary — strictly stronger than an app-layer filter,
 * and it covers the detail route and any future read path too. The page no longer needs (or
 * has) the app-layer branch. This test now pins the RLS mechanism. Comment-stripped so
 * documentation can't fake a match.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const PAGE = 'src/app/(app)/territories/page.tsx'

function e0bMigration(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) => f.endsWith('_e0b_deal_territories.sql'))
  if (!hit) throw new Error('e0b_deal_territories migration not found')
  return codeOnly(readFileSync(join(process.cwd(), dir, hit), 'utf8'))
}

describe('territories list draft filter (now RLS-enforced, E-0b)', () => {
  const page = codeOnly(read(PAGE))

  it('page exists', () => {
    expect(existsSync(join(process.cwd(), PAGE))).toBe(true)
  })

  it('resolves the executive designation (to gate the New Territory control)', () => {
    expect(page).toContain('getViewerDesignation')
    expect(page).toMatch(/isExec/)
  })

  it('the rep_read RLS policy excludes drafts with NULL-preserving semantics', () => {
    const mig = e0bMigration()
    // Scope to the rep_read policy body.
    const repRead = mig.match(/create\s+policy\s+rep_read[\s\S]*?;/i)?.[0]
    expect(repRead, 'rep_read policy must be present').toBeTruthy()
    // IS DISTINCT FROM keeps NULL-status rows (only true 'draft' is dropped) — mirrors the
    // National Map migration's choice, not a bare `<> 'draft'` that would also drop NULLs.
    expect(repRead).toMatch(/status\s+is\s+distinct\s+from\s+'draft'/i)
  })

  it('drafts are hidden at the DB boundary, not by an app-layer neq that also drops NULLs', () => {
    // The retired app-layer bare-neq anti-pattern must not reappear on the page.
    expect(page).not.toMatch(/query\s*=\s*query\.neq\(\s*['"]status['"]\s*,\s*['"]draft['"]\s*\)/)
  })
})
