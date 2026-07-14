import { createClient } from '@/lib/supabase/server'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import CommunityBoard from '@/components/community-board/CommunityBoard'
import {
  toBoardPost,
  type BoardPost,
  type BoardPostRow,
} from '@/lib/community-board/community-board'

/**
 * Community Board (E-2, decisions #159 / #162).
 *
 * NOT an exec-only route — and the nav item deliberately has no `execOnly` flag. The feed
 * is a shared internal surface (every internal user sees every published post); it is the
 * REVIEW QUEUE inside this page that is executive-only. Gating the whole route would
 * contradict the SELECT policies.
 *
 * THE FETCH BELOW IS NOT THE SECURITY BOUNDARY — RLS IS.
 * This one unfiltered `select('*')` runs as the AUTHENTICATED user, so the three SELECT
 * policies decide what comes back, per viewer:
 *   • rep       → published posts + their OWN pending/rejected submissions. A rep literally
 *                 cannot receive another rep's pending draft; there is no status filter here
 *                 doing that work, and adding one would be security theatre over RLS.
 *   • executive → every row, any status, any author.
 * The partition below is therefore PRESENTATION only. It is safe precisely because a rep's
 * `pending` bucket can only ever contain their own rows — proven live against both real rep
 * seats (AC5), not merely asserted.
 *
 * Author names come from community_board_authors() (SECURITY DEFINER, internal-gated):
 * community_board_posts.rep_id FKs to auth.users, and internal_users is self_read-only, so
 * there is no other way for even an executive to render a submitter's name.
 */
export default async function CommunityBoardPage() {
  const supabase = createClient()
  const designation = await getViewerDesignation()

  const [{ data: postRows }, { data: authorRows }] = await Promise.all([
    supabase
      .from('community_board_posts')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.rpc('community_board_authors'),
  ])

  const posts: BoardPost[] = ((postRows ?? []) as BoardPostRow[]).map(toBoardPost)

  const authors: Record<string, string> = Object.fromEntries(
    ((authorRows ?? []) as { user_id: string; display_name: string }[]).map((a) => [
      a.user_id,
      a.display_name,
    ]),
  )

  // Presentation partition (see the header note — RLS already decided visibility):
  //   feed    → what the board shows everyone
  //   pending → the exec review queue. A rep's own pending post is EXCLUDED from this
  //             bucket and shown in `mine` instead, so a rep never sees Approve/Reject
  //             controls for anything, including their own submission.
  //   mine    → a rep's own not-yet-published submissions, so they can see the outcome.
  const feed = posts.filter((p) => p.status === 'published')
  const isExec = designation === 'executive'
  const pending = isExec ? posts.filter((p) => p.status === 'pending') : []
  const mine = isExec ? [] : posts.filter((p) => p.status !== 'published')

  return (
    <CommunityBoard
      designation={designation}
      feed={feed}
      pending={pending}
      mine={mine}
      authors={authors}
    />
  )
}
