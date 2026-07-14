import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BOTTOM_TABS, NAV_ITEMS, navItemsFor } from '../../components/shell/nav-items'
import {
  EXEC_SUBMITTABLE_POST_TYPES,
  FILTER_TAGS,
  REP_SUBMITTABLE_POST_TYPES,
  authorLabel,
  filterPosts,
  formatPostDate,
  isExecSubmittable,
  isRepSubmittable,
  sortPosts,
  submittablePostTypes,
  toBoardPost,
  visiblePosts,
  type BoardPost,
  type BoardPostRow,
} from '../community-board/community-board'

/**
 * E-2 Community Board guardrails. Same two layers as E-1:
 *   • pure-function unit tests for the feed semantics (the bell-survives-every-tag rule,
 *     pinned-first ordering, search, the role→submittable-type mapping, NULL-name fallback)
 *   • source-scan security invariants on the migration — the four policies, the grant layer,
 *     the no-self-approval invariant, the load-bearing status DEFAULT, and the audit trigger —
 *     plus token cleanliness (Hard Rule 8) on every new surface.
 *
 * These scans pin the migration TEXT. The live-DB behaviour they stand for was proven
 * adversarially against both real provisioned rep seats (QA Rep A / QA Rep B, decision #161)
 * during the build; see the PR body for that evidence.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Strip SQL comments, so ABSENCE checks can't be fooled by prose. */
function sqlCodeOnly(src: string): string {
  return src.replace(/--.*$/gm, '')
}

const RAW_TAILWIND_COLOR =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/

const PAGE = 'src/app/(app)/community-board/page.tsx'
const ACTIONS = 'src/app/(app)/community-board/actions.ts'
const BOARD = 'src/components/community-board/CommunityBoard.tsx'
const CARD = 'src/components/community-board/PostCard.tsx'
const FORM = 'src/components/community-board/SubmitPostForm.tsx'
const LIB = 'src/lib/community-board/community-board.ts'

function migrationPath(suffix: string): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) => f.endsWith(suffix))
  if (!hit) throw new Error(`${suffix} migration not found`)
  return `${dir}/${hit}`
}

const post = (over: Partial<BoardPost> = {}): BoardPost => ({
  id: 'p1',
  postType: 'win',
  repId: 'rep-a',
  territoryId: null,
  title: 'Closed Westlake',
  body: 'Great call.',
  pinned: false,
  createdAt: '2026-07-10T12:00:00Z',
  status: 'published',
  reviewedBy: null,
  reviewedAt: null,
  ...over,
})

// ─────────────────────────────────────────────────────────────────────────────
// Feed semantics
// ─────────────────────────────────────────────────────────────────────────────
describe('filterPosts — tag chips', () => {
  const wins = post({ id: 'w', postType: 'win' })
  const training = post({ id: 't', postType: 'training' })
  const bell = post({ id: 'b', postType: 'bell_ringing', title: '🔔 Alex closed Austin!' })

  it('a null tag ("All") shows everything', () => {
    expect(filterPosts([wins, training, bell], { tag: null, query: '' }).map((p) => p.id)).toEqual([
      'w',
      't',
      'b',
    ])
  })

  it('a tag narrows to that post type', () => {
    expect(
      filterPosts([wins, training, bell], { tag: 'training', query: '' }).map((p) => p.id),
    ).toContain('t')
    expect(
      filterPosts([wins, training, bell], { tag: 'training', query: '' }).map((p) => p.id),
    ).not.toContain('w')
  })

  it('bell_ringing survives EVERY tag filter (it is not a filterable category)', () => {
    for (const tag of FILTER_TAGS) {
      const ids = filterPosts([wins, training, bell], { tag, query: '' }).map((p) => p.id)
      expect(ids, `a bell must still show under the "${tag}" chip`).toContain('b')
    }
  })

  it('has no bell_ringing chip to select in the first place', () => {
    expect(FILTER_TAGS).not.toContain('bell_ringing')
  })
})

