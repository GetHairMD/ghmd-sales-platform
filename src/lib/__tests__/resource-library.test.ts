import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RESOURCE_CATEGORIES,
  RESOURCE_ASSET_TYPES,
  RESOURCE_CATEGORY_LABEL,
  isResourceCategory,
  isResourceAssetType,
  toResourceAsset,
  groupByCategory,
  type ResourceAssetRow,
} from '../resources/resources'
import { computeResourceFeed, type ResourceViewer } from '../dashboard/triggers'

/**
 * Resource Library (E-3, spec §4C.3).
 *
 * The category / asset-type enums are single-sourced in TS and mirrored by a DB CHECK.
 * Nothing regenerates one from the other, so a lock-step test reads the migration and
 * asserts the two agree — the same guardrail idiom the community-board and proposal-events
 * enums use. If either list changes without the other, this fails.
 */

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260714240000_e3_resource_assets.sql'),
  'utf8',
)

/** Pull the quoted tokens out of a `<column> in ( '...','...' )` CHECK body. */
function checkValues(column: string): string[] {
  const m = migration.match(new RegExp(`${column} in \\(([^)]*)\\)`, 's'))
  if (!m) return []
  return Array.from(m[1].matchAll(/'([^']+)'/g)).map((x) => x[1])
}

describe('category + asset-type enums stay in lock-step with the DB CHECK', () => {
  it('RESOURCE_CATEGORIES matches resource_assets_category_check exactly (order-independent)', () => {
    expect([...checkValues('category')].sort()).toEqual([...RESOURCE_CATEGORIES].sort())
  })

  it('RESOURCE_ASSET_TYPES matches resource_assets_asset_type_check exactly', () => {
    expect([...checkValues('asset_type')].sort()).toEqual([...RESOURCE_ASSET_TYPES].sort())
  })

  it('has exactly the six spec §4C.3 categories, no more no less', () => {
    expect(RESOURCE_CATEGORIES).toHaveLength(6)
    expect(RESOURCE_CATEGORIES).toContain('objection_playbook') // the empty E-6 slot
  })

  it('every category has a display label', () => {
    for (const c of RESOURCE_CATEGORIES) {
      expect(RESOURCE_CATEGORY_LABEL[c]).toBeTruthy()
    }
  })
})

describe('category / asset-type guards', () => {
  it('accepts valid values, rejects everything else', () => {
    expect(isResourceCategory('decks')).toBe(true)
    expect(isResourceCategory('nonsense')).toBe(false)
    expect(isResourceCategory(null)).toBe(false)
    expect(isResourceAssetType('wistia_video')).toBe(true)
    expect(isResourceAssetType('mp4')).toBe(false)
  })
})

describe('toResourceAsset + groupByCategory', () => {
  const row = (over: Partial<ResourceAssetRow> = {}): ResourceAssetRow => ({
    id: 'a1',
    category: 'decks',
    title: 'Overview Deck',
    description: null,
    asset_type: 'pdf',
    external_url: 'https://example.com/x.pdf',
    wistia_id: null,
    version: 'v1',
    approved_date: null,
    approved_by: null,
    active: true,
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
    ...over,
  })

  it('maps a row to camelCase and keeps the redirect target', () => {
    const a = toResourceAsset(row())
    expect(a.category).toBe('decks')
    expect(a.assetType).toBe('pdf')
    expect(a.externalUrl).toBe('https://example.com/x.pdf')
  })

  it('degrades a hypothetical out-of-range category instead of crashing', () => {
    expect(toResourceAsset(row({ category: 'bogus' })).category).toBe('decks')
  })

  it('groups into all six buckets, preserving empties', () => {
    const grouped = groupByCategory([
      toResourceAsset(row({ id: 'a', category: 'decks' })),
      toResourceAsset(row({ id: 'b', category: 'decks' })),
      toResourceAsset(row({ id: 'c', category: 'case_studies' })),
    ])
    expect(Object.keys(grouped)).toHaveLength(6)
    expect(grouped.decks).toHaveLength(2)
    expect(grouped.case_studies).toHaveLength(1)
    expect(grouped.clinical_evidence).toHaveLength(0)
  })
})

