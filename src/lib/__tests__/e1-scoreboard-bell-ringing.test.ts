import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { NAV_ITEMS, navItemsFor } from '../../components/shell/nav-items'
import { TERRITORY_STANDARD_PRICE } from '../../components/proposal/constants'
import {
  monthKey,
  previousMonthKey,
  currentMonthKey,
  computePipelineValue,
  computeCurrentStreak,
  toScoreboardRow,
  rankRows,
  sortRows,
  type ScoreboardSummaryRow,
} from '../scoreboard/scoreboard'

/**
 * E-1 Scoreboard + Bell Ringing guardrails. Two layers, matching the repo idiom:
 *   • pure-function unit tests for the two computed figures the SQL deliberately does
 *     NOT return — current_streak (calendar boundaries) and pipeline_value (single-
 *     source price arithmetic) — plus the RPC→view-model mapper.
 *   • source-scan security invariants on the migration (SECURITY DEFINER lockdown,
 *     grant discipline, minimal-disclosure boundary of scoreboard_summary, no client
 *     write path on community_board_posts) and token-cleanliness (Hard Rule 8) on the
 *     new surfaces. Comment-stripped so ABSENCE checks can't be fooled by prose.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Strip SQL comments too, for the migration scans. */
function sqlCodeOnly(src: string): string {
  return src.replace(/--.*$/gm, '')
}

const RAW_TAILWIND_COLOR =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/

const PAGE = 'src/app/(app)/scoreboard/page.tsx'
const CLIENT = 'src/components/scoreboard/Scoreboard.tsx'
const PANEL = 'src/components/ui/SlideOverDetailPanel.tsx'
const LIB = 'src/lib/scoreboard/scoreboard.ts'

function migrationPath(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) =>
    f.endsWith('_e1_scoreboard_bell_ringing.sql'),
  )
  if (!hit) throw new Error('e1_scoreboard_bell_ringing migration not found')
  return `${dir}/${hit}`
}

function lockdownMigrationPath(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) =>
    f.endsWith('_prospects_funded_won_at_client_write_lockdown.sql'),
  )
  if (!hit) throw new Error('prospects_funded_won_at_client_write_lockdown migration not found')
  return `${dir}/${hit}`
}

/** Follow-up #2: the canonical scoreboard_summary() definition (streak in SQL). */
function streakMigrationPath(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) =>
    f.endsWith('_scoreboard_summary_streak_in_sql.sql'),
  )
  if (!hit) throw new Error('scoreboard_summary_streak_in_sql migration not found')
  return `${dir}/${hit}`
}

// ─────────────────────────────────────────────────────────────────────────────
// current_streak — TEST-ONLY REFERENCE IMPLEMENTATION of the SQL streak semantics.
// The live streak is computed in scoreboard_summary() (SQL, follow-up #2) and re-proven
// live by the rolled-back adversarial test; these cases pin the intended semantics at
// every calendar boundary that a single live run can't exhaustively cover.
// ─────────────────────────────────────────────────────────────────────────────
describe('computeCurrentStreak (reference impl) — consecutive months walking back from the reference', () => {
  it('empty history is a 0 streak', () => {
    expect(computeCurrentStreak([], '2026-07')).toBe(0)
  })

  it('a single close in the current month is a 1 streak', () => {
    expect(computeCurrentStreak(['2026-07'], '2026-07')).toBe(1)
  })

  it('two consecutive months (incl. current) is a 2 streak', () => {
    expect(computeCurrentStreak(['2026-07', '2026-06'], '2026-07')).toBe(2)
  })

  it('a gap stops the walk (04 does not count once 05 is missing)', () => {
    expect(computeCurrentStreak(['2026-07', '2026-06', '2026-04'], '2026-07')).toBe(2)
  })

  it('no close in the current month is a 0 streak (run must anchor at current month)', () => {
    expect(computeCurrentStreak(['2026-06', '2026-05'], '2026-07')).toBe(0)
  })

  it('walks correctly across a year boundary', () => {
    expect(computeCurrentStreak(['2026-01', '2025-12', '2025-11'], '2026-01')).toBe(3)
  })

  it('a gap across the year boundary stops the walk', () => {
    expect(computeCurrentStreak(['2026-01', '2025-11'], '2026-01')).toBe(1)
  })

  it('is order-independent and dedupes repeated months', () => {
    expect(computeCurrentStreak(['2026-06', '2026-07', '2026-07', '2026-05'], '2026-07')).toBe(3)
  })
})

