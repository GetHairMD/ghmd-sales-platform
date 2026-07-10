import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NAV_ITEMS, BOTTOM_TABS, navItemsFor } from '../../components/shell/nav-items'

/**
 * Nav visibility guardrails (PR4 — Territories nav split).
 *
 * Two behaviors, both verified by a real role-switch through the SAME designation the
 * getViewerDesignation()/internal_users gate produces (executive | rep | null):
 *   1. "Territory Scouting" is executive-only and fails closed for rep / unauthenticated
 *      viewers — reps must NEVER see it in nav.
 *   2. "Territories" was renamed to "Deal Territories" (label only) — the /territories
 *      route and its position are unchanged.
 *
 * navItemsFor() is a pure function, so this is an actual behavioral role-switch (not a
 * source scan). A structural check confirms the Sidebar renders the filtered list rather
 * than the raw NAV_ITEMS — same guardrail idiom as qualification-visibility-guardrails.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const labels = (items: { label: string }[]) => items.map((i) => i.label)

describe('Territory Scouting is executive-only (PR4 exec gate)', () => {
  it('executives see Territory Scouting', () => {
    expect(labels(navItemsFor('executive'))).toContain('Territory Scouting')
  })

  it('reps never see Territory Scouting', () => {
    expect(labels(navItemsFor('rep'))).not.toContain('Territory Scouting')
  })

  it('unauthenticated / non-allowlisted viewers fail closed', () => {
    expect(labels(navItemsFor(null))).not.toContain('Territory Scouting')
  })

  it('is a coming-soon placeholder, not a live route', () => {
    const scouting = NAV_ITEMS.find((i) => i.label === 'Territory Scouting')
    expect(scouting, 'Territory Scouting must exist in the nav model').toBeDefined()
    expect(scouting?.comingSoon).toBe(true)
    expect(scouting?.execOnly).toBe(true)
    expect(scouting?.href, 'coming-soon item must not link to a route').toBeUndefined()
  })

  it('the Sidebar renders the role-filtered nav, not the raw list', () => {
    const src = read('src/components/shell/Sidebar.tsx')
    expect(src).toContain('navItemsFor(')
    expect(src, 'must not map the unfiltered NAV_ITEMS').not.toMatch(/NAV_ITEMS\.map/)
  })
})

describe('Territories → Deal Territories (label-only rename, PR4)', () => {
  it('exposes Deal Territories on the existing /territories route for every role', () => {
    for (const d of ['executive', 'rep', null] as const) {
      const deal = navItemsFor(d).find((i) => i.label === 'Deal Territories')
      expect(deal, `Deal Territories must be visible for ${d}`).toBeDefined()
      expect(deal?.href, 'route unchanged — label-only rename').toBe('/territories')
    }
  })

  it('no longer exposes the old "Territories" label', () => {
    expect(labels(NAV_ITEMS)).not.toContain('Territories')
  })

  it('the mobile bottom tabs never include the exec-only scouting item', () => {
    expect(labels(BOTTOM_TABS)).not.toContain('Territory Scouting')
  })
})
