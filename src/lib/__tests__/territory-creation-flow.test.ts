import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural guardrails for the territory-creation entry point (2026-07-11). Pins the two
 * correctness requirements: (1) creation is executive-gated, (2) the flow NEVER sizes with an
 * ad-hoc center — it inserts a draft row and hands off to /territories/[id], where the existing
 * V3SizingPanel sizes by territoryId so sold-boundary clipping (§8.4) applies (brief AC3/AC4).
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const CREATE_ROUTE = 'src/app/api/territories/route.ts'
const NEW_PAGE = 'src/app/(app)/territories/new/page.tsx'
const FORM = 'src/components/territory/NewTerritoryForm.tsx'

describe('territory create route', () => {
  const code = codeOnly(read(CREATE_ROUTE))

  it('is executive-gated', () => {
    expect(code).toContain('viewerIsExecutive')
  })

  it("inserts a draft-status territory row", () => {
    expect(code).toMatch(/status:\s*['"]draft['"]/)
  })

  it('does not enqueue sizing itself (no ad-hoc center path)', () => {
    expect(code).not.toContain('/api/territories/size')
  })
})

describe('new territory page', () => {
  const code = codeOnly(read(NEW_PAGE))

  it('exists and is executive-gated with a redirect for non-execs', () => {
    expect(existsSync(join(process.cwd(), NEW_PAGE))).toBe(true)
    expect(code).toContain('getViewerDesignation')
    expect(code).toMatch(/redirect\(\s*['"]\/territories['"]\s*\)/)
  })
})

describe('new territory form', () => {
  const code = codeOnly(read(FORM))

  it('creates via POST /api/territories and hands off to the detail page', () => {
    expect(code).toContain("'/api/territories'")
    expect(code).toMatch(/\/territories\/\$\{[^}]*id[^}]*\}/)
  })

  it('never sizes with an ad-hoc center (that path only belongs to /territories/[id])', () => {
    expect(code).not.toContain('/api/territories/size')
  })
})

describe('territory_status_map draft exclusion migration', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(join(process.cwd(), dir)).find((f) =>
    f.includes('territory_status_map_exclude_draft'),
  )

  it('exists', () => {
    expect(file).toBeTruthy()
  })

  it('excludes draft rows while preserving the boundary_geojson leak fix', () => {
    const sql = read(join(dir, file as string))
    expect(sql).toMatch(/status\s+is\s+distinct\s+from\s+'draft'/i)
    // leak fix must survive the CREATE OR REPLACE
    expect(sql).toContain('GeometryCollection')
    expect(sql.toLowerCase()).toContain('security definer')
  })
})
