'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** The slice of the Supabase auth user we read — kept structural to avoid coupling
 *  to the SDK's type-export surface (which varies across versions). */
export interface AuthUserLike {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

/**
 * Best-effort first name for the greeting + user chip. Prefers explicit metadata,
 * falls back to the email local-part. Pure so it's trivially testable.
 */
export function firstNameFrom(user: AuthUserLike | null): string {
  if (!user) return ''
  const meta = user.user_metadata ?? {}
  const explicit =
    (typeof meta.first_name === 'string' && meta.first_name) ||
    (typeof meta.full_name === 'string' && meta.full_name.trim().split(/\s+/)[0]) ||
    (typeof meta.name === 'string' && meta.name.trim().split(/\s+/)[0])
  if (explicit) return explicit
  const local = user.email?.split('@')[0] ?? ''
  if (!local) return ''
  const token = local.split(/[._-]/)[0]
  return token.charAt(0).toUpperCase() + token.slice(1)
}

/** Client-side signed-in user (auth is cached by supabase-js, so this is cheap). */
export function useDisplayName(): { firstName: string; email: string | null } {
  const [user, setUser] = useState<AuthUserLike | null>(null)
  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user ?? null)
    })
    return () => {
      active = false
    }
  }, [])
  return { firstName: firstNameFrom(user), email: user?.email ?? null }
}
