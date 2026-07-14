'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/design/cn'
import { BOTTOM_TABS, isActive, activeTabScrollLeft } from './nav-items'

/**
 * Mobile bottom tab bar (spec §4B — deliberate NIP deviation: reps live on
 * phones, so the pipeline must not hide behind a hamburger). Shown below `md`;
 * the desktop shell uses the Sidebar instead.
 */
export default function BottomTabBar() {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement | null>(null)
  const activeRef = useRef<HTMLAnchorElement | null>(null)

  /**
   * Scroll the ACTIVE tab into view. The bar holds more tabs than fit at 390px, so it
   * scrolls; without this it always opened at scrollLeft = 0 and the active tab could sit
   * off-screen entirely (true for /community-board and /scoreboard — the last two tabs).
   *
   * We set `scrollLeft` on the bar OURSELVES rather than calling `activeTab.scrollIntoView()`:
   * scrollIntoView scrolls every scrollable ancestor, which can pan the PAGE horizontally —
   * and "the page body never scrolls horizontally" is precisely the property this bar's
   * contained overflow exists to protect. Writing scrollLeft moves the bar and nothing else.
   *
   * useLayoutEffect (not useEffect) so the bar is already scrolled on first paint — no
   * visible jump from 0. Re-runs on `pathname` because the active tab moves with the route.
   */
  useLayoutEffect(() => {
    const nav = navRef.current
    const tab = activeRef.current
    if (!nav || !tab) return
    nav.scrollLeft = activeTabScrollLeft({
      navScrollWidth: nav.scrollWidth,
      navClientWidth: nav.clientWidth,
      tabOffsetLeft: tab.offsetLeft,
      tabWidth: tab.offsetWidth,
    })
  }, [pathname])

  return (
    // overflow-x-auto + non-shrinking tabs: with `flex-1` alone, every extra destination
    // stole width from the rest until multi-word labels collapsed into an unreadable run at
    // 390px (seen for real once E-2 added an 8th tab). Now each tab keeps a legible minimum
    // and the BAR scrolls instead of the labels crushing — and because the overflow is
    // contained here, the page body still never scrolls horizontally.
    // aria-label is "Primary mobile", not "Primary" — which the desktop Sidebar's nav also uses.
    // This is DEFENSIVE, not a live bug fix: the two are mutually exclusive by breakpoint
    // (Sidebar is `hidden md:flex`, this bar is `md:hidden`), and `display: none` removes a node
    // from the accessibility tree, so a screen reader is never offered two same-named landmarks
    // today. The distinct name means that stays true if either bar is ever shown at both
    // breakpoints, and it disambiguates the two navs for DOM queries and tests meanwhile.
    <nav
      ref={navRef}
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-mist bg-bg/95 backdrop-blur md:hidden"
    >
      {BOTTOM_TABS.map((item) => {
        const Icon = item.icon
        const active = isActive(pathname, item.href!)
        return (
          <Link
            key={item.label}
            href={item.href!}
            ref={active ? activeRef : undefined}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-[4.5rem] shrink-0 grow basis-0 flex-col items-center gap-0.5 whitespace-nowrap py-2 text-[0.625rem] font-medium transition-colors',
              active ? 'text-primary' : 'text-text-muted',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.shortLabel ?? item.label}
          </Link>
        )
      })}
    </nav>
  )
}
