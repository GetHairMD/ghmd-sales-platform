'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/design/cn'
import Logo from '@/components/brand/Logo'
import { BRAND_LINE } from '@/design/brand'
import { NAV_ITEMS, isActive } from './nav-items'

/**
 * Persistent left sidebar (spec §4B) — dark surface, GHMD reversed lockup +
 * "SALES PLATFORM" wordmark, icon nav with active state. Desktop only; the
 * mobile shell uses BottomTabBar instead (deliberate NIP deviation, spec §4B).
 */
export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-bg-dark text-text-inverse md:flex">
      {/* Brand */}
      <div className="flex flex-col gap-2 px-5 pb-6 pt-6">
        <Logo variant="white" width={132} />
        <span className="font-heading text-[0.625rem] uppercase tracking-caps text-text-inverse/50">
          Sales Platform
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.href ? isActive(pathname, item.href) : false

          const inner = (
            <>
              {active && (
                <span
                  className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent"
                  aria-hidden="true"
                />
              )}
              <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
              <span className="flex-1 text-sm">{item.label}</span>
              {item.comingSoon && (
                <span className="rounded-full bg-text-inverse/10 px-1.5 py-0.5 font-heading text-[0.5625rem] uppercase tracking-caps text-text-inverse/50">
                  Soon
                </span>
              )}
            </>
          )

          if (!item.href) {
            return (
              <span
                key={item.label}
                aria-disabled="true"
                className="relative flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-text-inverse/35"
              >
                {inner}
              </span>
            )
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-base ease-standard',
                active
                  ? 'bg-primary/25 text-text-inverse'
                  : 'text-text-inverse/65 hover:bg-text-inverse/5 hover:text-text-inverse',
              )}
            >
              {inner}
            </Link>
          )
        })}
      </nav>

      {/* Brand line */}
      <div className="px-5 pb-5 pt-4">
        <span className="font-heading text-[0.5625rem] uppercase tracking-caps text-text-inverse/40">
          {BRAND_LINE}
        </span>
      </div>
    </aside>
  )
}
