'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import {
  isExecSubmittable,
  isRepSubmittable,
  type PostType,
} from '@/lib/community-board/community-board'

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface SubmitPostInput {
  postType: PostType
  title: string
  body: string | null
}

/**
 * Author a Community Board post (E-2, decision #162).
 *
 * TWO DISTINCT WRITE PATHS, chosen by the caller's designation:
 *   • EXECUTIVE → status 'published'. Live immediately, no review.
 *   • REP       → status 'pending', one of the four self-serve types only. Enters the
 *                 executive review queue; it is NOT live and the rep cannot make it live.
 *
 * Runs as the AUTHENTICATED user (never the service role), so RLS is the hard boundary:
 * community_board_insert_executive / community_board_insert_rep_pending decide what
 * actually lands. The designation branch and the type check below are defense-in-depth —
 * they produce a clean error instead of an opaque RLS failure, and they are NOT the thing
 * keeping a rep from self-publishing. Proven by the adversarial pass: a rep sending
 * status='published' straight at PostgREST is denied by the policy, with no app code in
 * the path at all.
 *
 * `status` is ALWAYS set explicitly. It must be: the column DEFAULT is 'published' (which
 * is what lets the bell-ringing trigger keep working untouched), so a rep INSERT that
 * omitted status would default to 'published' and be DENIED by the rep policy. Fail-closed,
 * but it would look like a mystery bug — hence the explicitness here and the test on it.
 */
export async function submitPost(input: SubmitPostInput): Promise<ActionResult> {
  const designation = await getViewerDesignation()
  if (designation === null) {
    return { ok: false, error: 'You do not have access to the Community Board.' }
  }

  const title = input.title.trim()
  if (!title) return { ok: false, error: 'A title is required.' }
  if (title.length > 200) return { ok: false, error: 'Title must be 200 characters or fewer.' }

  const body = input.body?.trim() ? input.body.trim() : null

  const isRep = designation === 'rep'
  if (isRep && !isRepSubmittable(input.postType)) {
    // 'announcement' and 'bell_ringing' land here. The RLS policy would deny them anyway;
    // this just says so in words the UI can show.
    return {
      ok: false,
      error: `Reps cannot post "${input.postType}". Choose a win, materials, training, or competitive post.`,
    }
  }
  if (!isRep && !isExecSubmittable(input.postType)) {
    // Guards the exec path against 'bell_ringing', which is trigger-written only.
    return { ok: false, error: `"${input.postType}" posts cannot be authored by hand.` }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not authenticated' }

  const { error } = await supabase.from('community_board_posts').insert({
    post_type: input.postType,
    // Authorship is stamped to the caller. The rep policy additionally REQUIRES
    // rep_id = auth.uid(), so a rep cannot attribute a post to a different rep.
    rep_id: user.id,
    title,
    body,
    status: isRep ? 'pending' : 'published',
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/community-board')
  return { ok: true }
}

/**
 * Approve or reject a pending post — EXECUTIVE ONLY.
 *
 * Sends ONLY `status`. reviewed_by / reviewed_at are deliberately NOT sent: the
 * stamp_community_board_review() BEFORE UPDATE trigger sets them from auth.uid() and now(),
 * overwriting anything a client supplies. Sending them here would be dead weight that
 * implies the client is the source of audit truth when it is not (an executive who forged
 * both columns had them overridden in the adversarial pass).
 *
 * The community_board_update_executive_review policy is the hard boundary — there is NO rep
 * UPDATE policy on this table, so a rep calling this action is denied at the database even
 * if they bypass the check below.
 */
export async function reviewPost(
  postId: string,
  decision: 'approve' | 'reject',
): Promise<ActionResult> {
  if (decision !== 'approve' && decision !== 'reject') {
    return { ok: false, error: `invalid decision "${decision}"` }
  }
  if ((await getViewerDesignation()) !== 'executive') {
    return { ok: false, error: 'Only an executive can review Community Board posts.' }
  }

  const supabase = createClient()
  const { error } = await supabase
    .from('community_board_posts')
    .update({ status: decision === 'approve' ? 'published' : 'rejected' })
    .eq('id', postId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/community-board')
  return { ok: true }
}
