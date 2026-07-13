import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural guardrail for the Deal Territories list draft filter (2026-07-12). Since PR #114
 * shipped the New Territory creation flow, a fresh status='draft' row is visible to reps on this
 * list the moment it's created — before sizing, before it's a real decision. This pins the fix:
 * non-executive viewers must have status='draft' rows excluded from the query; executives keep
 * full visibility. Comment-stripped so documentation can't fake a match.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const PAGE = 'src/app/(app)/territories/page.tsx'

describe('territories list draft filter', () => {
  const code = codeOnly(read(PAGE))

  it('exists', () => {
    expect(existsSync(join(process.cwd(), PAGE))).toBe(true)
  })

  it('resolves the executive designation to gate visibility', () => {
    expect(code).toContain('getViewerDesignation')
    expect(code).toMatch(/isExec/)
  })

  it('excludes draft territories for non-executive viewers only', () => {
    // The draft filter must be guarded behind a non-exec branch, not applied
    // unconditionally (execs still see drafts).
    expect(code).toMatch(/if\s*\(\s*!isExec\s*\)/)
  })

  it('filters drafts with NULL-preserving semantics (IS DISTINCT FROM), not a bare neq', () => {
    // status is `text default 'available'` (nullable) and most existing territories carry a
    // legacy NULL status. A bare .neq('status','draft') compiles to `status <> 'draft'`, which
    // is NULL (not true) for NULL-status rows and would silently hide the bulk of the table from
    // reps. The fix must express `status IS DISTINCT FROM 'draft'` via an OR that keeps NULLs.
    expect(code).toMatch(/\.or\(\s*['"]status\.is\.null,status\.neq\.draft['"]\s*\)/)
    expect(code).not.toMatch(/query\s*=\s*query\.neq\(\s*['"]status['"]\s*,\s*['"]draft['"]\s*\)/)
  })

  it('applies the draft filter exactly once (execs retain full draft visibility)', () => {
    const orMatches = code.match(/\.or\(\s*['"]status\.is\.null,status\.neq\.draft['"]\s*\)/g) ?? []
    expect(orMatches).toHaveLength(1)
  })
})
