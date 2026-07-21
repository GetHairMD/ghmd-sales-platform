import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * App-shell chrome guardrails (PR4 follow-up — codifies the chromeless-Proposals fix).
 *
 * The bug: AppShell used a per-path CHROMELESS_PREFIXES/isChromeless guard that stripped
 * the shell from anything under `/proposals` — including the INTERNAL Proposals index,
 * which a rep reaches from the sidebar. The fix moved internal pages into the (app) route
 * group (shell via AppLayout), so AppShell no longer needs — and must not reintroduce —
 * any path-based chrome-stripping. (The legacy PUBLIC buyer page that once sat at the
 * shell-less root has since been DELETED entirely — decision #200, Sprint 0.1 containment.)
 *
 * Same source-scan idiom as qualification-visibility-guardrails / public-proposal-guardrails
 * / rls-remediation — no RTL/jsdom; routing/shell invariants asserted against files on disk.
 */

const exists = (rel: string) => existsSync(join(process.cwd(), rel))
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Executable-code view: drop block/JSDoc (`/* … *\/`) and line (`//`) comments so an
 * ABSENCE check can't be fooled by documentation that legitimately names the retired
 * mechanism (AppShell's own JSDoc references "the old CHROMELESS_PREFIXES check").
 * Same principle as rls-remediation.test.ts scanning comment-stripped SQL.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block + JSDoc + JSX block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (the [^:] guard spares http:// etc.)
}

const APP_SHELL = 'src/components/shell/AppShell.tsx'
const INTERNAL_PROPOSALS = 'src/app/(app)/proposals/page.tsx'
const INTERNAL_PROPOSALS_AT_ROOT = 'src/app/proposals/page.tsx'
const PUBLIC_BUYER_PAGE = 'src/app/proposals/[prospectId]/page.tsx'
const PUBLIC_BUYER_PAGE_IN_GROUP = 'src/app/(app)/proposals/[prospectId]/page.tsx'

describe('app-shell chrome guardrails (chromeless-Proposals regression)', () => {
  it('the internal Proposals index lives INSIDE the (app) shell group', () => {
    // Inside (app) → renders through AppLayout → AppShell (chromed), not bare.
    expect(
      exists(INTERNAL_PROPOSALS),
      `${INTERNAL_PROPOSALS} must exist so the internal index renders inside the shell`,
    ).toBe(true)
    // And must NOT sit at the shell-less root (where the minimal root layout would render it bare).
    expect(
      exists(INTERNAL_PROPOSALS_AT_ROOT),
      'the internal Proposals index must not sit at the shell-less root',
    ).toBe(false)
  })

  it('AppShell carries no per-path chrome-stripping mechanism', () => {
    const code = codeOnly(read(APP_SHELL))
    // The exact bypass tokens the bug was built from — must not return as executable code.
    expect(code, 'CHROMELESS_PREFIXES must not return').not.toContain('CHROMELESS_PREFIXES')
    expect(code, 'isChromeless must not return').not.toContain('isChromeless')
    // Any per-path guard needs the pathname; its absence proves chrome is unconditional here.
    expect(code, 'AppShell must not branch on the pathname to strip chrome').not.toContain(
      'usePathname',
    )
  })

  it('the legacy PUBLIC buyer page is removed everywhere (decision #200)', () => {
    // The vulnerable service-role-backed public page was DELETED (Sprint 0.1 containment).
    // It must exist NEITHER at the shell-less root NOR inside the (app) shell group — a
    // reappearance in either location reintroduces the unauthenticated exposure.
    expect(
      exists(PUBLIC_BUYER_PAGE),
      `${PUBLIC_BUYER_PAGE} must stay deleted (decision #200)`,
    ).toBe(false)
    expect(
      exists(PUBLIC_BUYER_PAGE_IN_GROUP),
      'the public buyer page must not reappear inside the (app) shell group',
    ).toBe(false)
  })
})
