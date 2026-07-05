'use client'

import { useEffect } from 'react'
import { palette } from '@/design/tokens'
import { trackProposalEvent } from './analytics'

/**
 * Wistia video embed for Physician Voices (spec §6.10).
 *
 * Two spec requirements:
 *   1. Restyle Wistia's default blue play button to brand — done via the player
 *      color API (`playerColor=<SUNLIGHTS>` on the embed class), so the accent
 *      comes from the design token, never a hardcoded hex.
 *   2. Track play — binds the Wistia player `play` event and fires video_play
 *      once per media (spec §7).
 *
 * The Wistia runtime (E-v1.js) is the video PLAYER, not an analytics tag — it is
 * the §6.10 integration itself, distinct from the third-party heatmap/replay
 * script that §7 defers to a separate decision.
 */

// SUNLIGHTS accent, hex without '#', for Wistia's class-based playerColor API.
const PLAYER_COLOR = palette.sunlights.replace('#', '')

interface WistiaVideo {
  hasData: () => boolean
  bind: (event: string, handler: () => void) => void
}
declare global {
  interface Window {
    _wq?: Array<{ id: string; onReady?: (video: WistiaVideo) => void }>
  }
}

function ensureScript(src: string, id: string) {
  if (document.getElementById(id)) return
  const s = document.createElement('script')
  s.src = src
  s.id = id
  s.async = true
  document.body.appendChild(s)
}

export default function WistiaPlayer({
  slug,
  mediaId,
  title,
}: {
  slug: string
  mediaId: string
  title: string
}) {
  useEffect(() => {
    if (!mediaId) return
    ensureScript(`https://fast.wistia.com/embed/medias/${mediaId}.jsonp`, `wistia-media-${mediaId}`)
    ensureScript('https://fast.wistia.com/assets/external/E-v1.js', 'wistia-e-v1')

    let played = false
    window._wq = window._wq || []
    window._wq.push({
      id: mediaId,
      onReady: (video) => {
        video.bind('play', () => {
          if (played) return
          played = true
          trackProposalEvent(slug, 'video_play', { mediaId, title })
        })
      },
    })
  }, [slug, mediaId, title])

  // Missing media id → graceful empty frame (content pending, spec §10), no crash.
  return (
    <figure className="overflow-hidden rounded-xl border border-text-inverse/15 bg-black">
      <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
        {mediaId ? (
          <div
            className={`wistia_embed wistia_async_${mediaId} playerColor=${PLAYER_COLOR} videoFoam=true`}
            style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
          >
            &nbsp;
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-inverse/50">
            Video coming soon
          </div>
        )}
      </div>
      <figcaption className="px-4 py-3 font-heading text-sm uppercase tracking-caps text-text-inverse/70">
        {title}
      </figcaption>
    </figure>
  )
}
