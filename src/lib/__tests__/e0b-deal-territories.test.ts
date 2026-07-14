import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { STAGE } from '../pipeline-stages'

/**
 * E-0b Deal Territories guardrails. Source-scan idiom (no RTL/jsdom), twin of
 * national-status-map.test.ts. Enforces the invariants this sprint's safety rests on:
 *   1. STAGE.FUNDED_WON === 11, so the close trigger's hardcoded `11` (which SQL
 *      cannot import) can't silently desync from pipeline-stages.ts — a renumber that
 *      shifted Funded/Won would otherwise stamp $179K territories sold at the wrong stage.
 *   2. The close trigger + sold-summary function are locked-down SECURITY DEFINER
 *      objects: search_path pinned, the trigger function callable by NOBODY via RPC,
 *      the sold-summary readable by authenticated only (never anon).
 *   3. The RLS rewrite re-establishes designation independently (E-0a failure mode)
 *      and drops the over-broad internal_users_all.
 *   4. The reworked index surfaces are token-clean (Hard Rule 8).
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Strip comments so ABSENCE checks aren't fooled by documentation. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const PAGE = 'src/app/(app)/territories/page.tsx'
const INDEX = 'src/components/territories/TerritoriesIndex.tsx'

const RAW_TAILWIND_COLOR =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/

function migrationPath(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) => f.endsWith('_e0b_deal_territories.sql'))
  if (!hit) throw new Error('e0b_deal_territories migration not found')
  return `${dir}/${hit}`
}

describe('e0b — Funded/Won stage literal pin', () => {
  it('STAGE.FUNDED_WON === 11 (the close trigger hardcodes this; keep them in lockstep)', () => {
    expect(STAGE.FUNDED_WON).toBe(11)
  })

  it('the migration references STAGE.FUNDED_WON and guards on the 11 crossing', () => {
    const raw = read(migrationPath())
    expect(raw, 'migration must reference STAGE.FUNDED_WON so the tie is discoverable').toContain(
      'STAGE.FUNDED_WON',
    )
    const code = codeOnly(raw)
    // First-crossing guard: old below, new at/above, idempotency via funded_won_at IS NULL.
    expect(code).toMatch(/old\.stage\s*<\s*11/i)
    expect(code).toMatch(/new\.stage\s*>=\s*11/i)
    expect(code).toMatch(/new\.funded_won_at\s+is\s+null/i)
  })
})

describe('e0b — close trigger is a locked-down SECURITY DEFINER object', () => {
  const code = codeOnly(read(migrationPath()))

  it('BEFORE UPDATE OF stage, SECURITY DEFINER, empty search_path', () => {
    expect(code).toMatch(/before\s+update\s+of\s+stage\s+on\s+public\.prospects/i)
    expect(code).toMatch(/security\s+definer/i)
    expect(code).toMatch(/set\s+search_path\s*=\s*''/i)
  })

  it('excludes qa_locked territories from the sold-stamp (guard-trigger cooperation)', () => {
    expect(code).toMatch(/coalesce\(qa_locked,\s*false\)\s*=\s*false/i)
  })

  it('revokes ALL execute on the trigger function (never PostgREST-callable)', () => {
    expect(code).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.stamp_prospect_funded_won\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    )
    // No path grants it back to anyone.
    expect(code).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.stamp_prospect_funded_won/i)
  })
})

describe('e0b — territory_sold_summary() exposes no addressable/census', () => {
  const code = codeOnly(read(migrationPath()))

  it('is SECURITY DEFINER, authenticated-only, never anon', () => {
    expect(code).toMatch(/security\s+definer/i)
    expect(code).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.territory_sold_summary\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    )
    expect(code).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.territory_sold_summary\(\)\s+to\s+authenticated/i,
    )
    expect(code).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.territory_sold_summary\(\)\s+to\s+anon/i)
  })

  it('gates rows on internal_users membership and only projects sold rows', () => {
    expect(code).toMatch(/from\s+public\.internal_users\s+me\s+where\s+me\.user_id\s*=\s*auth\.uid\(\)/i)
    expect(code).toMatch(/t\.status\s*=\s*'sold'/i)
  })

  it('never selects an addressable or census column (leak-proof by omission)', () => {
    // Scope to the function DEFINITION body only — the RETURNS TABLE signature + SELECT,
    // from `create ... function` up to the closing `$$;`. The COMMENT ON string
    // legitimately DESCRIBES the omission (naming addressable/census), so scanning the
    // whole migration would false-positive; the guarantee is that the body itself
    // projects neither token (it selects only the 6 minimal columns).
    const body = code.match(
      /create\s+or\s+replace\s+function\s+public\.territory_sold_summary\(\)[\s\S]*?\$\$;/i,
    )?.[0]
    expect(body, 'sold-summary function definition must be found').toBeTruthy()
    expect(body).not.toMatch(/addressable/i)
    expect(body).not.toMatch(/census/i)
    // Positive: it DOES project the minimal columns.
    expect(body).toMatch(/sold_to_practice/i)
    expect(body).toMatch(/closed_by_name/i)
  })
})

describe('e0b — RLS rewrite (rep-siloed, designation independently re-established)', () => {
  const code = codeOnly(read(migrationPath()))

  it('drops the over-broad internal_users_all policy', () => {
    expect(code).toMatch(/drop\s+policy\s+if\s+exists\s+internal_users_all\s+on\s+public\.territories/i)
  })

  it('rep_read requires designation=rep independently (not a bare uid/prospect match)', () => {
    // The E-0a failure mode: authorizing on a uid/ownership match alone. Every rep policy
    // must independently prove the caller is a rep.
    expect(code).toMatch(/create\s+policy\s+rep_read/i)
    expect(code).toMatch(/iu\.designation\s*=\s*'rep'/i)
  })

  it('exec_all is scoped to executives', () => {
    expect(code).toMatch(/create\s+policy\s+exec_all/i)
    expect(code).toMatch(/iu\.designation\s*=\s*'executive'/i)
  })
})

describe('e0b — token-clean index surfaces (Hard Rule 8)', () => {
  for (const file of [PAGE, INDEX]) {
    it(`${file} exists`, () => {
      expect(existsSync(join(process.cwd(), file))).toBe(true)
    })
    it(`${file} uses no raw default-palette Tailwind color utilities`, () => {
      expect(codeOnly(read(file))).not.toMatch(RAW_TAILWIND_COLOR)
    })
    it(`${file} contains no raw hex`, () => {
      expect(codeOnly(read(file))).not.toMatch(RAW_HEX)
    })
  }
})
