import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural guardrails for the tokenized new-prospect form (2026-07-12). The list page was
 * tokenized in PR #114; this follow-up brings the new-prospect form onto the design system.
 * Pins the primitive swap and the removal of raw gray/red/blue utilities so a future edit
 * can't regress them. Comment-stripped so documentation can't fake a match.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const PAGE = 'src/app/(app)/prospects/new/page.tsx'

describe('prospects new-form tokenize', () => {
  const code = codeOnly(read(PAGE))

  it('exists', () => {
    expect(existsSync(join(process.cwd(), PAGE))).toBe(true)
  })

  it('is on design tokens — no raw gray/red/blue Tailwind utilities remain', () => {
    expect(code).not.toMatch(/\b(bg|text|border|hover:bg|hover:text)-(gray|red|blue)-\d{2,3}/)
  })

  it('uses the shared design-system primitives (Input, Button, Card)', () => {
    expect(code).toMatch(/from ['"]@\/components\/ui\/Input['"]/)
    expect(code).toMatch(/from ['"]@\/components\/ui\/Button['"]/)
    expect(code).toMatch(/from ['"]@\/components\/ui\/Card['"]/)
  })

  it('hand-rolls no raw styled <input>/<button> markup', () => {
    expect(code).not.toMatch(/<input\b/)
    expect(code).not.toMatch(/<button\b/)
  })

  it('preserves the prospect-insert submit contract', () => {
    expect(code).toContain('buildProspectInsert')
  })
})
