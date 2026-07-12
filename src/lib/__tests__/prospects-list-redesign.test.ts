import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural guardrails for the redesigned Prospects list (2026-07-11). Pins the fixes for
 * the silent data-visibility defects (archived leak, 50-row cliff) and the token migration so
 * a future edit can't regress them. Comment-stripped so documentation can't fake a match.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const PAGE = 'src/app/(app)/prospects/page.tsx'

describe('prospects list redesign', () => {
  const code = codeOnly(read(PAGE))

  it('exists', () => {
    expect(existsSync(join(process.cwd(), PAGE))).toBe(true)
  })

  it('excludes archived prospects', () => {
    expect(code).toMatch(/\.eq\(\s*['"]archived['"]\s*,\s*false\s*\)/)
  })

  it('has no silent 50-row cliff (the old hard .limit(50))', () => {
    expect(code).not.toContain('.limit(50)')
  })

  it('groups by deal health rather than a flat date sort', () => {
    expect(code).toContain('groupProspectsByDealStatus')
  })

  it('is on design tokens — no raw gray/red/blue Tailwind utilities remain', () => {
    expect(code).not.toMatch(/\b(bg|text|border|hover:bg|hover:text)-(gray|red|blue)-\d{2,3}/)
  })
})
