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
import { LayoutDashboard, GitBranch, Users, FileText, Map, Globe, Compass, Sparkles } from 'lucide-react'
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
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Pipeline', icon: GitBranch, href: '/pipeline' },
  { label: 'Prospects', icon: Users, href: '/prospects' },
  { label: 'Proposals', icon: FileText, href: '/proposals' },
  { label: 'Deal Territories', icon: Map, href: '/territories' },
  // National status map (decision #121/#122/#132): standalone, visible to ALL reps
  // and executives (no execOnly). Distinct route from Deal Territories.
  { label: 'National Map', icon: Globe, href: '/national-map' },
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
