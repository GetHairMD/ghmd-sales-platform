import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { STAGE } from '../pipeline-stages'

/**
 * National Territory Status Map guardrails (decision #121 / #122 / #132).
 *
 * No RTL/jsdom — same source-scan idiom as app-shell-chrome-guardrails /
 * public-proposal-guardrails. Enforces three invariants the map's safety rests on:
 *   1. STAGE.PROPOSAL_SENT === 6, so the SQL function's hardcoded `6` (which SQL
 *      cannot import) can't silently desync from pipeline-stages.ts.
 *   2. The map component + page are token-clean (Hard Rule 8): no raw default-palette
 *      Tailwind utilities, no raw hex — colors come only from `@/design/tokens`.
 *   3. The territory_status_map() migration is a locked-down SECURITY DEFINER function
 *      (never callable by anon) that exposes sold_to_name ONLY for sold rows.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Executable-code view: strip block + line comments so an ABSENCE check (no hex, no
 * raw palette class) can't be fooled by documentation that legitimately names a hex
 * (the component annotates each token with its hex in comments for clarity). Same
 * stripper as app-shell-chrome-guardrails.test.ts.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (spare http://)
}

const MAP_COMPONENT = 'src/components/NationalStatusMap.tsx'
const MAP_PAGE = 'src/app/(app)/national-map/page.tsx'

/** Locate the migration by name (timestamp-prefixed) so a re-timestamp doesn't break this. */
function migrationPath(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) => f.endsWith('_national_status_map.sql'))
  if (!hit) throw new Error('national_status_map migration not found')
  return `${dir}/${hit}`
}

// Default-palette Tailwind color families with a numeric suffix — the raw utilities
// Hard Rule 8 bans (bg-gray-100, text-green-700, …). Semantic tokens like
// `text-text-muted` / `border-mist` / `bg-bg-subtle` are intentionally NOT matched.
const RAW_TAILWIND_COLOR =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/

describe('national map — STAGE literal pin (#132 §2/§5)', () => {
  it('STAGE.PROPOSAL_SENT === 6 (the SQL function hardcodes this; keep them in lockstep)', () => {
    // territory_status_map() derives in_pipeline at `p.stage >= 6`. SQL can't import
    // this constant — if it ever changes, change the migration's literal too.
    expect(STAGE.PROPOSAL_SENT).toBe(6)
  })

  it('the migration pins its literal to pipeline-stages.ts and uses stage >= 6', () => {
    const raw = read(migrationPath())
    expect(raw, 'migration must reference STAGE.PROPOSAL_SENT so the tie is discoverable').toContain(
      'STAGE.PROPOSAL_SENT',
    )
    expect(codeOnly(raw)).toMatch(/p\.stage\s*>=\s*6/)
  })
})

describe('national map — token-clean surfaces (Hard Rule 8)', () => {
  for (const file of [MAP_COMPONENT, MAP_PAGE]) {
    it(`${file} exists`, () => {
      expect(existsSync(join(process.cwd(), file))).toBe(true)
    })
    it(`${file} uses no raw default-palette Tailwind color utilities`, () => {
      expect(codeOnly(read(file))).not.toMatch(RAW_TAILWIND_COLOR)
    })
    it(`${file} contains no raw hex (colors come from @/design/tokens)`, () => {
      expect(codeOnly(read(file))).not.toMatch(RAW_HEX)
    })
  }

  it('the component sources its colors from the design tokens', () => {
    expect(read(MAP_COMPONENT)).toContain("from '@/design/tokens'")
  })
})

describe('national map — territory_status_map() is a locked-down SECURITY DEFINER fn (#132 §2)', () => {
  const code = codeOnly(read(migrationPath()))

  it('is SECURITY DEFINER with a pinned public search_path', () => {
    expect(code).toMatch(/security\s+definer/i)
    expect(code).toMatch(/set\s+search_path\s*=\s*public/i)
  })

  it('strips the default grant and grants EXECUTE to authenticated only — never anon', () => {
    expect(code).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.territory_status_map\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    )
    expect(code).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.territory_status_map\(\)\s+to\s+authenticated/i,
    )
    // No path grants EXECUTE to anon.
    expect(code).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.territory_status_map\(\)\s+to\s+anon/i)
  })

  it('gates every returned row on internal_users membership', () => {
    expect(code).toMatch(/from\s+public\.internal_users\s+iu\s+where\s+iu\.user_id\s*=\s*auth\.uid\(\)/i)
  })

  it('exposes sold_to_name ONLY for sold rows (null otherwise)', () => {
    // The single source of sold_to_name is guarded by status = 'sold'.
    expect(code).toMatch(/case\s+when\s+t\.status\s*=\s*'sold'\s+then\s+p\.full_name\s+else\s+null\s+end/i)
  })
})

describe('national map — boundary_geojson is normalized to bare geometry (leak fix)', () => {
  const code = codeOnly(read(migrationPath()))

  it('strips GeoJSON properties: a Feature yields only its geometry', () => {
    expect(code).toMatch(/when\s+t\.boundary_geojson->>'type'\s*=\s*'Feature'\s+then\s+t\.boundary_geojson->'geometry'/i)
  })

  it('a FeatureCollection becomes a GeometryCollection of EVERY feature (no ->0 truncation)', () => {
    expect(code).toMatch(/jsonb_agg\(feat->'geometry'\)/i)
    expect(code).toMatch(/jsonb_array_elements\(t\.boundary_geojson->'features'\)/i)
    // Must NOT cherry-pick the first feature only.
    expect(code, 'must not truncate a FeatureCollection to its first feature').not.toMatch(
      /boundary_geojson->'features'->0/i,
    )
  })

  it('validates the geometry type on the fallback branch and defaults to null', () => {
    expect(code).toMatch(/when\s+t\.boundary_geojson->>'type'\s+in\s*\(/i)
    expect(code).toMatch(/else\s+null\s+end\s+as\s+boundary_geojson/i)
  })

  it('never selects a properties key anywhere in the function body', () => {
    // Belt-and-braces: the whole point is that no `properties` blob crosses the wire.
    expect(code).not.toMatch(/->\s*'properties'/i)
    expect(code).not.toMatch(/->>\s*'properties'/i)
  })
})
