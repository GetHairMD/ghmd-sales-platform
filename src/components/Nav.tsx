'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_LINKS = [
  { href: '/prospects', label: 'Prospects' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/territories', label: 'Territories' },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()

  if (pathname === '/login') return null

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="bg-[#4681A3] text-white px-6 py-3 flex items-center justify-between">
      <Link href="/" className="font-bold text-lg tracking-tight">
        GHMD Sales
      </Link>
      <div className="flex items-center gap-6">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm transition-colors ${
              pathname.startsWith(link.href)
                ? 'text-white underline underline-offset-4'
                : 'text-white/80 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        ))}
        <button
          onClick={handleSignOut}
          className="text-sm text-white/60 hover:text-white transition-colors ml-2"
        >
          Sign Out
        </button>
      </div>
    </nav>
  )
}
