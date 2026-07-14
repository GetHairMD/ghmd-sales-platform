/**
 * Community Board (E-2) — pure domain logic for the board feed.
 *
 * Everything here is a pure function over already-fetched rows: no Supabase client, no
 * fetching, no React. The security boundary is RLS (see migration 20260714170100) — this
 * module NEVER decides who may read or write anything, it only decides what a viewer who
 * has ALREADY been handed a set of rows sees arranged how. The one role-shaped export,
 * `submittablePostTypes()`, exists to populate a <select>; it is a UX convenience that
 * MIRRORS the rep INSERT policy, and is deliberately re-asserted server-side in the
 * submit action and enforced for real by the policy's WITH CHECK.
 */

export const POST_TYPES = [
  'bell_ringing',
  'announcement',
  'win',
  'materials',
  'training',
  'competitive',
] as const
export type PostType = (typeof POST_TYPES)[number]

export const POST_STATUSES = ['pending', 'published', 'rejected'] as const
export type PostStatus = (typeof POST_STATUSES)[number]

/**
 * The four self-serve types a REP may submit (decision #162). Mirrors the
 * community_board_insert_rep_pending WITH CHECK exactly — if one list changes the other
 * must too, which is why a test asserts they agree.
 *   • 'announcement' is withheld: it carries institutional voice.
 *   • 'bell_ringing' is withheld: it is trigger-written only, and a client-forgeable bell
 *     would let a rep fake a close on the celebration feed.
 */
export const REP_SUBMITTABLE_POST_TYPES = ['win', 'materials', 'training', 'competitive'] as const

/** An executive may author any type EXCEPT bell_ringing, which stays trigger-only. */
export const EXEC_SUBMITTABLE_POST_TYPES = [
  'announcement',
  'win',
  'materials',
  'training',
  'competitive',
] as const

/**
 * The filter chips. bell_ringing is deliberately ABSENT: per the E-2 spec framing, Bell
 * Ringing *lands on* the board rather than being a user-facing filterable category — see
 * `filterPosts`, where bells survive every tag filter.
 */
export const FILTER_TAGS = [
  'announcement',
  'win',
  'materials',
  'training',
  'competitive',
] as const
export type FilterTag = (typeof FILTER_TAGS)[number]

export const POST_TYPE_LABEL: Record<PostType, string> = {
  bell_ringing: 'Bell Ringing',
  announcement: 'Announcement',
  win: 'Win',
  materials: 'Materials',
  training: 'Training',
  competitive: 'Competitive',
}

/** Plural chip labels (the filter row reads as categories, not as single posts). */
export const FILTER_TAG_LABEL: Record<FilterTag, string> = {
  announcement: 'Announcements',
  win: 'Wins',
  materials: 'Materials',
  training: 'Training',
  competitive: 'Competitive',
}

export function isPostType(v: unknown): v is PostType {
  return typeof v === 'string' && (POST_TYPES as readonly string[]).includes(v)
}

export function isRepSubmittable(v: unknown): v is PostType {
  return typeof v === 'string' && (REP_SUBMITTABLE_POST_TYPES as readonly string[]).includes(v)
}

export function isExecSubmittable(v: unknown): v is PostType {
  return typeof v === 'string' && (EXEC_SUBMITTABLE_POST_TYPES as readonly string[]).includes(v)
}

/** The post types a viewer of this designation may put in the submit form's selector. */
export function submittablePostTypes(
  designation: 'executive' | 'rep' | null,
): readonly PostType[] {
  if (designation === 'executive') return EXEC_SUBMITTABLE_POST_TYPES
  if (designation === 'rep') return REP_SUBMITTABLE_POST_TYPES
  return [] // not on the allow-list → no write surface at all (fail closed)
}

/** The raw community_board_posts row shape as PostgREST returns it. */
export interface BoardPostRow {
  id: string
  post_type: string
  rep_id: string | null
  territory_id: string | null
  title: string
  body: string | null
  pinned: boolean
  created_at: string
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface BoardPost {
  id: string
  postType: PostType
  repId: string | null
  territoryId: string | null
  title: string
  body: string | null
  pinned: boolean
  createdAt: string
  status: PostStatus
  reviewedBy: string | null
  reviewedAt: string | null
}

export function toBoardPost(row: BoardPostRow): BoardPost {
  return {
    id: row.id,
    // The DB CHECK constrains both columns, so an out-of-range value is impossible; the
    // fallbacks exist so a hypothetical bad row degrades instead of crashing the feed.
    postType: isPostType(row.post_type) ? row.post_type : 'announcement',
    repId: row.rep_id,
    territoryId: row.territory_id,
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    createdAt: row.created_at,
    status: (POST_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as PostStatus)
      : 'published',
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  }
}

/**
 * Feed order: pinned first, then newest first. Mirrors the DB index
 * (status, pinned desc, created_at desc) so the UI and the query agree.
 * Non-mutating — callers pass server-fetched arrays around freely.
 */
export function sortPosts(posts: readonly BoardPost[]): BoardPost[] {
  return [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export interface FeedFilter {
  /** null = "All". */
  tag: FilterTag | null
  /** Free text over title + body; blank = no search. */
  query: string
}

/**
 * Apply the tag chip + the search box.
 *
 * TAG: a bell_ringing post survives EVERY tag filter (it has no chip of its own, and the
 * spec frames Bell Ringing as landing on the board rather than as a filterable category).
 * So selecting "Training" shows training posts AND the bells. This is deliberate and
 * pinned by test — it is the one non-obvious rule in this module.
 *
 * SEARCH: applies uniformly to every post INCLUDING bells — search is a lookup, not a
 * category, so a bell that doesn't match the query is correctly hidden.
 */
export function filterPosts(posts: readonly BoardPost[], filter: FeedFilter): BoardPost[] {
  const q = filter.query.trim().toLowerCase()

  return posts.filter((p) => {
    const tagOk =
      filter.tag === null || p.postType === filter.tag || p.postType === 'bell_ringing'
    if (!tagOk) return false

    if (!q) return true
    return (
      p.title.toLowerCase().includes(q) || (p.body?.toLowerCase().includes(q) ?? false)
    )
  })
}

/** Sort + filter in the order the feed renders them. */
export function visiblePosts(
  posts: readonly BoardPost[],
  filter: FeedFilter,
): BoardPost[] {
  return sortPosts(filterPosts(posts, filter))
}

/**
 * Display name for a post's author, from the community_board_authors() map.
 * A NULL rep_id (an unassigned prospect's bell ring) and an author missing from the map
 * both fall back to the institutional label — never 'null', never a raw UUID
 * (CLAUDE.md: full_name is nullable; every surface must degrade gracefully).
 */
export function authorLabel(
  repId: string | null,
  authors: Readonly<Record<string, string>>,
): string {
  if (!repId) return 'GetHairMD'
  return authors[repId] ?? 'GetHairMD'
}

/** Short, locale-stable date for a post card. */
export function formatPostDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
