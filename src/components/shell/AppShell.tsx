import type { Designation } from '@/lib/auth/internal-role'
import { concealedNavItemsFor } from './concealed-nav'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'

/**
 * Internal app shell (spec §4B): persistent Sidebar + TopBar on desktop,
 * BottomTabBar on mobile, wrapping the rep-facing pages.
 *
 * Rendered ONLY by the (app) route group's layout, which wraps internal pages
 * exclusively — so the shell always applies here and needs no per-path chromeless
 * guard. Public, prospect-facing routes (`/p/[slug]`, `/login`) live outside the
 * group under the minimal root layout and never reach this component. (This replaces
 * the old CHROMELESS_PREFIXES check, which also mis-stripped the chrome from the
 * internal `/proposals` index.)
 *
 * `designation` is resolved server-side in the (app) layout (getViewerDesignation)
 * and threaded to the Sidebar (exec-only nav items) and the TopBar (exec-only
 * "New Territory" quick-add) so exec-only affordances never reach a rep's markup.
 *
 * CONCEALED nav (spec §4D): concealedNavItemsFor() is resolved HERE — in a server
 * component — and passed to the Sidebar as a plain prop. For any non-executive it
 * is [], so the concealed labels/hrefs never enter the rep's HTML, RSC payload, or
 * bundles (see concealed-nav.ts for why nav-items.ts cannot carry these).
 */
export default function AppShell({
  children,
  designation,
}: {
  children: React.ReactNode
  designation: Designation | null
}) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar designation={designation} concealedItems={concealedNavItemsFor(designation)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar designation={designation} />
        {/* pb-16 clears the mobile BottomTabBar; removed at md+. */}
        <div className="flex-1 pb-16 md:pb-0">{children}</div>
      </div>
      <BottomTabBar />
    </div>
  )
}
