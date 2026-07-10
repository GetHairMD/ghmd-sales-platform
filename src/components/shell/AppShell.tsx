'use client'
import { usePathname } from 'next/navigation'
import type { Designation } from '@/lib/auth/internal-role'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'

/**
 * Internal app shell (spec §4B): persistent Sidebar + TopBar on desktop,
 * BottomTabBar on mobile, wrapping the rep-facing pages.
 *
 * Chromeless paths render bare — the public proposal surface (`/p/[slug]`),
 * its access wrapper (`/proposals`), and `/login` must NOT be wrapped in the
 * internal shell. This guard is the only coupling to those routes; their page
 * files are untouched.
 *
 * `designation` is resolved server-side in the root layout (getViewerDesignation)
 * and threaded to the Sidebar so exec-only nav items never reach a rep's markup.
 */
const CHROMELESS_PREFIXES = ['/login', '/p/', '/proposals']

function isChromeless(pathname: string): boolean {
  return CHROMELESS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p) || pathname === p.replace(/\/$/, ''),
  )
}

export default function AppShell({
  children,
  designation,
}: {
  children: React.ReactNode
  designation: Designation | null
}) {
  const pathname = usePathname()

  if (isChromeless(pathname)) return <>{children}</>

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
