import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Credential read-site invariant — decision #199 remediation (D7), permanent CI enforcement.
 *
 * INVARIANT: outside the resolver module, no file in this repository references either
 * Supabase service-credential variable name (both assembled at runtime below) — not via
 * `process.env.<NAME>`, not via bracket access, not via destructuring, not via an env-object
 * alias, and not even in a comment. One read site means rotation is a value swap; a second one
 * means a rotation can half-apply, which is precisely the failure this layer exists to prevent.
 *
 * Enforced as a whole-line scan rather than a set of read-pattern regexes on purpose: pattern
 * enumeration leaves gaps between the forms (`process.env['X']`, `const { X } = process.env`,
 * `const e = process.env; e.X`), whereas "the identifier does not appear" has no gaps and
 * produces a failure message a future reader can act on immediately.
 *
 * The allowlist is EXACT — specific paths, and for the workflow specific LINES. There is no
 * `.github/workflows/*` wildcard: any occurrence in any other workflow, or on any other line
 * of the sweep workflow, is a violation.
 *
 * ⚠ This test file and its companions assemble the identifiers at runtime (below) rather than
 * writing them as literals, so the suites that exercise the resolver need no exemption from
 * the invariant they enforce.
 */

const NEW_VAR = ['SUPABASE', 'SECRET', 'KEY'].join('_')
const LEGACY_VAR = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')
const IDENTIFIERS = [NEW_VAR, LEGACY_VAR]

/** (a) the single resolver module — the one legitimate read site. */
const RESOLVER = 'src/lib/supabase/secret-key.ts'
/** (b) the example env file — placeholders only (outside the scanned extensions; declared for completeness). */
const EXAMPLE_ENV = '.env.local.example'
/** (c) the sweep workflow, and ONLY these two environment-mapping lines within it. */
const SWEEP_WORKFLOW = '.github/workflows/residual-risk-sweep.yml'
const SWEEP_ALLOWED_LINES = [
  `${NEW_VAR}: \${{ secrets.${NEW_VAR} }}`,
  `${LEGACY_VAR}: \${{ secrets.${LEGACY_VAR} }}`,
]

const SCANNED_EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|ya?ml)$/
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'coverage',
  'storybook-static',
  // Prose surfaces: the decision mirror, handoffs and docs legitimately name the variables.
  'docs',
  'handoffs',
  'decisions',
])

/** Repo-relative, forward-slashed paths for every scanned file (Windows-safe). */
function collect(relDir: string, out: string[] = []): string[] {
  const abs = relDir === '' ? process.cwd() : join(process.cwd(), relDir)
  for (const entry of readdirSync(abs)) {
    const rel = relDir === '' ? entry : `${relDir}/${entry}`
    if (statSync(join(process.cwd(), rel)).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) collect(rel, out)
    } else if (SCANNED_EXTENSIONS.test(entry)) {
      out.push(rel)
    }
  }
  return out
}

interface Hit {
  file: string
  line: number
  text: string
}

function hitsIn(file: string): Hit[] {
  const src = readFileSync(join(process.cwd(), file), 'utf8')
  const hits: Hit[] = []
  src.split(/\r?\n/).forEach((text, i) => {
    if (IDENTIFIERS.some((id) => text.includes(id))) hits.push({ file, line: i + 1, text: text.trim() })
  })
  return hits
}

function isAllowed(hit: Hit): boolean {
  if (hit.file === RESOLVER) return true
  if (hit.file === EXAMPLE_ENV) return true
  if (hit.file === SWEEP_WORKFLOW) return SWEEP_ALLOWED_LINES.includes(hit.text)
  return false
}

const SCANNED = collect('')

describe('credential identifiers appear only at the allowlisted sites (decision #199)', () => {
  it('scans a non-trivial slice of the repo (guards against a collector that silently matches nothing)', () => {
    expect(SCANNED.length).toBeGreaterThan(100)
    expect(SCANNED).toContain(RESOLVER)
    expect(SCANNED).toContain(SWEEP_WORKFLOW)
  })

  it('no scanned file outside the exact allowlist mentions either identifier', () => {
    const violations = SCANNED.flatMap(hitsIn).filter((h) => !isAllowed(h))
    const rendered = violations.map((v) => `${v.file}:${v.line}  ${v.text}`).join('\n')
    expect(
      rendered,
      'Read the Supabase service credential via getSupabaseSecretKey() from ' +
        `${RESOLVER} instead of naming the environment variable directly.`,
    ).toBe('')
  })

  it('the resolver really is the read site (positive control — the scan is not vacuous)', () => {
    const src = readFileSync(join(process.cwd(), RESOLVER), 'utf8')
    for (const id of IDENTIFIERS) expect(src).toContain(id)
    expect(src).toContain(`process.env.${NEW_VAR}`)
    expect(src).toContain(`process.env.${LEGACY_VAR}`)
  })

  it('the sweep workflow maps BOTH variables, on exactly the allowlisted lines', () => {
    const hits = hitsIn(SWEEP_WORKFLOW)
    expect(hits.map((h) => h.text).sort()).toEqual([...SWEEP_ALLOWED_LINES].sort())
  })

  it('the example env file lists the preferred variable above the deprecated one', () => {
    const path = join(process.cwd(), EXAMPLE_ENV)
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf8')
    expect(src).toContain(`${NEW_VAR}=`)
    expect(src.indexOf(`${NEW_VAR}=`)).toBeLessThan(src.indexOf(`${LEGACY_VAR}=`))
  })
})

describe('every service-credential consumer routes through the resolver', () => {
  /** The read-sites migrated by this change (decision #199 inventory, main @ 0372cfa). */
  const CONSUMERS = [
    'src/lib/supabase/service.ts',
    'src/lib/proposal/data.ts',
    'src/app/(app)/territories/[id]/page.tsx',
    'scripts/second-opinion-gate/overdue-rpc.ts',
    'scripts/export-decision-log.ts',
    'scripts/seed-demo.ts',
    'scripts/freeze-qa-anchor-fixtures.ts',
  ]

  for (const file of CONSUMERS) {
    it(`${file} imports getSupabaseSecretKey`, () => {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src).toMatch(/import\s*\{[^}]*getSupabaseSecretKey[^}]*\}\s*from\s*['"][^'"]*secret-key['"]/)
      expect(src).toContain('getSupabaseSecretKey()')
    })
  }

  it('the Netlify background function reaches it indirectly, via createServiceClient', () => {
    const src = readFileSync(join(process.cwd(), 'netlify/functions/size-territory-background.mts'), 'utf8')
    expect(src).toContain("from '../../src/lib/supabase/service'")
    expect(src).toContain('createServiceClient()')
  })
})