/**
 * The dashboard-feed role split (AC8a/AC8b) at the unit level. computeResourceFeed is a
 * pure function, so this is a real behavioral role-switch, not a source scan.
 */
describe('computeResourceFeed — rep-own vs exec-all split', () => {
  const REP_A = 'rep-a-uuid'
  const REP_B = 'rep-b-uuid'

  // Two shares, opened. share-1 is on REP_A's prospect; share-2 is on REP_B's prospect.
  const shares = [
    { id: 'share-1', rep_id: REP_A, prospect_id: 'p1', asset_id: 'asset-1' },
    { id: 'share-2', rep_id: REP_B, prospect_id: 'p2', asset_id: 'asset-1' },
  ]
  const events = [
    { share_id: 'share-1', created_at: '2026-07-14T10:00:00Z' },
    { share_id: 'share-2', created_at: '2026-07-14T11:00:00Z' },
    { share_id: 'share-2', created_at: '2026-07-14T12:00:00Z' }, // p2 opened twice
  ]
  const assetTitleById = { 'asset-1': 'LUX Testimonial' }
  const prospectById = {
    p1: { who: 'Dr. One · Clinic A', assignedRepId: REP_A },
    p2: { who: 'Dr. Two · Clinic B', assignedRepId: REP_B },
  }
  const repNameById = { [REP_A]: 'QA Rep A', [REP_B]: 'QA Rep B' }

  const run = (viewer: ResourceViewer) =>
    computeResourceFeed({ events, shares, assetTitleById, prospectById, repNameById, viewer })

  it('AC8a: a rep sees ONLY their own prospects opens, with no rep name', () => {
    const feed = run({ designation: 'rep', userId: REP_A })
    expect(feed).toHaveLength(1)
    expect(feed[0].prospectId).toBe('p1')
    expect(feed[0].who).toBe('Dr. One · Clinic A')
    expect(feed[0].category).toBe('RESOURCE')
    expect(feed[0].action).toContain('LUX Testimonial')
    expect(feed[0].action).not.toContain('shared by') // rep view is unattributed
  })

  it('a different rep sees only THEIR prospect — no cross-rep leakage', () => {
    const feed = run({ designation: 'rep', userId: REP_B })
    expect(feed.map((f) => f.prospectId)).toEqual(['p2'])
    expect(feed[0].action).toContain('2 times') // p2 opened twice
  })

  it('AC8b: an executive sees ALL reps opens, attributed by the sharing rep name', () => {
    const feed = run({ designation: 'executive', userId: 'some-exec' })
    expect(feed.map((f) => f.prospectId).sort()).toEqual(['p1', 'p2'])
    const p2 = feed.find((f) => f.prospectId === 'p2')!
    expect(p2.action).toContain('shared by QA Rep B')
    const p1 = feed.find((f) => f.prospectId === 'p1')!
    expect(p1.action).toContain('shared by QA Rep A')
  })

  it('repeated opens sort ahead of a single open (heat)', () => {
    const feed = run({ designation: 'executive', userId: 'e' })
    expect(feed[0].prospectId).toBe('p2') // opened twice → heavier
    expect(feed[0].weight).toBeGreaterThan(feed[1].weight)
  })

  it('a null viewer gets nothing — fail closed', () => {
    expect(run({ designation: null, userId: null })).toEqual([])
  })

  it('a share with zero opens never appears', () => {
    const feed = computeResourceFeed({
      events: [], // nothing opened
      shares,
      assetTitleById,
      prospectById,
      repNameById,
      viewer: { designation: 'executive', userId: 'e' },
    })
    expect(feed).toEqual([])
  })

  it('an open on an unknown/lost prospect is skipped, not crashed', () => {
    const feed = computeResourceFeed({
      events: [{ share_id: 'share-x', created_at: '2026-07-14T10:00:00Z' }],
      shares: [{ id: 'share-x', rep_id: REP_A, prospect_id: 'gone', asset_id: 'asset-1' }],
      assetTitleById,
      prospectById, // 'gone' is not present
      repNameById,
      viewer: { designation: 'executive', userId: 'e' },
    })
    expect(feed).toEqual([])
  })
})
