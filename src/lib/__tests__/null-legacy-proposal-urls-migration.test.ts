import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural guardrails for the legacy-proposal-url cleanup migration
 * (supabase/migrations/20260720160000_null_legacy_proposal_urls.sql, decision #200).
 *
 * These assert the EXECUTABLE SQL — comments are stripped first and whitespace is
 * normalised, so a token that only appears in prose cannot satisfy any check. The
 * load-bearing property under test is the NULL-SAFE pre-mutation guard: deals.notes is
 * nullable and a deal may be unlinked, so the guard must use a LEFT JOIN and an
 * `(expected-row predicate) IS NOT TRUE` test (NOT a `NOT (…)` form) — otherwise a
 * notes-IS-NULL or unlinked legacy row silently escapes the guard.
 */

const MIGRATION = 'supabase/migrations/20260720160000_null_legacy_proposal_urls.sql'

/** Strip SQL block + line comments, then collapse whitespace to single spaces.
 *  (This migration has no `--` inside string literals, so the line-comment strip is safe.) */
function sqlCodeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

const raw = readFileSync(join(process.cwd(), MIGRATION), 'utf8')
const code = sqlCodeOnly(raw)

// Anchor offsets of the three executable phases, in order. The targeted cleanup
// phase begins at its `with tgt as (…)` CTE — which is where its origin/demo-marker
// predicates live — not at the `update public.deals` keyword that follows the CTE.
const lockTimeoutAt = code.indexOf('set local lock_timeout')
const lockTableAt = code.indexOf('lock table public.deals in share mode')
const guardAt = code.indexOf('into v_unexpected')
const cleanupAt = code.indexOf('with tgt as')
const updateKeywordAt = code.indexOf('update public.deals')
const postAt = code.indexOf('into v_remaining')

const guardSlice = code.slice(guardAt, cleanupAt) // pre-mutation guard SELECT (only)
const updateSlice = code.slice(cleanupAt, postAt) // targeted cleanup CTE + UPDATE
const postSlice = code.slice(postAt) // postcondition SELECT + RAISE

describe('legacy-proposal-url migration — structure (decision #200)', () => {
  it('has all three phases present and in order (guard → update → postcondition)', () => {
    expect(guardAt).toBeGreaterThan(-1)
    expect(cleanupAt).toBeGreaterThan(-1)
    expect(updateKeywordAt).toBeGreaterThan(-1)
    expect(postAt).toBeGreaterThan(-1)
    // guard SELECT precedes the cleanup CTE, whose UPDATE precedes the postcondition.
    expect(guardAt).toBeLessThan(cleanupAt)
    expect(cleanupAt).toBeLessThan(updateKeywordAt)
    expect(updateKeywordAt).toBeLessThan(postAt)
  })

  it('is a single DO $$ … $$ block', () => {
    const opens = code.match(/do \$\$/g) ?? []
    expect(opens.length).toBe(1)
  })

  it('has NO exception-handler clause (failures must propagate uncaught)', () => {
    // `raise exception '…'` is allowed and present; a handler is `exception when …`.
    expect(code).not.toMatch(/\bexception\s+when\b/)
  })

  it('pins the exact retired origin as a constant predicate', () => {
    expect(code).toContain("v_legacy_origin constant text := 'https://proposals.gethairmd.com/proposals/'")
  })
})

describe('legacy-proposal-url migration — concurrency lock (decision #200 gate BLOCK fix)', () => {
  it('bounds the wait with SET LOCAL lock_timeout before locking', () => {
    expect(lockTimeoutAt).toBeGreaterThan(-1)
    expect(lockTableAt).toBeGreaterThan(-1)
    expect(lockTimeoutAt).toBeLessThan(lockTableAt)
  })

  it('takes LOCK TABLE public.deals IN SHARE MODE (not a stronger/weaker mode)', () => {
    expect(code).toContain('lock table public.deals in share mode')
    // SHARE precisely: must NOT be EXCLUSIVE / ACCESS EXCLUSIVE / SHARE ROW EXCLUSIVE
    // (each of those is either wrong strength or blocks ordinary reads).
    expect(code).not.toContain('in exclusive mode')
    expect(code).not.toContain('in access exclusive mode')
    expect(code).not.toContain('share row exclusive')
  })

  it('acquires the lock BEFORE the pre-mutation guard (holds through the postcondition)', () => {
    expect(lockTableAt).toBeLessThan(guardAt)
  })

  it('full ordering: timeout → lock → guard → update → postcondition', () => {
    expect(lockTimeoutAt).toBeLessThan(lockTableAt)
    expect(lockTableAt).toBeLessThan(guardAt)
    expect(guardAt).toBeLessThan(cleanupAt)
    expect(cleanupAt).toBeLessThan(updateKeywordAt)
    expect(updateKeywordAt).toBeLessThan(postAt)
  })
})

describe('legacy-proposal-url migration — NULL-SAFE pre-mutation guard', () => {
  it('the guard LEFT JOINs public.prospects (keeps unlinked rows)', () => {
    expect(guardSlice).toMatch(/left join public\.prospects/)
  })

  it('the guard uses `(expected-row predicate) IS NOT TRUE`, not `NOT (…)`', () => {
    expect(guardSlice).toMatch(/\)\s*is not true/)
    // The brittle/incorrect three-valued form is explicitly forbidden in the guard.
    expect(guardSlice).not.toMatch(/and\s+not\s*\(/)
  })

  it('the guard predicate still covers origin + both demo markers', () => {
    expect(guardSlice).toContain("d.proposal_url like v_legacy_origin || '%'")
    expect(guardSlice).toContain("d.notes = '[demo_seed]'")
    expect(guardSlice).toContain("p.lead_source = 'demo_seed'")
  })

  it('the guard raises (uncaught) when it finds an unexpected row', () => {
    expect(guardSlice).toMatch(/if v_unexpected > 0 then raise exception/)
  })
})

describe('legacy-proposal-url migration — targeted UPDATE stays exact', () => {
  it('nulls proposal_url only for exact-origin, doubly demo-tagged rows', () => {
    expect(updateSlice).toContain('set proposal_url = null')
    expect(updateSlice).toContain("d.proposal_url like v_legacy_origin || '%'")
    expect(updateSlice).toContain("d.notes = '[demo_seed]'")
    expect(updateSlice).toContain("p.lead_source = 'demo_seed'")
  })
})

describe('legacy-proposal-url migration — postcondition backstop', () => {
  it('rejects (uncaught raise) any remaining %/proposals/% URL', () => {
    expect(postSlice).toMatch(/proposal_url like '%\/proposals\/%'/)
    expect(postSlice).toMatch(/if v_remaining > 0 then raise exception/)
  })
})
