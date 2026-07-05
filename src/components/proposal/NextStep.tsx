'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { brand } from '@/design/tokens'
import CalendlyEmbed from './CalendlyEmbed'
import { NEXT_STEP_REP, scarcitySentence } from './constants'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Section 18 — dark Next Step (spec §6.18). Embedded Calendly is the PRIMARY
 * action; the message form is SECONDARY (posts to /p/[slug]/message → prospect
 * timeline). Repeats the scarcity line in small text and closes on the brand
 * line. No viability semantics (Hard Rule 2).
 */
export default function NextStep({
  slug,
  firstDisplay,
  territoryName,
  calendlyUrl,
}: {
  slug: string
  firstDisplay: string
  territoryName: string | null
  calendlyUrl: string | null
}) {
  const territory = territoryName?.trim() || 'your territory'
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch(`/p/${slug}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      })
      if (!res.ok) throw new Error('send failed')
      setStatus('sent')
      setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section id="next-step" className="scroll-mt-16 bg-black px-6 py-16 text-text-inverse sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="max-w-3xl font-heading text-3xl font-bold sm:text-4xl">
          {firstDisplay}, ready to see if{' '}
          <span className="font-serif italic text-accent">{territory}</span> is right for you?
        </h2>

        {/* Representative card */}
        <Card padding="lg" className="mt-8 border-text-inverse/15 bg-black text-text-inverse">
          <div className="font-heading text-xs uppercase tracking-caps text-text-inverse/50">
            Your representative
          </div>
          <div className="mt-2 font-heading text-xl font-bold text-text-inverse">
            {NEXT_STEP_REP.name}
          </div>
          <div className="font-heading text-sm uppercase tracking-caps text-accent">
            {NEXT_STEP_REP.title}
          </div>
          <p className="mt-3 font-serif text-base text-text-inverse/80">{NEXT_STEP_REP.blurb}</p>
        </Card>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* Primary: embedded Calendly */}
          <div>
            <h3 className="font-heading text-sm uppercase tracking-caps text-text-inverse/60">
              Book a conversation
            </h3>
            <div className="mt-4">
              <CalendlyEmbed slug={slug} calendlyUrl={calendlyUrl} />
            </div>
          </div>

          {/* Secondary: message form */}
          <div>
            <h3 className="font-heading text-sm uppercase tracking-caps text-text-inverse/60">
              Or send a message
            </h3>
            {status === 'sent' ? (
              <Card padding="lg" className="mt-4">
                <p className="font-serif text-base text-text">
                  Thank you — your message has been sent. {NEXT_STEP_REP.name} will be in touch.
                </p>
              </Card>
            ) : (
              <form onSubmit={onSubmit} className="mt-4 space-y-4">
                <label className="block">
                  <span className="font-heading text-xs uppercase tracking-caps text-text-inverse/60">
                    Message
                  </span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    required
                    className="mt-2 w-full rounded-md border border-text-inverse/20 bg-black px-3 py-2 font-body text-text-inverse placeholder:text-text-inverse/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Tell us what you'd like to discuss…"
                  />
                </label>
                <Button type="submit" variant="primary" size="lg" loading={status === 'sending'}>
                  Send message
                </Button>
                {status === 'error' && (
                  <p className="font-body text-sm text-accent">
                    Something went wrong. Please try again or use the scheduler.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Repeat scarcity line — small text (spec §6.5) */}
        <p className="mx-auto mt-12 max-w-3xl text-center font-serif text-sm text-text-inverse/60">
          {scarcitySentence(territoryName)}
        </p>

        {/* Brand line */}
        <p className="mt-8 text-center font-heading text-sm uppercase tracking-caps text-accent">
          {brand.line}
        </p>
      </div>
    </section>
  )
}
