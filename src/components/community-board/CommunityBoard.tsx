'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Inbox, Plus, Search } from 'lucide-react'
import { cn } from '@/design/cn'
import EmptyState from '@/components/ui/EmptyState'
import PostCard from './PostCard'
import SubmitPostForm from './SubmitPostForm'
import { reviewPost } from '@/app/(app)/community-board/actions'
import {
  FILTER_TAGS,
  FILTER_TAG_LABEL,
  sortPosts,
  visiblePosts,
  type BoardPost,
  type FilterTag,
} from '@/lib/community-board/community-board'
import type { Designation } from '@/lib/auth/internal-role'

/**
 * Community Board (E-2) — feed + executive review queue + submit entry point.
 *
 * This component NEVER fetches and NEVER decides visibility: the server page hands it rows
 * that RLS has already filtered per viewer. `pending` arrives EMPTY for a rep by
 * construction, so the review tab and every Approve/Reject control are unreachable for
 * them — the UI gate is cosmetic, and the real one is the absence of any rep UPDATE policy.
 */
export default function CommunityBoard({
  designation,
  feed,
  pending,
  mine,
  authors,
}: {
  designation: Designation | null
  feed: BoardPost[]
  pending: BoardPost[]
  mine: BoardPost[]
  authors: Record<string, string>
}) {
  const router = useRouter()
  const [busyId, startTransition] = useTransition()

  const isExec = designation === 'executive'
  const canPost = designation !== null

  const [tab, setTab] = useState<'feed' | 'review'>('feed')
  const [tag, setTag] = useState<FilterTag | null>(null)
  const [query, setQuery] = useState('')
  const [submitOpen, setSubmitOpen] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const shown = useMemo(() => visiblePosts(feed, { tag, query }), [feed, tag, query])
  const mineSorted = useMemo(() => sortPosts(mine), [mine])
  const pendingSorted = useMemo(() => sortPosts(pending), [pending])

  function decide(postId: string, decision: 'approve' | 'reject') {
    setReviewError(null)
    startTransition(async () => {
      const res = await reviewPost(postId, decision)
      if (!res.ok) setReviewError(res.error ?? 'Could not record the decision.')
      else router.refresh()
    })
  }

  return (
    <main className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">Community Board</h1>
          <p className="mt-1 font-body text-sm text-text-muted">
            Wins, announcements, materials, and training — plus every bell rung on a close.
          </p>
        </div>
        {canPost && (
          <button
            type="button"
            onClick={() => setSubmitOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-body text-sm text-text-inverse hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="h-4 w-4" />
            New post
          </button>
        )}
      </div>

      {/* Tabs — the review tab exists ONLY for an executive. */}
      {isExec && (
        <div className="mb-4 flex gap-1 border-b border-mist" role="tablist">
          {(
            [
              ['feed', 'Feed', feed.length],
              ['review', 'Pending Review', pending.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 font-body text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                tab === key
                  ? 'border-primary font-medium text-text'
                  : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {label}
              {count > 0 && (
                <span
                  className={cn(
                    'ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
                    key === 'review' ? 'bg-warning/15 text-warning' : 'bg-mist text-text-muted',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {tab === 'review' && isExec ? (
        <section aria-label="Pending review">
          {reviewError && (
            <p role="alert" className="mb-3 rounded-md bg-error/10 px-3 py-2 font-body text-sm text-error">
              {reviewError}
            </p>
          )}
          {pendingSorted.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing waiting for review"
              description="Posts submitted by reps land here for approval before they reach the board."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {pendingSorted.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  authors={authors}
                  action={
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => decide(p.id, 'approve')}
                        disabled={busyId}
                        className="rounded-md bg-success px-3 py-1.5 font-body text-xs font-medium text-text-inverse hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(p.id, 'reject')}
                        disabled={busyId}
                        className="rounded-md border border-mist px-3 py-1.5 font-body text-xs font-medium text-text hover:bg-bg-subtle disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        Reject
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Filters. bell_ringing has no chip on purpose — bells survive every tag. */}
          <div className="mb-4 flex flex-col gap-3">
            <label className="relative">
              <span className="sr-only">Search posts</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the board…"
                className="w-full rounded-md border border-mist bg-bg py-2 pl-9 pr-3 font-body text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {([null, ...FILTER_TAGS] as const).map((t) => {
                const active = tag === t
                return (
                  <button
                    key={t ?? 'all'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTag(t)}
                    className={cn(
                      'rounded-full border px-3 py-1 font-body text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active
                        ? 'border-primary bg-primary text-text-inverse'
                        : 'border-mist bg-bg text-text-muted hover:text-text',
                    )}
                  >
                    {t === null ? 'All' : FILTER_TAG_LABEL[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* A rep's own not-yet-published submissions, so they can see the outcome. */}
          {mineSorted.length > 0 && (
            <section aria-label="Your submissions" className="mb-6">
              <h2 className="mb-2 font-heading text-sm font-semibold tracking-caps uppercase text-text-muted">
                Your submissions
              </h2>
              <div className="flex flex-col gap-3">
                {mineSorted.map((p) => (
                  <PostCard key={p.id} post={p} authors={authors} />
                ))}
              </div>
            </section>
          )}

          <section aria-label="Board feed">
            {shown.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={feed.length === 0 ? 'The board is quiet' : 'No posts match'}
                description={
                  feed.length === 0
                    ? 'Wins, announcements, and training land here — and a bell rings on every close.'
                    : 'Try a different tag or clear the search.'
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {shown.map((p) => (
                  <PostCard key={p.id} post={p} authors={authors} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {canPost && (
        <SubmitPostForm
          open={submitOpen}
          onClose={() => setSubmitOpen(false)}
          designation={designation}
        />
      )}
    </main>
  )
}