describe('filterPosts — search', () => {
  const a = post({ id: 'a', title: 'Westlake win', body: null })
  const b = post({ id: 'b', title: 'Nothing', body: 'mentions westlake in the body' })
  const bell = post({ id: 'bell', postType: 'bell_ringing', title: 'Dallas bell', body: null })

  it('matches title case-insensitively', () => {
    expect(filterPosts([a, b, bell], { tag: null, query: 'WESTLAKE' }).map((p) => p.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('matches body too', () => {
    expect(filterPosts([b], { tag: null, query: 'in the body' }).map((p) => p.id)).toEqual(['b'])
  })

  it('hides a non-matching BELL — search is a lookup, not a category', () => {
    expect(filterPosts([a, bell], { tag: null, query: 'westlake' }).map((p) => p.id)).not.toContain(
      'bell',
    )
  })

  it('a blank / whitespace query filters nothing out', () => {
    expect(filterPosts([a, b, bell], { tag: null, query: '   ' })).toHaveLength(3)
  })
})

describe('sortPosts — pinned first, then newest', () => {
  it('pins float above newer unpinned posts', () => {
    const old = post({ id: 'old-pinned', pinned: true, createdAt: '2026-01-01T00:00:00Z' })
    const fresh = post({ id: 'new', pinned: false, createdAt: '2026-07-14T00:00:00Z' })
    expect(sortPosts([fresh, old]).map((p) => p.id)).toEqual(['old-pinned', 'new'])
  })

  it('orders unpinned posts newest first', () => {
    const older = post({ id: 'older', createdAt: '2026-07-01T00:00:00Z' })
    const newer = post({ id: 'newer', createdAt: '2026-07-12T00:00:00Z' })
    expect(sortPosts([older, newer]).map((p) => p.id)).toEqual(['newer', 'older'])
  })

  it('does not mutate its input', () => {
    const input = [post({ id: 'a' }), post({ id: 'b', pinned: true })]
    sortPosts(input)
    expect(input.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('visiblePosts filters AND sorts', () => {
    const pinnedWin = post({ id: 'pw', postType: 'win', pinned: true, title: 'alpha' })
    const newWin = post({ id: 'nw', postType: 'win', createdAt: '2026-07-14T00:00:00Z', title: 'alpha' })
    const other = post({ id: 'o', postType: 'training', title: 'zzz' })
    expect(visiblePosts([newWin, other, pinnedWin], { tag: 'win', query: 'alpha' }).map((p) => p.id)).toEqual(
      ['pw', 'nw'],
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Role → submittable types (must mirror the rep INSERT policy exactly)
// ─────────────────────────────────────────────────────────────────────────────
describe('submittablePostTypes — the selector mirrors the RLS WITH CHECK', () => {
  it('a rep is offered exactly win | materials | training | competitive', () => {
    expect(submittablePostTypes('rep')).toEqual(['win', 'materials', 'training', 'competitive'])
  })

  it('a rep is NEVER offered announcement or bell_ringing', () => {
    expect(submittablePostTypes('rep')).not.toContain('announcement')
    expect(submittablePostTypes('rep')).not.toContain('bell_ringing')
    expect(isRepSubmittable('announcement')).toBe(false)
    expect(isRepSubmittable('bell_ringing')).toBe(false)
  })

  it('an executive is offered every type EXCEPT bell_ringing (trigger-written only)', () => {
    expect(submittablePostTypes('executive')).toContain('announcement')
    expect(submittablePostTypes('executive')).not.toContain('bell_ringing')
    expect(isExecSubmittable('bell_ringing')).toBe(false)
  })

  it('a non-allow-listed viewer gets NO write surface (fail closed)', () => {
    expect(submittablePostTypes(null)).toEqual([])
  })

  it('every rep-submittable type is also exec-submittable (execs are a superset)', () => {
    for (const t of REP_SUBMITTABLE_POST_TYPES) {
      expect(EXEC_SUBMITTABLE_POST_TYPES).toContain(t)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Row mapping + NULL-name fallback (CLAUDE.md: never render 'null')
// ─────────────────────────────────────────────────────────────────────────────
describe('toBoardPost + authorLabel', () => {
  const row: BoardPostRow = {
    id: 'x',
    post_type: 'materials',
    rep_id: 'rep-a',
    territory_id: null,
    title: 'Deck v3',
    body: null,
    pinned: true,
    created_at: '2026-07-14T00:00:00Z',
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
  }

  it('maps a PostgREST row into the view model', () => {
    expect(toBoardPost(row)).toMatchObject({
      id: 'x',
      postType: 'materials',
      status: 'pending',
      pinned: true,
    })
  })

  it('resolves a known author from the map', () => {
    expect(authorLabel('rep-a', { 'rep-a': 'QA Rep A' })).toBe('QA Rep A')
  })

  it('falls back to the institutional label for a NULL rep_id (unassigned close)', () => {
    expect(authorLabel(null, {})).toBe('GetHairMD')
  })

  it('never renders a raw UUID or "null" for an author missing from the map', () => {
    const label = authorLabel('unknown-uuid', {})
    expect(label).toBe('GetHairMD')
    expect(label).not.toContain('unknown-uuid')
    expect(label.toLowerCase()).not.toContain('null')
  })

  it('formatPostDate degrades to empty string on an unparseable date', () => {
    expect(formatPostDate('not-a-date')).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Migration — the no-self-approval invariant
// ─────────────────────────────────────────────────────────────────────────────
describe('e2 migration — rep INSERT is pending-only, self-authored, four types', () => {
  const code = sqlCodeOnly(read(migrationPath('_e2_community_board_review.sql')))
  const repPolicy =
    code.match(/create\s+policy\s+community_board_insert_rep_pending[\s\S]*?;/i)?.[0] ?? ''

  it('the rep INSERT policy exists and is found', () => {
    expect(repPolicy, 'rep INSERT policy must be present').toBeTruthy()
  })

  it("admits ONLY status='pending' — the rep can never insert a published row", () => {
    expect(repPolicy).toMatch(/status\s*=\s*'pending'/i)
    expect(repPolicy).not.toMatch(/status\s*=\s*'published'/i)
  })

  it('requires rep_id = auth.uid() (no authoring as another rep)', () => {
    expect(repPolicy).toMatch(/rep_id\s*=\s*\(select\s+auth\.uid\(\)\)/i)
  })

  it('restricts post_type to the four self-serve types — never announcement/bell_ringing', () => {
    expect(repPolicy).toMatch(/post_type\s+in\s*\(\s*'win'\s*,\s*'materials'\s*,\s*'training'\s*,\s*'competitive'\s*\)/i)
    expect(repPolicy).not.toMatch(/'announcement'/i)
    expect(repPolicy).not.toMatch(/'bell_ringing'/i)
  })

  it('requires the caller to actually be a rep', () => {
    expect(repPolicy).toMatch(/designation\s*=\s*'rep'/i)
  })
})

describe('e2 migration — only an executive can review, and there is no rep UPDATE path', () => {
  const code = sqlCodeOnly(read(migrationPath('_e2_community_board_review.sql')))

  it('creates EXACTLY ONE update policy, and it is the executive review one', () => {
    const updatePolicies = code.match(/create\s+policy\s+(\w+)[\s\S]{0,400}?for\s+update/gi) ?? []
    expect(updatePolicies.length, 'a second UPDATE policy would be a self-approval hole').toBe(1)
    expect(code).toMatch(/create\s+policy\s+community_board_update_executive_review[\s\S]*?for\s+update/i)
  })

  it('gates the review UPDATE on designation = executive in BOTH using and with check', () => {
    const policy =
      code.match(/create\s+policy\s+community_board_update_executive_review[\s\S]*?;/i)?.[0] ?? ''
    const execChecks = policy.match(/designation\s*=\s*'executive'/gi) ?? []
    expect(execChecks.length, 'both USING and WITH CHECK must require executive').toBeGreaterThanOrEqual(2)
  })

  it("review is one-way: WITH CHECK admits only published|rejected, never back to pending", () => {
    const policy =
      code.match(/create\s+policy\s+community_board_update_executive_review[\s\S]*?;/i)?.[0] ?? ''
    expect(policy).toMatch(/status\s+in\s*\(\s*'published'\s*,\s*'rejected'\s*\)/i)
  })

  it('creates NO delete policy and leaves DELETE revoked (a rejected post is retained)', () => {
    expect(code).not.toMatch(/create\s+policy[\s\S]{0,300}for\s+delete/i)
    expect(code).toMatch(/revoke\s+delete,\s*truncate\s+on\s+public\.community_board_posts\s+from\s+authenticated/i)
  })
})

describe('e2 migration — the grant layer is set independently of the policies', () => {
  const code = sqlCodeOnly(read(migrationPath('_e2_community_board_review.sql')))

  it('GRANTs insert+update to authenticated (without it, every policy is silently inert)', () => {
    expect(code).toMatch(/grant\s+insert,\s*update\s+on\s+public\.community_board_posts\s+to\s+authenticated/i)
  })

  it('keeps anon fully revoked — no new anon surface', () => {
    expect(code).toMatch(/revoke\s+all\s+on\s+public\.community_board_posts\s+from\s+anon/i)
    expect(code).not.toMatch(/grant\s+\w+[\w,\s]*\s+on\s+public\.community_board_posts\s+to\s+[\w,\s]*anon/i)
  })

  it('drops E-1\'s status-blind SELECT policy (it would leak every rep\'s pending drafts)', () => {
    expect(code).toMatch(/drop\s+policy\s+if\s+exists\s+community_board_select_internal/i)
  })

  it('the published SELECT policy is status-scoped', () => {
    const policy =
      code.match(/create\s+policy\s+community_board_select_published[\s\S]*?;/i)?.[0] ?? ''
    expect(policy).toMatch(/status\s*=\s*'published'/i)
  })

  it('the own-row SELECT policy is scoped to the caller (not to all reps)', () => {
    const policy = code.match(/create\s+policy\s+community_board_select_own[\s\S]*?;/i)?.[0] ?? ''
    expect(policy).toMatch(/rep_id\s*=\s*\(select\s+auth\.uid\(\)\)/i)
  })
})

/**
 * Second-Opinion Gate BLOCK (Sol 5.6, run 87048875500, PR #130) — closed by migration
 * 20260714180000.
 *
 * FINDING (verbatim): "The `community_board_select_own` policy checks only
 * `rep_id = auth.uid()` and does not require current `internal_users` membership or
 * `designation = 'rep'`. A removed or otherwise non-internal authenticated account can
 * therefore continue reading its pending/rejected posts, bypassing the internal allow-list
 * used by the other SELECT policies."
 *
 * Why it mattered: deleting a user's internal_users row IS the offboarding control here
 * (Hard Rule 10, #86/#105). Every other policy on this table goes dark the moment that row
 * is gone; select_own did not, so a still-valid JWT for a de-listed account kept reading the
 * unpublished drafts it had authored.
 *
 * Proven live against a real offboarding simulation (QA Rep A's internal_users row deleted,
 * then restored): the offboarded seat read 0 rows and could not INSERT; a CURRENT rep still
 * reads their own pending post; access returns on re-listing.
 */
describe('e2 gate-BLOCK fix — select_own requires LIVE internal_users membership', () => {
  const code = sqlCodeOnly(read(migrationPath('_e2_select_own_internal_gate.sql')))
  const policy =
    code.match(/create\s+policy\s+community_board_select_own[\s\S]*?;/i)?.[0] ?? ''

  it('redefines community_board_select_own (drop + create, superseding the prior definition)', () => {
    expect(code).toMatch(/drop\s+policy\s+if\s+exists\s+community_board_select_own/i)
    expect(policy, 'the recreated policy must be present').toBeTruthy()
  })

  it('still scopes to the caller\'s own rows', () => {
    expect(policy).toMatch(/rep_id\s*=\s*\(select\s+auth\.uid\(\)\)/i)
  })

  it('ALSO requires a live internal_users row with designation=rep (the fix)', () => {
    expect(policy).toMatch(/exists\s*\(\s*select\s+1\s+from\s+public\.internal_users\s+iu/i)
    expect(policy).toMatch(/iu\.user_id\s*=\s*\(select\s+auth\.uid\(\)\)/i)
    expect(policy).toMatch(/iu\.designation\s*=\s*'rep'/i)
  })

  it('the rep_id match alone can no longer satisfy the policy (both conjuncts required)', () => {
    // An `or` between the two conjuncts would reopen the hole entirely.
    expect(policy).toMatch(/rep_id\s*=\s*\(select\s+auth\.uid\(\)\)\s*and\s*exists/i)
    expect(policy).not.toMatch(/rep_id\s*=\s*\(select\s+auth\.uid\(\)\)\s*or\s/i)
  })

  it('touches ONLY select_own — the other five policies are not redefined', () => {
    for (const other of [
      'community_board_select_published',
      'community_board_select_executive_all',
      'community_board_insert_executive',
      'community_board_insert_rep_pending',
      'community_board_update_executive_review',
    ]) {
      expect(code, `${other} must not be touched by this fix`).not.toMatch(
        new RegExp(`create\\s+policy\\s+${other}`, 'i'),
      )
    }
  })

  it('is a strict tightening — no new grant, function, column, or index surface', () => {
    expect(code).not.toMatch(/\bgrant\b/i)
    expect(code).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
    expect(code).not.toMatch(/add\s+column/i)
    expect(code).not.toMatch(/create\s+index/i)
  })

  it('does not edit the already-applied E-2 migration (supersede-never-delete)', () => {
    // The original file must still contain its ORIGINAL, un-gated select_own definition —
    // rewriting it would falsify the record of what that migration actually shipped.
    const original = sqlCodeOnly(read(migrationPath('_e2_community_board_review.sql')))
    const originalPolicy =
      original.match(/create\s+policy\s+community_board_select_own[\s\S]*?;/i)?.[0] ?? ''
    expect(originalPolicy).toMatch(/using\s*\(rep_id\s*=\s*\(select\s+auth\.uid\(\)\)\)/i)
    expect(originalPolicy).not.toMatch(/internal_users/i)
  })
})

describe('e2 migration — status DEFAULT keeps the E-1 bell trigger working untouched', () => {
  const code = sqlCodeOnly(read(migrationPath('_e2_community_board_review.sql')))

  it("defaults status to 'published' (the bell trigger's INSERT never names the column)", () => {
    expect(code).toMatch(/add\s+column\s+if\s+not\s+exists\s+status\s+text\s+not\s+null\s+default\s+'published'/i)
  })

  it('constrains status to the three review states', () => {
    expect(code).toMatch(/check\s*\(\s*status\s+in\s*\(\s*'pending'\s*,\s*'published'\s*,\s*'rejected'\s*\)\s*\)/i)
  })

  it('does NOT redefine or drop ring_bell_on_funded_won (the E-1 trigger is untouched)', () => {
    // The name DOES appear in this migration — inside the COMMENT ON TABLE prose, which
    // documents that bells stay trigger-written. What must never appear is a redefinition:
    // the whole point of the 'published' default is that E-1's trigger needs zero changes.
    expect(code).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.ring_bell_on_funded_won/i)
    expect(code).not.toMatch(/drop\s+(function|trigger)[\s\S]{0,60}ring_bell/i)
    expect(code).not.toMatch(/create\s+trigger[\s\S]{0,120}ring_bell_on_funded_won/i)
  })
})

describe('e2 migration — the review audit trail is stamped server-side, not by the client', () => {
  const code = sqlCodeOnly(read(migrationPath('_e2_community_board_review.sql')))

  it('stamps reviewed_by from auth.uid() and reviewed_at from now() on a status change', () => {
    expect(code).toMatch(/new\.reviewed_by\s*:=\s*\(select\s+auth\.uid\(\)\)/i)
    expect(code).toMatch(/new\.reviewed_at\s*:=\s*now\(\)/i)
    expect(code).toMatch(/new\.status\s+is\s+distinct\s+from\s+old\.status/i)
  })

  it('is SECURITY INVOKER — a DEFINER context would stamp the wrong reviewer', () => {
    const fn =
      code.match(/create\s+or\s+replace\s+function\s+public\.stamp_community_board_review\(\)[\s\S]*?\$\$;/i)?.[0] ??
      ''
    expect(fn).toBeTruthy()
    expect(fn).not.toMatch(/security\s+definer/i)
    expect(fn).toMatch(/set\s+search_path\s*=\s*''/i)
  })

  it('preserves the audit columns when status does NOT change (a pin is not a review)', () => {
    expect(code).toMatch(/new\.reviewed_by\s*:=\s*old\.reviewed_by/i)
    expect(code).toMatch(/new\.reviewed_at\s*:=\s*old\.reviewed_at/i)
  })

  it('revokes EXECUTE on the trigger function and never grants it back (no RPC surface)', () => {
    expect(code).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.stamp_community_board_review\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    )
    expect(code).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.stamp_community_board_review/i)
  })

  it('fires BEFORE UPDATE (an AFTER trigger could not rewrite the row)', () => {
    expect(code).toMatch(/before\s+update\s+on\s+public\.community_board_posts/i)
  })
})

describe('e2 migration — community_board_authors() is locked down like every other RPC', () => {
  const code = sqlCodeOnly(read(migrationPath('_e2_community_board_authors.sql')))

  it('is SECURITY DEFINER with a pinned search_path, authenticated-only, never anon', () => {
    expect(code).toMatch(/security\s+definer/i)
    expect(code).toMatch(/set\s+search_path\s*=\s*''/i)
    expect(code).toMatch(/revoke\s+all\s+on\s+function\s+public\.community_board_authors\(\)\s+from\s+public,\s*anon,\s*authenticated/i)
    expect(code).toMatch(/grant\s+execute\s+on\s+function\s+public\.community_board_authors\(\)\s+to\s+authenticated/i)
    expect(code).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.community_board_authors\(\)\s+to\s+anon/i)
  })

  it('gates rows on internal_users membership (fail closed for a non-internal caller)', () => {
    expect(code).toMatch(/from\s+public\.internal_users\s+me\s+where\s+me\.user_id\s*=\s*auth\.uid\(\)/i)
  })

  it('projects ONLY user_id + display_name — no designation, no email, no prospect data', () => {
    const body =
      code.match(/create\s+or\s+replace\s+function\s+public\.community_board_authors\(\)[\s\S]*?\$\$;/i)?.[0] ?? ''
    expect(body).toBeTruthy()
    for (const forbidden of [/\bemail\b/i, /designation/i, /prospect/i, /territor/i, /addressable/i, /census/i]) {
      expect(body, `community_board_authors must not project ${forbidden}`).not.toMatch(forbidden)
    }
  })

  it('falls back to an institutional label rather than rendering a NULL full_name', () => {
    expect(code).toMatch(/coalesce\(nullif\(btrim\(iu\.full_name\),\s*''\),\s*'GetHairMD'\)/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rep provisioning (decision #161)
// ─────────────────────────────────────────────────────────────────────────────
describe('e2 — QA rep seats are provisioned by migration, with no credential in the repo', () => {
  const code = sqlCodeOnly(read(migrationPath('_e2_qa_rep_provisioning.sql')))

  it('inserts both QA rep rows with designation rep', () => {
    expect(code).toMatch(/de190bae-c56c-44dc-a3cc-6ff74f605d80/i)
    expect(code).toMatch(/9ea663c9-5179-4a02-b200-5c4763338e6e/i)
    expect(code).toMatch(/'rep'/)
    expect(code).toMatch(/QA Rep A/)
    expect(code).toMatch(/QA Rep B/)
  })

  it('contains NO password / secret of any kind (Hard Rule 6)', () => {
    const raw = read(migrationPath('_e2_qa_rep_provisioning.sql'))
    expect(raw.toLowerCase()).not.toMatch(/password\s*[:=]/)
    expect(raw).not.toMatch(/encrypted_password/i)
    expect(raw).not.toMatch(/insert\s+into\s+auth\.users/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Surfaces — token cleanliness (Hard Rule 8)
// ─────────────────────────────────────────────────────────────────────────────
describe('e2 — token-clean surfaces (Hard Rule 8)', () => {
  for (const file of [PAGE, ACTIONS, BOARD, CARD, FORM, LIB]) {
    it(`${file} exists`, () => {
      expect(existsSync(join(process.cwd(), file))).toBe(true)
    })
    it(`${file} uses no raw default-palette Tailwind color utilities`, () => {
      expect(codeOnly(read(file))).not.toMatch(RAW_TAILWIND_COLOR)
    })
    it(`${file} contains no raw hex`, () => {
      expect(codeOnly(read(file))).not.toMatch(RAW_HEX)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Write path — the action must set status explicitly (the DEFAULT is a tripwire)
// ─────────────────────────────────────────────────────────────────────────────
describe('e2 — the submit action never relies on the status column default', () => {
  const code = codeOnly(read(ACTIONS))

  it("sets status explicitly on insert ('pending' for a rep, 'published' for an exec)", () => {
    expect(code).toMatch(/status:\s*isRep\s*\?\s*'pending'\s*:\s*'published'/)
  })

  it('stamps rep_id to the caller (a rep cannot author as someone else)', () => {
    expect(code).toMatch(/rep_id:\s*user\.id/)
  })

  it('does NOT send reviewed_by / reviewed_at — the DB trigger owns the audit trail', () => {
    expect(code).not.toMatch(/reviewed_by:/)
    expect(code).not.toMatch(/reviewed_at:/)
  })

  it('uses the authenticated server client, never the service role (RLS stays the boundary)', () => {
    expect(code).toMatch(/from\s+'@\/lib\/supabase\/server'/)
    expect(code).not.toMatch(/createServiceClient/)
    expect(code).not.toMatch(/service/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Nav
// ─────────────────────────────────────────────────────────────────────────────
describe('e2 — Community Board nav is visible to every internal role', () => {
  it('exposes /community-board for executive, rep, and unauthenticated viewers alike', () => {
    for (const d of ['executive', 'rep', null] as const) {
      const item = navItemsFor(d).find((i) => i.label === 'Community Board')
      expect(item, `Community Board must be visible for ${d}`).toBeDefined()
      expect(item?.href).toBe('/community-board')
    }
  })

  it('is NOT execOnly — the feed is shared; only the review QUEUE is exec-gated', () => {
    const item = NAV_ITEMS.find((i) => i.label === 'Community Board')
    expect(item?.execOnly, 'reps post to this board — they must be able to reach it').toBeFalsy()
    expect(item?.comingSoon).toBeFalsy()
  })

  it('reaches the mobile bottom tab bar (reps post from phones)', () => {
    expect(BOTTOM_TABS.map((i) => i.label)).toContain('Community Board')
  })
})

/**
 * Mobile bottom-bar legibility. Adding Community Board made this an 8-tab bar, and at 390px
 * the multi-word labels collapsed into an unreadable run — caught in E-2's 390px QA sweep by
 * LOOKING at the screenshot, not by an assertion (the flex row shrank rather than overflowed,
 * so a scrollWidth check reported "no overflow" while the bar was visibly broken).
 * Every long label now carries a shortLabel, and the bar scrolls instead of crushing.
 */
describe('e2 — the mobile bottom tab bar stays legible at 390px', () => {
  /** ~4.5rem/72px minimum per tab, at the bar's 0.625rem font. */
  const MAX_TAB_CHARS = 11

  for (const item of BOTTOM_TABS) {
    it(`"${item.label}" renders a tab label of <= ${MAX_TAB_CHARS} chars`, () => {
      const rendered = item.shortLabel ?? item.label
      expect(
        rendered.length,
        `"${rendered}" is too long for a 390px tab — give this nav item a shortLabel`,
      ).toBeLessThanOrEqual(MAX_TAB_CHARS)
    })
  }

  it('every multi-word bottom tab has an explicit shortLabel', () => {
    for (const item of BOTTOM_TABS) {
      if (item.label.includes(' ')) {
        expect(item.shortLabel, `"${item.label}" needs a shortLabel`).toBeTruthy()
      }
    }
  })

  it('the bar scrolls rather than shrinking its tabs below a legible width', () => {
    const src = read('src/components/shell/BottomTabBar.tsx')
    expect(src).toMatch(/overflow-x-auto/)
    expect(src).toMatch(/min-w-\[4\.5rem\]/)
    expect(src).toMatch(/shrink-0/)
    expect(src).toMatch(/item\.shortLabel\s*\?\?\s*item\.label/)
  })
})
