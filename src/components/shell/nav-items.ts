/**
 * App-shell navigation model (spec §4B) — single source for Sidebar + BottomTabBar
 * so the two never drift. Order matches §4B nav (Dashboard, Pipeline, Prospects,
 * Proposals, Territories, Insights).
 *
 * `href` items are live routes. `comingSoon` items render disabled with a badge
 * (spec §4B: "Insights — nav item present, badged 'Coming Soon'") — used here for
 * the Proposals index (no route yet) and Insights, so the shell never links to a 404.
 */
import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, GitBranch, Users, FileText, Map, Sparkles } from 'lucide-react'

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Live route. Omitted for coming-soon items. */
  href?: string
  /** Renders disabled with a "Soon" badge; sets roadmap expectations cheaply. */
  comingSoon?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Pipeline', icon: GitBranch, href: '/pipeline' },
  { label: 'Prospects', icon: Users, href: '/prospects' },
  { label: 'Proposals', icon: FileText, href: '/proposals' },
  { label: 'Territories', icon: Map, href: '/territories' },
  { label: 'Insights', icon: Sparkles, comingSoon: true },
]

/** Bottom tab bar (mobile) — the four highest-traffic live destinations (spec §4B). */
export const BOTTOM_TABS: NavItem[] = NAV_ITEMS.filter(
  (i): i is NavItem & { href: string } => Boolean(i.href),
)

/** True when `pathname` is within `href` (exact or nested route). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
