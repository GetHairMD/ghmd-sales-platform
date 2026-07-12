import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * qa_locked approve-route guardrails (2026-07-10 Nashville incident, sibling #2).
 *
 * POST /api/territories/[id]/approve promotes a succeeded VIABLE sizing job into the
 * territory's persisted v3 boundary — a service-role (RLS-bypassing) write of
 * formula_version=3 + boundary_* fields. It guarded sold/reserved status but NOT qa_locked,
 * so an executive could approve a job against a locked #94 anchor and overwrite it (live risk:
 * three succeeded VIABLE anchor jobs exist and all three anchors are status='available').
 *
 * The fix refuses (409) when the territory is qa_locked, before the write. This source-scan
 * trip-wire proves the guard exists and gates the .update(). Same idiom as
 * app-shell-chrome-guardrails / public-proposal-guardrails — no route-invocation harness
 * exists in this repo, so structure is asserted against the file on disk.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Executable-code view: strip block/JSDoc + line comments so the checks can't be satisfied
 *  (or fooled) by a comment that merely names qa_locked. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const ROUTE = 'src/app/api/territories/[id]/approve/route.ts'

describe('qa_locked approve-route guardrails (Nashville anchor-overwrite regression)', () => {
  it('selects qa_locked on the territory lookup so the guard can see it', () => {
    const code = codeOnly(read(ROUTE))
    expect(code, 'the territory lookup must select qa_locked').toMatch(
      /\.select\(\s*['"][^'"]*qa_locked[^'"]*['"]\s*\)/,
    )
  })

  it('refuses (409) when the territory is qa_locked', () => {
    const code = codeOnly(read(ROUTE))
    expect(code, 'must branch on territory.qa_locked').toContain('territory.qa_locked')
    // The refusal is a 409, same shape as the sold/reserved guard.
    const guardAt = code.indexOf('territory.qa_locked')
    const after = code.slice(guardAt, guardAt + 200)
    expect(after, 'the qa_locked branch must return a 409').toMatch(/status:\s*409/)
  })

  it('the qa_locked refusal precedes the boundary .update() (write unreachable when locked)', () => {
    const code = codeOnly(read(ROUTE))
    const guardAt = code.indexOf('territory.qa_locked')
    const updateAt = code.indexOf('.update(')
    expect(guardAt, 'the qa_locked guard must be present').toBeGreaterThanOrEqual(0)
    expect(updateAt, 'the boundary update must be present').toBeGreaterThanOrEqual(0)
    expect(guardAt, 'qa_locked refusal must gate (precede) the territories write').toBeLessThan(
      updateAt,
    )
  })
})

/**
 * draft -> available flip on approval (national-map visibility; 2026-07-11).
 *
 * The territory_status_map() migration (20260711160000) hides status='draft' rows from the
 * national map. A territory created via /territories/new is born 'draft', so approval — the
 * moment it becomes real (formula_version=3 + boundary_geom) — MUST also move it out of 'draft'
 * or it stays permanently invisible on the map. The flip is scoped: ONLY draft -> available.
 * A non-draft status (V2_LEGACY sized under v3, or re-approval of an already-available
 * territory) must be left exactly as-is, never overwritten. Same source-scan idiom as above.
 */
describe('approve-route draft -> available flip (national-map visibility)', () => {
  it('reads the current status and sets available when it is draft', () => {
    const code = codeOnly(read(ROUTE))
    expect(code, "must branch on territory.status === 'draft'").toMatch(
      /territory\.status\s*===\s*['"]draft['"]/,
    )
    expect(code, "must set status to 'available'").toMatch(/status\s*[:=]\s*['"]available['"]/)
  })

  it('only flips FROM draft — the available assignment follows the draft check, not unconditional', () => {
    const code = codeOnly(read(ROUTE))
    const guardAt = code.search(/territory\.status\s*===\s*['"]draft['"]/)
    const flipAt = code.search(/status\s*[:=]\s*['"]available['"]/)
    expect(guardAt, 'the draft check must be present').toBeGreaterThanOrEqual(0)
    expect(flipAt, "the 'available' assignment must be present").toBeGreaterThanOrEqual(0)
    expect(flipAt, 'the flip must be guarded by (follow) the draft check').toBeGreaterThan(guardAt)
  })

  it('flips after the sold/reserved/qa_locked refusals (only on the success path)', () => {
    const code = codeOnly(read(ROUTE))
    const soldAt = code.indexOf("=== 'sold'")
    const flipAt = code.search(/status\s*[:=]\s*['"]available['"]/)
    expect(soldAt, 'the sold refusal must be present').toBeGreaterThanOrEqual(0)
    expect(flipAt, 'the flip must come after the refusal guards').toBeGreaterThan(soldAt)
  })
})
