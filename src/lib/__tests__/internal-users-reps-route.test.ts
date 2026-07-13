import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GET /api/internal-users/reps guardrails (PR #124, second Second-Opinion Gate BLOCK).
 *
 * The rep "assign to" selector on prospect creation needs the rep roster, but internal_users'
 * only SELECT policy is self_read (own row only) — so the roster is read via the service-role
 * client behind a code-level executive gate, mirroring /api/territory-scouting/reports*. This
 * source-scan trip-wire pins the load-bearing invariants (no route-invocation harness exists
 * in this repo — same idiom as qa-locked-approve-guardrails / public-proposal-guardrails).
 * The behavioural guarantee ("only reps, never execs") is additionally proven live against the
 * DB in the PR's adversarial pass.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Executable-code view: strip block/JSDoc + line comments so a check can't be satisfied
 *  (or fooled) by a comment that merely names the token. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const ROUTE = 'src/app/api/internal-users/reps/route.ts'

describe('GET /api/internal-users/reps — exec-gated, reps-only', () => {
  it('rejects unauthenticated callers with 401', () => {
    const code = codeOnly(read(ROUTE))
    expect(code).toMatch(/getUser\(\)/)
    const noUser = code.indexOf('!user')
    expect(noUser, 'must branch on missing user').toBeGreaterThanOrEqual(0)
    expect(code.slice(noUser, noUser + 120), 'missing user → 401').toMatch(/status:\s*401/)
  })

  it('rejects non-executive callers with 403 (fail-closed, reused gate)', () => {
    const code = codeOnly(read(ROUTE))
    expect(code, 'must reuse the shared executive predicate').toContain('viewerIsExecutive')
    // Anchor on the CALL, not the import line, then confirm the 403 sits in its branch.
    const gate = code.indexOf('viewerIsExecutive(')
    expect(gate, 'must invoke viewerIsExecutive()').toBeGreaterThanOrEqual(0)
    expect(code.slice(gate, gate + 160), 'non-exec → 403').toMatch(/status:\s*403/)
  })

  it('reads via the service-role client (internal_users self_read blocks the roster otherwise)', () => {
    const code = codeOnly(read(ROUTE))
    expect(code).toContain('createServiceClient')
  })

  it('filters to designation=rep and never selects executive rows', () => {
    const code = codeOnly(read(ROUTE))
    expect(code, "must filter to rep designation").toMatch(/\.eq\(\s*['"]designation['"]\s*,\s*['"]rep['"]\s*\)/)
    // Only user_id + full_name are exposed; no other columns leak from internal_users.
    expect(code).toMatch(/\.select\(\s*['"]user_id,\s*full_name['"]\s*\)/)
    expect(code, "must never hand back executive rows").not.toMatch(/designation['"]\s*,\s*['"]executive['"]/)
  })

  it('both auth guards precede the service-role read (gate cannot be bypassed)', () => {
    const code = codeOnly(read(ROUTE))
    const gate401 = code.indexOf('401')
    const gate403 = code.indexOf('viewerIsExecutive(') // the CALL, not the import
    const svcRead = code.indexOf('createServiceClient()') // the CALL, not the import
    expect(gate401, '401 guard present').toBeGreaterThanOrEqual(0)
    expect(gate403, 'exec gate present').toBeGreaterThanOrEqual(0)
    // Order in source: unauthenticated → 401, then non-exec → 403, then the privileged read.
    expect(gate401).toBeLessThan(gate403)
    expect(gate403).toBeLessThan(svcRead)
  })
})
