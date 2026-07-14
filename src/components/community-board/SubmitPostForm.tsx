'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import SlideOverDetailPanel from '@/components/ui/SlideOverDetailPanel'
import { submitPost } from '@/app/(app)/community-board/actions'
import {
  POST_TYPE_LABEL,
  submittablePostTypes,
  type PostType,
} from '@/lib/community-board/community-board'
import type { Designation } from '@/lib/auth/internal-role'

/**
 * Submit-a-post form (E-2). Rendered in the shared SlideOverDetailPanel primitive (E-1).
 *
 * The type selector is built from `submittablePostTypes(designation)`, so a REP is offered
 * only the four self-serve types — 'announcement' and 'bell_ringing' never appear in their
 * markup at all. That is a UX affordance, NOT the control: the submit action re-checks the
 * type server-side, and the community_board_insert_rep_pending policy is what actually
 * denies a hand-crafted announcement (verified adversarially).
 *
 * A rep's successful submit shows a "Pending review" confirmation rather than a live post —
 * the row exists with status='pending' and only an executive can publish it.
 */
export default function SubmitPostForm({
  open,
  onClose,
  designation,
}: {
  open: boolean
  onClose: () => void
  designation: Designation | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const types = submittablePostTypes(designation)
  const [postType, setPostType] = useState<PostType>(types[0] ?? 'win')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const isRep = designation === 'rep'

  function reset() {
    setTitle('')
    setBody('')
    setError(null)
    setSubmitted(false)
    setPostType(types[0] ?? 'win')
  }

  function close() {
    reset()
    onClose()
  }

  function save() {
    setError(null)
    if (!title.trim()) {
      setError('Give the post a title.')
      return
    }
    startTransition(async () => {
      const res = await submitPost({ postType, title, body: body || null })
      if (!res.ok) {
        setError(res.error ?? 'Could not submit the post.')
        return
      }
      setSubmitted(true)
      router.refresh()
    })
  }

  return (
    <SlideOverDetailPanel
      open={open}
      onClose={close}
      title={submitted ? 'Submitted' : 'New post'}
      subtitle={
        submitted
          ? undefined
          : isRep
            ? 'Your post goes to an executive for review before it appears on the board.'
            : 'Your post publishes to the board immediately.'
      }
    >
      {submitted ? (
        <div className="flex flex-col gap-4">
          <p className="font-body text-sm text-text">
            {isRep
              ? 'Thanks — your post is pending review. An executive will approve or decline it, and you can track its status under "Your submissions".'
              : 'Your post is live on the board.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-mist px-4 py-2 font-body text-sm text-text hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Write another
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md bg-primary px-4 py-2 font-body text-sm text-text-inverse hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs font-medium tracking-caps uppercase text-text-muted">
              Type
            </span>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value as PostType)}
              className="rounded-md border border-mist bg-bg px-3 py-2 font-body text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {POST_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-body text-xs font-medium tracking-caps uppercase text-text-muted">
              Title
            </span>
            <input
              type="text"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the headline?"
              className="rounded-md border border-mist bg-bg px-3 py-2 font-body text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-body text-xs font-medium tracking-caps uppercase text-text-muted">
              Details <span className="normal-case">(optional)</span>
            </span>
            <textarea
              value={body}
              rows={6}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share the context, the play that worked, the link…"
              className="rounded-md border border-mist bg-bg px-3 py-2 font-body text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-md bg-error/10 px-3 py-2 font-body text-sm text-error">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-primary px-4 py-2 font-body text-sm text-text-inverse hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {pending ? 'Submitting…' : isRep ? 'Submit for review' : 'Publish'}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-mist px-4 py-2 font-body text-sm text-text hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </SlideOverDetailPanel>
  )
}
