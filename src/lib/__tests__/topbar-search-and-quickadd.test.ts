import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural guardrails for the TopBar global search + quick-add (2026-07-11). Pins that the
 * search is actually wired (not the old presentational dead-stub) and that the exec-only
 * "New Territory" quick-add stays gated on designation. Comment-stripped so prose can't fake it.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const TOPBAR = 'src/components/shell/TopBar.tsx'

describe('TopBar search + quick-add', () => {
  const code = codeOnly(read(TOPBAR))

  it('actually queries — ilike against prospects and territories', () => {
    expect(code).toContain('.ilike(')
    expect(code).toContain("from('prospects')")
    expect(code).toContain("from('territories')")
  })

  it('uses the escaped search helper rather than raw interpolation', () => {
    expect(code).toContain('ilikeContains')
    expect(code).toContain('normalizeSearchTerm')
  })

  it('links results to prospect and territory detail pages', () => {
    expect(code).toContain('/prospects/')
    expect(code).toContain('/territories/')
  })

  it('offers New Prospect to everyone but gates New Territory on executive designation', () => {
    expect(code).toContain('/prospects/new')
    expect(code).toContain('/territories/new')
    // the exec-only branch must guard the New Territory link
    expect(code).toMatch(/isExec\s*&&[\s\S]*\/territories\/new/)
  })

  it('accepts the designation prop (threaded from the server layout)', () => {
    expect(code).toMatch(/designation\s*:?\s*(Designation|.*Designation)/)
  })
})
