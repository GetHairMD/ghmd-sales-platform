import { cn } from '@/design/cn'
import {
  POST_TYPE_LABEL,
  authorLabel,
  formatPostDate,
  type BoardPost,
} from '@/lib/community-board/community-board'

/**
 * One post on the board. Presentational only — no fetching, no role logic, no actions.
 * The review controls live in PendingReviewQueue so that a card can never accidentally
 * render an Approve button in the feed.
 */

/** Status chip. Only ever rendered for a rep's own pending/rejected submission. */
function StatusBadge({ status }: { status: BoardPost['status'] }) {
  if (status === 'published') return null
  const isPending = status === 'pending'
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium tracking-caps uppercase',
        isPending ? 'bg-warning/10 text-warning' : 'bg-error/10 text-error',
      )}
    >
      {isPending ? 'Pending review' : 'Not published'}
    </span>
  )
}

export default function PostCard({
  post,
  authors,
  action,
}: {
  post: BoardPost
  authors: Readonly<Record<string, string>>
  /** Optional trailing controls (the review queue's Approve/Reject). */
  action?: React.ReactNode
}) {
  const isBell = post.postType === 'bell_ringing'

  return (
    <article
      className={cn(
        'rounded-lg border bg-bg p-4',
        // A bell ring is the celebration beat of the board — give it the accent edge so it
        // reads as an event, not as another announcement.
        isBell ? 'border-accent' : 'border-mist',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium tracking-caps uppercase',
            isBell ? 'bg-accent/20 text-text' : 'bg-mist text-text-muted',
          )}
        >
          {POST_TYPE_LABEL[post.postType]}
        </span>
        {post.pinned && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium tracking-caps uppercase text-primary">
            Pinned
          </span>
        )}
        <StatusBadge status={post.status} />
      </div>

      <h3 className="mt-2 font-heading text-base font-semibold text-text">{post.title}</h3>
      {post.body && (
        <p className="mt-1 whitespace-pre-wrap font-body text-sm text-text-muted">{post.body}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-xs text-text-muted">
          {authorLabel(post.repId, authors)} · {formatPostDate(post.createdAt)}
        </p>
        {action}
      </div>
    </article>
  )
}
