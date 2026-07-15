import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NAV_ITEMS,
  BOTTOM_TABS,
  navItemsFor,
  activeTabScrollLeft,
} from '../../components/shell/nav-items'

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

  it('is a live executive-only route (decision #146 — no longer coming-soon)', () => {
    const scouting = NAV_ITEMS.find((i) => i.label === 'Territory Scouting')
    expect(scouting, 'Territory Scouting must exist in the nav model').toBeDefined()
    expect(scouting?.comingSoon, 'Territory Scouting is now a live route').toBeFalsy()
    expect(scouting?.execOnly).toBe(true)
    expect(scouting?.href, 'links to the live scouting route').toBe('/territory-scouting')
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

  it('the mobile bottom tabs never include ANY exec-only item (leak-class guard)', () => {
    // BottomTabBar renders BOTTOM_TABS with no per-viewer role filter, so the exclusion must
    // live in the BOTTOM_TABS derivation itself. Pinning the general rule (not just the one
    // item by name) keeps a future exec-only nav addition from silently leaking to reps'
    // mobile bar. Precondition: an exec-only item WITH an href actually exists, so this is a
    // live guard, not a vacuous one.
    expect(
      NAV_ITEMS.some((i) => i.execOnly && i.href),
      'expected at least one exec-only route to make this guard meaningful',
    ).toBe(true)
    expect(BOTTOM_TABS.every((i) => !i.execOnly)).toBe(true)
  })
})

describe('mobile bottom bar scrolls the ACTIVE tab into view (E-2 QA, AC10)', () => {
  // Why this exists: the bar holds more tabs than fit at 390px, so it scrolls (overflow-x-auto)
  // rather than crushing labels. But it opened at scrollLeft=0 every time, so on the two newest
  // destinations the active tab sat OFF-SCREEN and the viewer got no active-state feedback at
  // all. Measured live on the PR #130 deploy preview at 390px: content 576px in a 390px bar,
  // 8 tabs, "Scoreboard" and "Community" never visible. These numbers are that real geometry.
  const BAR = { navScrollWidth: 576, navClientWidth: 390 }
  const TAB_W = 72 // min-w-[4.5rem]
  const tabAt = (index: number) => ({ tabOffsetLeft: index * TAB_W, tabWidth: TAB_W })
  const maxScroll = BAR.navScrollWidth - BAR.navClientWidth // 186

  it('leaves a bar whose tabs already fit alone (no gratuitous scroll)', () => {
    expect(
      activeTabScrollLeft({ navScrollWidth: 390, navClientWidth: 390, ...tabAt(0) }),
    ).toBe(0)
  })

  it('never scrolls negative for a tab already at the left edge', () => {
    expect(activeTabScrollLeft({ ...BAR, ...tabAt(0) })).toBe(0)
  })

  it('centers a middle tab', () => {
    // tab 3 spans 216..288; centering it puts scrollLeft at 216 + 36 - 195 = 57
    expect(activeTabScrollLeft({ ...BAR, ...tabAt(3) })).toBe(57)
  })

  it('clamps to max scroll for the LAST tab — the Community Board case that failed QA', () => {
    // Community is the 8th tab (index 7). Centering would want 345, which overscrolls;
    // clamping to 186 still brings it fully into view, which is the whole point.
    expect(activeTabScrollLeft({ ...BAR, ...tabAt(7) })).toBe(maxScroll)
  })

  it('brings the previously-offscreen Scoreboard and Community tabs fully into view', () => {
    for (const index of [6, 7]) {
      const scrollLeft = activeTabScrollLeft({ ...BAR, ...tabAt(index) })
      const { tabOffsetLeft, tabWidth } = tabAt(index)
      // Fully visible == the tab's box sits inside the scrolled viewport of the bar.
      expect(tabOffsetLeft).toBeGreaterThanOrEqual(scrollLeft)
      expect(tabOffsetLeft + tabWidth).toBeLessThanOrEqual(scrollLeft + BAR.navClientWidth)
    }
  })
})

describe('Resources / Field Kit is a shared route for every role (E-3, spec §4C.3)', () => {
  it('reps AND executives AND unauthenticated viewers all see Resources', () => {
    for (const d of ['executive', 'rep', null] as const) {
      const item = navItemsFor(d).find((i) => i.label === 'Resources')
      expect(item, `Resources must be visible for ${d}`).toBeDefined()
      expect(item?.href, 'Resources is a live route').toBe('/resources')
      expect(item?.execOnly, 'Resources is a shared surface, not exec-only').toBeFalsy()
    }
  })

  it('appears on the mobile bottom bar (live, non-exec route)', () => {
    expect(labels(BOTTOM_TABS)).toContain('Resources')
  })

  it('sits between Community Board and Insights in the spec §4C order', () => {
    const order = labels(NAV_ITEMS)
    expect(order.indexOf('Resources')).toBeGreaterThan(order.indexOf('Community Board'))
    expect(order.indexOf('Resources')).toBeLessThan(order.indexOf('Insights'))
  })
})

describe('National Map is visible to every role (decision #121/#122/#132)', () => {
  it('reps AND executives AND unauthenticated viewers all see National Map', () => {
    // No execOnly flag → visible to everyone via navItemsFor, same as the other
    // live routes. The route itself is gated server-side (territory_status_map()
    // returns nothing to a non-internal caller), so nav visibility is intentionally open.
    for (const d of ['executive', 'rep', null] as const) {
      const item = navItemsFor(d).find((i) => i.label === 'National Map')
      expect(item, `National Map must be visible for ${d}`).toBeDefined()
      expect(item?.href, 'National Map is a live route').toBe('/national-map')
      expect(item?.execOnly, 'National Map is not executive-only').toBeFalsy()
    }
  })

  it('is a distinct route from Deal Territories', () => {
    const deal = NAV_ITEMS.find((i) => i.label === 'Deal Territories')
    const national = NAV_ITEMS.find((i) => i.label === 'National Map')
    expect(deal?.href).toBe('/territories')
    expect(national?.href).toBe('/national-map')
    expect(national?.href).not.toBe(deal?.href)
  })
})