describe('month-key helpers', () => {
  it('monthKey buckets a Date by its UTC year-month', () => {
    expect(monthKey(new Date(Date.UTC(2026, 6, 5, 12, 0, 0)))).toBe('2026-07') // month index 6 = July
    expect(monthKey(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))).toBe('2026-01')
  })

  it('previousMonthKey steps back one month, wrapping the year at January', () => {
    expect(previousMonthKey('2026-07')).toBe('2026-06')
    expect(previousMonthKey('2026-01')).toBe('2025-12')
  })

  it('currentMonthKey uses the injected date deterministically', () => {
    expect(currentMonthKey(new Date(Date.UTC(2026, 3, 20)))).toBe('2026-04')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Pure functions — pipeline_value (AC8 arithmetic, single-source price)
// ─────────────────────────────────────────────────────────────────────────────
describe('computePipelineValue — active count × single-source territory price', () => {
  it('zero active pipeline is $0', () => {
    expect(computePipelineValue(0)).toBe(0)
  })

  it('one active deal equals exactly the single-source price constant', () => {
    expect(computePipelineValue(1)).toBe(TERRITORY_STANDARD_PRICE)
  })

  it('multiplies linearly by the active count', () => {
    expect(computePipelineValue(3)).toBe(3 * TERRITORY_STANDARD_PRICE)
  })

  it('uses the $179,000 Key Reference Value (guards accidental constant drift)', () => {
    expect(TERRITORY_STANDARD_PRICE).toBe(179000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RPC → view-model mapper + ranking
// ─────────────────────────────────────────────────────────────────────────────
describe('toScoreboardRow + ranking', () => {
  const base: ScoreboardSummaryRow = {
    rep_id: 'r1',
    rep_name: 'Alex Rivera',
    deals_closed_count: 2,
    active_pipeline_count: 3,
    proposal_engagement_score: 9,
    current_streak: 2,
  }

  it('maps aggregate fields, passes streak through, derives only pipeline_value', () => {
    const row = toScoreboardRow(base)
    expect(row).toEqual({
      repId: 'r1',
      repName: 'Alex Rivera',
      dealsClosed: 2,
      pipelineValue: 3 * TERRITORY_STANDARD_PRICE,
      proposalEngagement: 9,
      currentStreak: 2, // straight from the RPC (computed in SQL)
    })
  })

  it('falls back to a generic label when rep_name is empty/whitespace', () => {
    expect(toScoreboardRow({ ...base, rep_name: '   ' }).repName).toBe('Unnamed rep')
  })

  it('a zero-deal rep maps to zeros without throwing', () => {
    const row = toScoreboardRow({
      ...base,
      deals_closed_count: 0,
      active_pipeline_count: 0,
      current_streak: 0,
    })
    expect(row.dealsClosed).toBe(0)
    expect(row.pipelineValue).toBe(0)
    expect(row.currentStreak).toBe(0)
  })

  it('rankRows orders by deals closed desc, then pipeline value desc, then name', () => {
    const rows = [
      toScoreboardRow({ ...base, rep_id: 'a', rep_name: 'A', deals_closed_count: 1, active_pipeline_count: 1 }),
      toScoreboardRow({ ...base, rep_id: 'b', rep_name: 'B', deals_closed_count: 3, active_pipeline_count: 1 }),
      toScoreboardRow({ ...base, rep_id: 'c', rep_name: 'C', deals_closed_count: 3, active_pipeline_count: 5 }),
    ]
    expect(rankRows(rows).map((r) => r.repId)).toEqual(['c', 'b', 'a'])
  })

  it('sortRows sorts by a column with a stable name tiebreak', () => {
    const rows = [
      toScoreboardRow({ ...base, rep_id: 'a', rep_name: 'A', proposal_engagement_score: 5 }),
      toScoreboardRow({ ...base, rep_id: 'b', rep_name: 'B', proposal_engagement_score: 8 }),
    ]
    expect(sortRows(rows, 'proposalEngagement', 'desc').map((r) => r.repId)).toEqual(['b', 'a'])
    expect(sortRows(rows, 'proposalEngagement', 'asc').map((r) => r.repId)).toEqual(['a', 'b'])
    expect(sortRows(rows, 'repName', 'asc').map((r) => r.repId)).toEqual(['a', 'b'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Migration — SECURITY DEFINER lockdown + minimal-disclosure boundary
// ─────────────────────────────────────────────────────────────────────────────
describe('e1 migration — bell trigger is a locked-down SECURITY DEFINER object', () => {
  const code = sqlCodeOnly(read(migrationPath()))

  it('fires AFTER UPDATE on the funded_won_at NULL → non-NULL transition, once', () => {
    expect(code).toMatch(/after\s+update\s+on\s+public\.prospects/i)
    expect(code).toMatch(/when\s*\(\s*old\.funded_won_at\s+is\s+null\s+and\s+new\.funded_won_at\s+is\s+not\s+null\s*\)/i)
  })

  it('is SECURITY DEFINER with an empty search_path', () => {
    expect(code).toMatch(/create\s+or\s+replace\s+function\s+public\.ring_bell_on_funded_won\(\)/i)
    expect(code).toMatch(/security\s+definer/i)
    expect(code).toMatch(/set\s+search_path\s*=\s*''/i)
  })

  it('revokes ALL execute on the trigger function and never grants it back (no forgeable posts)', () => {
    expect(code).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.ring_bell_on_funded_won\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    )
    expect(code).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.ring_bell_on_funded_won/i)
  })
})

describe('e1 migration — community_board_posts has no client write path', () => {
  const code = sqlCodeOnly(read(migrationPath()))

  it('enables RLS and creates EXACTLY one policy — a SELECT for internal users', () => {
    expect(code).toMatch(/alter\s+table\s+public\.community_board_posts\s+enable\s+row\s+level\s+security/i)
    const policyCreates = code.match(/create\s+policy/gi) ?? []
    expect(policyCreates.length, 'only the SELECT policy may exist this PR').toBe(1)
    expect(code).toMatch(/create\s+policy\s+community_board_select_internal[\s\S]*?for\s+select/i)
    expect(code).toMatch(/from\s+public\.internal_users\s+iu\s+where\s+iu\.user_id\s*=\s*\(select\s+auth\.uid\(\)\)/i)
  })

  it('creates no INSERT / UPDATE / DELETE policy for any role', () => {
    expect(code).not.toMatch(/for\s+insert/i)
    expect(code).not.toMatch(/for\s+delete/i)
    // "after update" (the trigger) and "revoke ... update" must not be mistaken for a policy.
    expect(code).not.toMatch(/create\s+policy[\s\S]{0,300}for\s+update/i)
  })

  it('revokes the auto-granted write privileges from authenticated (fail closed at the grant layer too)', () => {
    expect(code).toMatch(/revoke\s+insert,\s*update,\s*delete,\s*truncate\s+on\s+public\.community_board_posts\s+from\s+authenticated/i)
  })
})

describe('scoreboard_summary() (follow-up #2) — aggregate-only, streak in SQL, no month detail', () => {
  // The canonical definition lives in the follow-up migration (DROP + recreate with a
  // new return shape); the E-1 migration's original is superseded.
  const code = sqlCodeOnly(read(streakMigrationPath()))
  const body =
    code.match(/create\s+function\s+public\.scoreboard_summary\(\)[\s\S]*?\$\$;/i)?.[0] ?? ''

  it('is SECURITY DEFINER, search_path pinned, authenticated-only, never anon', () => {
    expect(code).toMatch(/drop\s+function\s+if\s+exists\s+public\.scoreboard_summary\(\)/i)
    expect(code).toMatch(/create\s+function\s+public\.scoreboard_summary\(\)/i)
    expect(code).toMatch(/security\s+definer/i)
    expect(code).toMatch(/set\s+search_path\s*=\s*''/i)
    expect(code).toMatch(/revoke\s+all\s+on\s+function\s+public\.scoreboard_summary\(\)\s+from\s+public,\s*anon,\s*authenticated/i)
    expect(code).toMatch(/grant\s+execute\s+on\s+function\s+public\.scoreboard_summary\(\)\s+to\s+authenticated/i)
    expect(code).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.scoreboard_summary\(\)\s+to\s+anon/i)
  })

  it('returns current_streak (integer) and NO close_months / month-level detail', () => {
    expect(body, 'scoreboard_summary definition must be found').toBeTruthy()
    expect(body).toMatch(/current_streak\s+integer/i)
    expect(body).not.toMatch(/close_months/i)
    // No text[] month array leaves the function.
    expect(body).not.toMatch(/text\[\]/i)
  })

  it('gates rows on internal_users membership (fail closed for non-internal callers)', () => {
    expect(body).toMatch(/from\s+public\.internal_users\s+me\s+where\s+me\.user_id\s*=\s*auth\.uid\(\)/i)
  })

  it('attributes by assigned_rep_id and defines closes by funded_won_at', () => {
    expect(body).toMatch(/assigned_rep_id/i)
    expect(body).toMatch(/funded_won_at\s+is\s+not\s+null/i)
  })

  it('projects NO individual-identity / geometry / census column (leak-proof by omission)', () => {
    for (const forbidden of [/addressable/i, /census/i, /boundary/i, /geom/i, /center_lat/i, /center_lng/i, /practice_name/i]) {
      expect(body, `scoreboard_summary body must not reference ${forbidden}`).not.toMatch(forbidden)
    }
  })
})

describe('e1 follow-up — funded_won_at is not client-writable', () => {
  const code = sqlCodeOnly(read(lockdownMigrationPath()))

  it('drops the table-level UPDATE grant (a column revoke alone is a no-op under it)', () => {
    expect(code).toMatch(/revoke\s+update\s+on\s+public\.prospects\s+from\s+authenticated/i)
  })

  it('re-grants column UPDATE to authenticated for every column EXCEPT funded_won_at', () => {
    // Dynamic grant generated from information_schema, filtered by the exclusion predicate.
    expect(code).toMatch(/grant\s+update\s*\(%s\)\s+on\s+public\.prospects\s+to\s+authenticated/i)
    expect(code).toMatch(/column_name\s*<>\s*'funded_won_at'/i)
  })

  it('never grants UPDATE on funded_won_at back to authenticated', () => {
    expect(code).not.toMatch(/grant\s+update\s*\([^)]*funded_won_at[^)]*\)\s+on\s+public\.prospects/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Surfaces — token cleanliness (Hard Rule 8) + price single-sourcing
// ─────────────────────────────────────────────────────────────────────────────
describe('e1 — token-clean surfaces (Hard Rule 8)', () => {
  for (const file of [PAGE, CLIENT, PANEL]) {
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

describe('e1 — the $179K price is single-sourced, never inlined', () => {
  it('the scoreboard lib imports TERRITORY_STANDARD_PRICE and hardcodes no 179000', () => {
    const src = codeOnly(read(LIB))
    expect(src).toMatch(/import\s*\{[^}]*TERRITORY_STANDARD_PRICE[^}]*\}\s*from\s*['"](?:@\/|(?:\.\.\/)+)components\/proposal\/constants['"]/)
    expect(src).not.toMatch(/179[_,]?000/)
  })

  it('neither the page nor the client hardcodes the price literal', () => {
    expect(codeOnly(read(PAGE))).not.toMatch(/179[_,]?000/)
    expect(codeOnly(read(CLIENT))).not.toMatch(/179[_,]?000/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Nav — Scoreboard visible to every internal role
// ─────────────────────────────────────────────────────────────────────────────
describe('e1 — Scoreboard nav is visible to all internal users', () => {
  it('exposes /scoreboard for executive, rep, and unauthenticated viewers alike', () => {
    for (const d of ['executive', 'rep', null] as const) {
      const item = navItemsFor(d).find((i) => i.label === 'Scoreboard')
      expect(item, `Scoreboard must be visible for ${d}`).toBeDefined()
      expect(item?.href).toBe('/scoreboard')
      expect(item?.execOnly, 'Scoreboard is a shared culture surface, not exec-only').toBeFalsy()
    }
  })

  it('is a live route in the nav model', () => {
    const item = NAV_ITEMS.find((i) => i.label === 'Scoreboard')
    expect(item?.href).toBe('/scoreboard')
    expect(item?.comingSoon).toBeFalsy()
  })
})
