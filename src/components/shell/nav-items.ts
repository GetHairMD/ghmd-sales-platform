/**
 * App-shell navigation model (spec §4B) — single source for Sidebar + BottomTabBar
 * so the two never drift. Order follows §4B nav (Dashboard, Pipeline, Prospects,
 * Proposals, Deal Territories, Territory Scouting, Insights), with National Map
 * (decision #121/#122/#132) inserted after Deal Territories as a standalone item.
 *
 * `href` items are live routes. `comingSoon` items render disabled with a badge
 * (spec §4B: "Insights — nav item present, badged 'Coming Soon'") — used here for
 * the Proposals index (no route yet), Territory Scouting, and Insights, so the shell
 * never links to a 404.
 *
 * `execOnly` items appear only for executive viewers (spec §4B). Reps and
 * unauthenticated / non-allow-listed viewers never see them — filter through
 * `navItemsFor()` before rendering, never the raw array.
 */
import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, GitBranch, Users, FileText, Map, Globe, Compass, Trophy, MessageSquare, BookOpen, Sparkles } from 'lucide-react'
import type { Designation } from '@/lib/auth/internal-role'

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Live route. Omitted for coming-soon items. */
  href?: string
  /** Renders disabled with a "Soon" badge; sets roadmap expectations cheaply. */
  comingSoon?: boolean
  /** Visible to executive viewers only; hidden for reps + unauthenticated (fail closed). */
  execOnly?: boolean
  /**
   * Shorter label for the mobile bottom tab bar ONLY (the sidebar always uses `label`).
   * Multi-word labels — "Community Board", "Deal Territories", "National Map" — collapse
   * into an illegible run at 390px once the bar carries this many tabs. Set this for any
   * label that is not a single short word. Caught in E-2 390px QA, where adding an 8th tab
   * crushed the bar.
   */
  shortLabel?: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Pipeline', icon: GitBranch, href: '/pipeline' },
  { label: 'Prospects', icon: Users, href: '/prospects' },
  { label: 'Proposals', icon: FileText, href: '/proposals' },
  { label: 'Deal Territories', icon: Map, href: '/territories', shortLabel: 'Territories' },
  // National status map (decision #121/#122/#132): standalone, visible to ALL reps
  // and executives (no execOnly). Distinct route from Deal Territories.
  { label: 'National Map', icon: Globe, href: '/national-map', shortLabel: 'Map' },
  // Scoreboard (E-1): the rep leaderboard is a shared culture surface — visible to
  // ALL internal users (no execOnly), same as the RPC's all-internal audience.
  { label: 'Scoreboard', icon: Trophy, href: '/scoreboard' },
  // Community Board (E-2): deliberately NOT execOnly. The FEED is a shared surface (every
  // internal user reads every published post, and any internal user may author) — it is
  // only the Pending Review queue INSIDE the page that is executive-gated. Marking the nav
  // item execOnly would hide the board from the reps who post to it.
  { label: 'Community Board', icon: MessageSquare, href: '/community-board', shortLabel: 'Community' },
  // Resources / Field Kit (E-3, spec §4C.3): approved collateral library. Shared surface —
  // visible to ALL internal users (both designations), NOT execOnly. Single-word label, so
  // no shortLabel. Adding it makes BOTTOM_TABS a 9th tab; the bar already scrolls and
  // activeTabScrollLeft() keeps the active tab in view — re-verified in 390px QA (AC9).
  { label: 'Resources', icon: BookOpen, href: '/resources' },
  { label: 'Territory Scouting', icon: Compass, href: '/territory-scouting', execOnly: true },
  { label: 'Insights', icon: Sparkles, comingSoon: true },
]

/**
 * The nav a viewer of `designation` may see. Filters out `execOnly` items for any
 * non-executive (rep, or `null` = unauthenticated / not on the internal_users
 * allow-list) — the same fail-closed rule as `getViewerDesignation()`.
 */
export function navItemsFor(designation: Designation | null): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.execOnly || designation === 'executive')
}

/**
 * Bottom tab bar (mobile) — live, non-exec destinations (spec §4B). Filters on `href`
 * presence AND `!execOnly`: the mobile bar has no per-viewer role filtering of its own, so an
 * exec-only route with an href (e.g. Territory Scouting) must be excluded HERE or it would
 * surface to every viewer, reps included. Every other current `href` item has `execOnly`
 * unset, so this is additive-safe — no non-exec tab changes.
 */
export const BOTTOM_TABS: NavItem[] = NAV_ITEMS.filter(
  (i): i is NavItem & { href: string } => Boolean(i.href) && !i.execOnly,
)

/** True when `pathname` is within `href` (exact or nested route). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Geometry of the mobile bar and the active tab inside it, in CSS pixels. */
export interface ActiveTabGeometry {
  navScrollWidth: number
  navClientWidth: number
  tabOffsetLeft: number
  tabWidth: number
}

/**
 * The `scrollLeft` the mobile bottom bar should open at so the ACTIVE tab is visible.
 *
 * BOTTOM_TABS outgrew the viewport (8 tabs ≈ 576px of content in a 390px bar), so the bar
 * scrolls instead of crushing labels. It used to open at scrollLeft = 0 unconditionally,
 * which left the active tab off-screen on the two newest destinations — a viewer on
 * /community-board or /scoreboard saw no active tab at all. Found in deploy-preview QA of
 * PR #130; a document-level scrollWidth check does NOT catch it, because the overflow is
 * contained inside this nav by design.
 *
 * Centers the tab, then clamps into [0, maxScroll] — clamping is what handles the two ends:
 * the first tab never scrolls negative, and the last tab (Community Board — the case that
 * actually failed) stops at maxScroll, which still brings it fully into view.
 *
 * Pure on purpose: it takes measured geometry rather than a DOM node, so the behaviour is
 * unit-testable without a layout engine (jsdom reports 0 for every box metric).
 */
export function activeTabScrollLeft({
  navScrollWidth,
  navClientWidth,
  tabOffsetLeft,
  tabWidth,
}: ActiveTabGeometry): number {
  const maxScroll = navScrollWidth - navClientWidth
  if (maxScroll <= 0) return 0 // everything already fits — don't scroll a bar that needn't
  const centered = tabOffsetLeft + tabWidth / 2 - navClientWidth / 2
  return Math.round(Math.min(Math.max(centered, 0), maxScroll))
}
