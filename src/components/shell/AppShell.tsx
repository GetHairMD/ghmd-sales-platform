import type { Designation } from '@/lib/auth/internal-role'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'

/**
 * Internal app shell (spec §4B): persistent Sidebar + TopBar on desktop,
 * BottomTabBar on mobile, wrapping the rep-facing pages.
 *
 * Rendered ONLY by the (app) route group's layout, which wraps internal pages
 * exclusively — so the shell always applies here and needs no per-path chromeless
 * guard. Public, prospect-facing routes (`/p/[slug]`, `/login`,
 * `/proposals/[prospectId]`) live outside the group under the minimal root layout
 * and never reach this component. (This replaces the old CHROMELESS_PREFIXES check,
 * which also mis-stripped the chrome from the internal `/proposals` index.)
 *
 * `designation` is resolved server-side in the (app) layout (getViewerDesignation)
 * and threaded to the Sidebar so exec-only nav items never reach a rep's markup.
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
      <Sidebar designation={designation} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* pb-16 clears the mobile BottomTabBar; removed at md+. */}
        <div className="flex-1 pb-16 md:pb-0">{children}</div>
      </div>
      <BottomTabBar />
    </div>
  )
}
