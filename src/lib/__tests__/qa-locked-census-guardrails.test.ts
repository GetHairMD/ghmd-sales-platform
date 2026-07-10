import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * qa_locked census-write guardrails (2026-07-10 Nashville incident regression).
 *
 * The bug: the territory detail page (V2_LEGACY render path) recomputed county census and
 * PERSISTED it to `territories` via an RLS-bypassing admin client whenever the cache was
 * stale — with NO `qa_locked` check. A single stale-cache render of the Nashville anchor
 * overwrote its locked 4,127 figure with a 172,275 whole-county recompute.
 *
 * The fix routes the write decision through the pure, unit-tested `shouldRefreshV2Census`
 * guard (which returns false for qa_locked rows). This source-scan trip-wire proves the page
 * still delegates to that guard and can't silently re-inline an ungated stale-only write.
 *
 * Same source-scan idiom as app-shell-chrome-guardrails / rls-remediation — no RTL/jsdom.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Executable-code view: strip block/JSDoc + line comments so absence checks can't be fooled
 *  by a comment that legitimately names the retired `cacheStale` mechanism. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const PAGE = 'src/app/(app)/territories/[id]/page.tsx'

describe('qa_locked census-write guardrails (Nashville render-overwrite regression)', () => {
  it('the detail page gates its census write through shouldRefreshV2Census', () => {
    const code = codeOnly(read(PAGE))
    expect(code, 'page must delegate the refresh decision to the qa_locked-aware guard').toContain(
      'shouldRefreshV2Census(territory)',
    )
  })

  it('the admin-client territories write is downstream of the guard (unreachable when it returns false)', () => {
    const code = codeOnly(read(PAGE))
    const guardAt = code.indexOf('shouldRefreshV2Census(')
    const adminWriteAt = code.indexOf('createAdminClient(')
    expect(guardAt, 'the guard call must be present').toBeGreaterThanOrEqual(0)
    expect(adminWriteAt, 'the admin census write must be present').toBeGreaterThanOrEqual(0)
    expect(
      guardAt,
      'the qa_locked-aware guard must precede (gate) the admin-client write',
    ).toBeLessThan(adminWriteAt)
  })

  it('does not reintroduce an ungated cacheStale gate (the original bug shape)', () => {
    const code = codeOnly(read(PAGE))
    expect(
      code,
      'the old stale-only `cacheStale` gate (no qa_locked check) must not return',
    ).not.toContain('cacheStale')
  })
})
