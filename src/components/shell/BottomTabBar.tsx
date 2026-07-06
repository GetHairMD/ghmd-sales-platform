'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/design/cn'
import { BOTTOM_TABS, isActive } from './nav-items'

/**
 * Mobile bottom tab bar (spec §4B — deliberate NIP deviation: reps live on
 * phones, so the pipeline must not hide behind a hamburger). Shown below `md`;
 * the desktop shell uses the Sidebar instead.
 */
export default function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-mist bg-bg/95 backdrop-blur md:hidden"
    >
      {BOTTOM_TABS.map((item) => {
        const Icon = item.icon
        const active = isActive(pathname, item.href!)
        return (
          <Link
            key={item.label}
            href={item.href!}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.625rem] font-medium transition-colors',
              active ? 'text-primary' : 'text-text-muted',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
