'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/brand/Logo'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { BRAND_LINE } from '@/design/brand'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-subtle px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo variant="primary" width={148} priority />
          <span className="font-heading text-xs uppercase tracking-caps text-text-muted">
            Sales Platform
          </span>
        </div>

        <div className="rounded-lg border border-mist bg-bg p-8 shadow-md">
          <h1 className="text-center font-heading text-xl font-bold text-text">Welcome back</h1>
          <p className="mt-1 text-center font-serif text-sm italic text-text-muted">
            Sign in to your territory workspace
          </p>

          {error && (
            <div className="mt-6 rounded-md border border-error/30 bg-error/5 px-3 py-2.5">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {/*
            method="post" is a CREDENTIAL-LEAK GUARD, not a functional choice — this form is
            never actually POSTed anywhere. handleSubmit calls preventDefault(), so after
            hydration the native submit never fires and the method is moot.

            It matters BEFORE hydration. Until React attaches onSubmit, this is plain HTML,
            and a plain form with no method defaults to GET — so a submit in that window
            serializes every field into the URL, putting the user's PASSWORD in the query
            string, browser history, the Referer header, and CDN/access logs. That window is
            real: a slow connection or cold cache plus an Enter keypress is enough. It was hit
            for real during E-2 deploy-preview QA, which is how this was found.

            With method="post" the same pre-hydration submit POSTs instead, and the credentials
            never touch the URL.
          */}
          <form method="post" onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block font-heading text-[0.6875rem] uppercase tracking-caps text-text-muted"
              >
                Email
              </label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block font-heading text-[0.6875rem] uppercase tracking-caps text-text-muted"
              >
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" variant="primary" block loading={loading}>
              {loading ? 'Signing in' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-8 text-center font-heading text-[0.625rem] uppercase tracking-caps text-text-muted">
          {BRAND_LINE}
        </p>
      </div>
    </main>
  )
}
