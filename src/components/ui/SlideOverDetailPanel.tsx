'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/design/cn'

/**
 * SlideOverDetailPanel — a right-side detail drawer (spec §4A primitive).
 *
 * INTRODUCED by E-1 (Scoreboard). The spec lists this as an "NIP click-through
 * detail drawer" primitive to ADD to Session A ("reuse for quick-view without
 * leaving the page"); it did not previously exist in this codebase, so E-1 owns
 * creating it. Kept generic (title + subtitle + arbitrary children) so later
 * modules (Pipeline / Dashboard quick-view) reuse it rather than re-inventing.
 *
 * Tokens-only (Hard Rule 8). Accessible: role="dialog" + aria-modal, ESC to close,
 * overlay click to close, focus moved into the panel on open and restored on close,
 * and body scroll locked while open.
 */

export interface SlideOverDetailPanelProps {
  open: boolean
  onClose: () => void
  /** Panel heading (also the dialog's accessible name). */
  title: string
  /** Optional line under the title (e.g. a rank badge or role). */
  subtitle?: ReactNode
  children: ReactNode
}

export default function SlideOverDetailPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
}: SlideOverDetailPanelProps) {
  // Portal target only exists on the client; gate the first render so SSR is a no-op.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // ESC-to-close, focus management, and body-scroll lock — only while open.
  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-text/40"
      />

      {/* Panel */}
      <div
        className={cn(
          'relative flex h-full w-full max-w-md flex-col bg-bg shadow-xl',
          'border-l border-mist',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-mist px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-lg font-bold text-text">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-text-muted">{subtitle}</div>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-subtle hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
