'use client'

import { useState, useEffect } from 'react'

type ZoomStatus = 'loading' | 'no_token' | 'idle' | 'joining' | 'joined' | 'error'

interface ZoomEmbedProps {
  displayName?: string
  userEmail?: string
}

export default function ZoomEmbed({ displayName, userEmail }: ZoomEmbedProps) {
  const [status, setStatus] = useState<ZoomStatus>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [joinUrl, setJoinUrl] = useState<string | null>(null)

  useEffect(() => {
    checkToken()
  }, [])

  async function checkToken() {
    try {
      const res = await fetch('/api/zoom/status')
      if (!res.ok) throw new Error('no_token')
      const data = await res.json()
      if (!data.connected) {
        setStatus('no_token')
      } else {
        setStatus('idle')
      }
    } catch {
      setStatus('no_token')
    }
  }

  async function joinSession() {
    setStatus('joining')
    try {
      const res = await fetch('/api/zoom/join', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to get join URL')
      }
      const data = await res.json()
      if (!data.joinUrl) throw new Error('No join URL returned')
      setJoinUrl(data.joinUrl)
      setStatus('joined')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      if (msg.includes('expired') || msg.includes('token')) {
        setErrorMsg('Zoom access token has expired. Please reconnect your Zoom account.')
      } else {
        setErrorMsg(msg)
      }
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Checking Zoom connection...
      </div>
    )
  }

  if (status === 'no_token') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Connect your Zoom account to join live training sessions.</p>
        <a
          href="/api/zoom/connect"
          className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          Connect Zoom Account
        </a>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{errorMsg}</p>
        <button
          onClick={() => {
            if (errorMsg.includes('expired')) {
              window.location.href = '/api/zoom/connect'
            } else {
              setStatus('idle')
              setErrorMsg('')
            }
          }}
          className="inline-flex items-center px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted"
        >
          {errorMsg.includes('expired') ? 'Reconnect Zoom' : 'Try Again'}
        </button>
      </div>
    )
  }

  if (status === 'joined' && joinUrl) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Your Zoom session is ready.</p>
        <a
          href={joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          Open Zoom Session →
        </a>
        <p className="text-xs text-muted-foreground">Opens in Zoom. Return here when your session ends.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Ready to join your live GHMD training session.</p>
      <button
        onClick={joinSession}
        disabled={status === 'joining'}
        className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {status === 'joining' ? 'Connecting...' : 'Join Training Session'}
      </button>
    </div>
  )
    }
