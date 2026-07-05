'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Logo from '@/components/brand/Logo'
import Button from '@/components/ui/Button'

/**
 * Access-code gate for /p/[slug] (Session B, brief §4).
 *
 * Renders ZERO prospect data — only GHMD branding + a code field — so the
 * pre-auth page leaks nothing about the prospect. On a correct code the server
 * sets the unlock cookie and we refresh to render the proposal.
 */
export default function AccessCodeGate({ slug }: { slug: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/p/${slug}/access`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.ok) {
        router.refresh()
        return
      }
      setError(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 py-16 text-text-inverse">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Logo variant="white" width={180} priority />
        </div>
        <h1 className="text-center font-heading text-2xl font-bold">Confidential proposal</h1>
        <p className="mt-2 text-center font-serif text-text-inverse/70">
          Enter the access code from your GetHairMD representative to continue.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            aria-label="Access code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            className="w-full rounded-lg border border-text-inverse/20 bg-white/5 px-4 py-3 text-center font-heading uppercase tracking-caps text-text-inverse placeholder:text-text-inverse/40 focus:border-accent focus:outline-none"
          />
          {error && (
            <p role="alert" className="text-center text-sm text-accent">
              That code didn&apos;t match. Check with your representative and try again.
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" block loading={loading} disabled={!code.trim()}>
            View proposal
          </Button>
        </form>
      </div>
    </div>
  )
}
