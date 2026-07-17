import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { STAGE } from '../pipeline-stages'
import { TERRITORY_STANDARD_PRICE } from '../../components/proposal/constants'
import { resolveLeadingDeal } from '../leading-deal'

/**
 * Multi-Deal Pipeline guardrails (partial revision of decision #53 item A).
 * Source-scan idiom — twin of e0b-deal-territories.test.ts. Pins the invariants
 * the build's safety rests on:
 *   1. Stage literals hardcoded in SQL (11 = Funded/Won close crossing,
 *      6 = qualification-gate boundary) stay in lockstep with pipeline-stages.ts.
 *   2. The $179,000 literal in the deal-creating functions stays in lockstep
 *      with TERRITORY_STANDARD_PRICE.
 *   3. Every new SECURITY DEFINER object is locked down (search_path pinned,
 *      trigger functions PostgREST-unreachable, client-callable functions
 *      identity-gated and never granted to anon).
 *   4. The write-path rewiring holds: moveProspectStage routes deal-backed moves
 *      through move_deal_stage()/ensure_priced_deal(), and DealStatusSelector
 *      routes through set_customer_deal_status() — no direct client write of a
 *      derived column comes back.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Strip SQL/TS comments so ABSENCE checks aren't fooled by documentation. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*--.*$/gm, '')
}

function migrationPath(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) =>
    f.endsWith('_multi_deal_pipeline.sql'),
  )
  if (!hit) throw new Error('multi_deal_pipeline migration not found')
  return `${dir}/${hit}`
}

const MIGRATION_RAW = read(migrationPath())
const MIGRATION = codeOnly(MIGRATION_RAW)
const ACTIONS = read('src/app/(app)/pipeline/actions.ts')
const SELECTOR = read('src/components/DealStatusSelector.tsx')

// ─────────────────────────────────────────────────────────────────────────────
// 1. Stage-literal pins (SQL cannot import TS constants)
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-deal — stage literal pins', () => {
  it('STAGE.FUNDED_WON === 11 (deal close trigger + derivation hardcode this)', () => {
    expect(STAGE.FUNDED_WON).toBe(11)
  })

  it('STAGE.PROPOSAL_SENT === 6 (move_deal_stage qualification-gate boundary hardcodes this)', () => {
    expect(STAGE.PROPOSAL_SENT).toBe(6)
  })

  it('the migration ties its literals back to the constants by name (discoverability)', () => {
    expect(MIGRATION_RAW).toContain('STAGE.FUNDED_WON')
    expect(MIGRATION_RAW).toContain('STAGE.PROPOSAL_SENT')
  })

  it('deal close trigger guards the 11-crossing with the idempotency stamp', () => {
    expect(MIGRATION).toMatch(/old\.stage\s*<\s*11/i)
    expect(MIGRATION).toMatch(/new\.stage\s*>=\s*11/i)
    expect(MIGRATION).toMatch(/new\.funded_won_at\s+is\s+null/i)
  })

  it('move_deal_stage enforces the qualification gate on the below-6 → 6+ crossing', () => {
    expect(MIGRATION).toMatch(/v_deal_stage\s*<\s*6\s+and\s+p_target_stage\s*>=\s*6/i)
    expect(MIGRATION).toMatch(/recommendation\s*=\s*'proceed'/i)
  })

  it('stage domain CHECK matches the pipeline bounds (1..12)', () => {
    expect(STAGE.NEW_LEAD).toBe(1)
    expect(STAGE.IMPLEMENTATION_HANDOFF_SCHEDULED).toBe(12)
    expect(MIGRATION).toMatch(/check\s*\(stage\s+between\s+1\s+and\s+12\)/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Price literal pin
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-deal — standard price pin', () => {
  it('TERRITORY_STANDARD_PRICE === 179000 (create_territory_deal / ensure_priced_deal hardcode it)', () => {
    expect(TERRITORY_STANDARD_PRICE).toBe(179000)
  })

  it('create_territory_deal inserts at the standard price', () => {
    expect(MIGRATION).toMatch(/insert into public\.deals[\s\S]*?179000/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. SECURITY DEFINER lockdown
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-deal — SECURITY DEFINER objects are locked down', () => {
  const TRIGGER_FNS = [
    'recompute_prospect_pipeline()',
    'recompute_prospect_pipeline_for(uuid)',
    'guard_prospect_stage_derivation()',
    'stamp_deal_funded_won()',
  ]
  const CLIENT_FNS = [
    'create_territory_deal(uuid, uuid)',
    'move_deal_stage(uuid, integer)',
    'set_customer_deal_status(uuid, text)',
    'set_deal_status(uuid, text)',
  ]

  it('every new function pins an empty search_path', () => {
    // One "set search_path = ''" per created function in this migration.
    const created = MIGRATION.match(/create or replace function/gi) ?? []
    const pinned = MIGRATION.match(/set\s+search_path\s*=\s*''/gi) ?? []
    expect(pinned.length).toBe(created.length)
  })

  it.each(TRIGGER_FNS)('trigger/worker %s is PostgREST-unreachable (revoked from all, never re-granted)', (fn) => {
    const esc = fn.replace(/[()]/g, '\\$&').replace(/, /g, ',\\s*')
    expect(MIGRATION).toMatch(
      new RegExp(`revoke all on function public\\.${esc} from public,\\s*anon,\\s*authenticated`, 'i'),
    )
    expect(MIGRATION).not.toMatch(new RegExp(`grant execute on function public\\.${esc}`, 'i'))
  })

  it.each(CLIENT_FNS)('client function %s is revoked from anon and granted to authenticated only', (fn) => {
    const esc = fn.replace(/[()]/g, '\\$&').replace(/, /g, ',\\s*')
    expect(MIGRATION).toMatch(
      new RegExp(`revoke all on function public\\.${esc} from public,\\s*anon,\\s*authenticated`, 'i'),
    )
    expect(MIGRATION).toMatch(
      new RegExp(`grant execute on function public\\.${esc} to authenticated`, 'i'),
    )
    expect(MIGRATION).not.toMatch(new RegExp(`grant execute on function public\\.${esc} to anon`, 'i'))
  })

  it('the deal close trigger excludes qa_locked territories (guard-trigger cooperation)', () => {
    expect(MIGRATION).toMatch(/coalesce\(t\.qa_locked,\s*false\)\s*=\s*false/i)
  })

  it('the deals write surface is fully revoked for authenticated (INSERT stays revoked; UPDATE joins it)', () => {
    expect(MIGRATION).toMatch(/revoke update on public\.deals from authenticated/i)
    // No path in this migration grants any table write back to authenticated.
    expect(MIGRATION).not.toMatch(/grant\s+(insert|update|delete)[^)]*on public\.deals to authenticated/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Write-path rewiring holds
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-deal — app write paths route through the governed RPCs', () => {
  it('moveProspectStage moves deal-backed prospects via move_deal_stage()', () => {
    expect(ACTIONS).toMatch(/\.rpc\('move_deal_stage'/)
  })

  it('moveProspectStage still records the close price via ensure_priced_deal()', () => {
    expect(ACTIONS).toMatch(/\.rpc\('ensure_priced_deal'/)
  })

  it('DealStatusSelector routes through set_customer_deal_status(), never a direct prospects update', () => {
    expect(SELECTOR).toMatch(/\.rpc\('set_customer_deal_status'/)
    expect(codeOnly(SELECTOR)).not.toMatch(/from\('prospects'\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. resolveLeadingDeal (the record a customer-level move targets)
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-deal — resolveLeadingDeal', () => {
  const deal = (id: string, stage: number, deal_status = 'active', created_at = '2026-07-01T00:00:00Z') => ({
    id,
    stage,
    deal_status,
    created_at,
  })

  it('returns null when there are no deals', () => {
    expect(resolveLeadingDeal([])).toBeNull()
  })

  it('returns null when every deal is lost (customer stage is frozen, nothing to move)', () => {
    expect(resolveLeadingDeal([deal('a', 6, 'lost'), deal('b', 4, 'lost')])).toBeNull()
  })

  it('picks the max-stage non-lost deal', () => {
    const r = resolveLeadingDeal([deal('low', 3), deal('high', 9), deal('lost', 11, 'lost')])
    expect(r?.id).toBe('high')
  })

  it('the board reflects MAX over non-lost deals — the leading deal IS the displayed record', () => {
    // Funded/Won customer with an earlier-stage second negotiation: the customer
    // card shows stage 11 and dragging it targets the stage-11 deal, never the
    // in-flight second deal.
    const r = resolveLeadingDeal([deal('won', 11), deal('second', 6)])
    expect(r?.id).toBe('won')
  })

  it('ties break to the most recently created deal', () => {
    const r = resolveLeadingDeal([
      deal('older', 5, 'active', '2026-07-01T00:00:00Z'),
      deal('newer', 5, 'active', '2026-07-10T00:00:00Z'),
    ])
    expect(r?.id).toBe('newer')
  })

  it('stalled deals still lead (stalled ≠ lost; only lost is excluded)', () => {
    const r = resolveLeadingDeal([deal('stalled', 8, 'stalled'), deal('active', 4)])
    expect(r?.id).toBe('stalled')
  })
})
