import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isPublicPath } from '../auth-gate'

/**
 * Legacy public proposal route removal — decision #200, Sprint 0.1 Phase 0 containment.
 *
 * The public, service-role-backed page /proposals/[prospectId] rendered prospect
 * identity, practice, territory, addressable-market data, and pricing to ANY
 * unauthenticated caller who obtained the URL. This suite is the source-scan
 * enforcement (the repo has no RTL/jsdom harness — same idiom as
 * public-proposal-guardrails / app-shell-chrome-guardrails / rls-remediation):
 *   • the vulnerable page is deleted;
 *   • isPublicPath() exempts no /proposals/* path (the exemption survived
 *     AUTH_GATE_DISABLED by design, so removing it is load-bearing);
 *   • /p/[slug] and the bare /proposals index are unaffected;
 *   • the middleware tombstones /proposals/* with a pre-auth 404 BEFORE the Supabase
 *     client is constructed and BEFORE the session is read (zero DB / zero auth work
 *     on the dead path) — asserted as ORDERING, not just status;
 *   • no internal link anywhere resolves to the dead route.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Strip block + line comments so ABSENCE checks aren't fooled by prose that names the
 *  retired route (the `[^:]` guard spares `http://` etc). Same as app-shell-chrome-guardrails. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const MIDDLEWARE = 'src/middleware.ts'
const DELETED_PAGE = 'src/app/proposals/[prospectId]/page.tsx'

describe('legacy /proposals route removal — page + gate (decision #200)', () => {
  it('the vulnerable public buyer page is deleted from disk', () => {
    expect(existsSync(join(process.cwd(), DELETED_PAGE))).toBe(false)
  })

  it('isPublicPath exempts no /proposals/* dynamic path (fail-closed regression)', () => {
    for (const p of [
      '/proposals/anything',
      '/proposals/abc-123',
      '/proposals/00000000-0000-0000-0000-000000000000',
    ]) {
      expect(isPublicPath(p)).toBe(false)
    }
  })

  it('the bare /proposals internal index stays gated (rep-facing)', () => {
    expect(isPublicPath('/proposals')).toBe(false)
  })

  it('/p/[slug] stays publicly reachable — its own access-code gate is the control', () => {
    expect(isPublicPath('/p/some-slug')).toBe(true)
  })
})

describe('middleware tombstone — pre-auth 404 with tombstone-before-client ordering', () => {
  const src = codeOnly(read(MIDDLEWARE))
  const tombstoneAt = src.indexOf("startsWith('/proposals/')")
  const status404At = src.indexOf('status: 404')
  const clientAt = src.indexOf('createServerClient(')
  const getUserAt = src.indexOf('auth.getUser(')
  const refuseAt = src.indexOf('shouldRefuseServing')

  it('a /proposals/* request is answered with a 404 by the tombstone branch', () => {
    expect(tombstoneAt).toBeGreaterThan(-1)
    expect(status404At).toBeGreaterThan(tombstoneAt)
  })

  it('the tombstone runs BEFORE the Supabase client is constructed (zero DB work)', () => {
    expect(clientAt).toBeGreaterThan(-1)
    expect(tombstoneAt).toBeLessThan(clientAt)
  })

  it('the tombstone runs BEFORE the session is read (zero auth work)', () => {
    expect(getUserAt).toBeGreaterThan(-1)
    expect(tombstoneAt).toBeLessThan(getUserAt)
  })

  it('the runtime serve-refusal guard still runs FIRST (unchanged invariant)', () => {
    expect(refuseAt).toBeGreaterThan(-1)
    expect(refuseAt).toBeLessThan(tombstoneAt)
  })
})

/** Recursively collect .ts/.tsx under a repo-relative dir. */
function collectTsx(relDir: string): string[] {
  const abs = join(process.cwd(), relDir)
  if (!existsSync(abs)) return []
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    const rel = `${relDir}/${entry}`
    const full = join(process.cwd(), rel)
    if (statSync(full).isDirectory()) out.push(...collectTsx(rel))
    else if (/\.tsx?$/.test(entry)) out.push(rel)
  }
  return out
}

describe('no internal link resolves to the dead /proposals/[prospectId] route', () => {
  const files = [...collectTsx('src/app'), ...collectTsx('src/components')]
  for (const file of files) {
    it(`${file} constructs no link to /proposals/<segment>`, () => {
      const code = codeOnly(read(file))
      // Template-literal link, e.g. `/proposals/${prospectId}` (the historical form).
      expect(code).not.toMatch(/\/proposals\/\$\{/)
      // Static href/route string to a /proposals/ subpath (never matches `@/lib/proposals`
      // imports — those have no href/= quote immediately before `/proposals/`).
      expect(code).not.toMatch(/href[=:]\s*["'`]\/proposals\//)
    })
  }
})

describe('seed-demo no longer writes a legacy /proposals/ URL into deals.proposal_url', () => {
  const code = codeOnly(read('scripts/seed-demo.ts'))
  it('writes no proposals.gethairmd.com/proposals/ URL', () => {
    expect(code).not.toContain('proposals.gethairmd.com/proposals/')
  })
  it('assigns no /proposals/ value to proposal_url', () => {
    expect(code).not.toMatch(/proposal_url:\s*`[^`]*\/proposals\//)
  })
})
