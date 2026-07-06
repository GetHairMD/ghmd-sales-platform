/**
 * Proposals-index row shaping (Session §4B nav item 4 — "every live proposal
 * page with engagement stats: visits, total dwell, last seen, hottest section").
 *
 * PURE and isomorphic (no 'use client', no server-only imports) so the
 * /proposals render and Vitest read the SAME logic. All engagement figures are
 * REUSED from the unit-tested `aggregateEngagement` (dashboard/triggers) — this
 * module never re-derives them, it only joins proposals to that engagement and
 * shapes it for the table. Nothing here fabricates a value the data can't back:
 * dwell rides on `section_dwell` payloads, hottest section on the same, and both
 * fall back to null (rendered "—") when the underlying events don't exist.
 */
import type { ProspectEngagement } from '../dashboard/triggers'

/** Narrow projection of a `proposals` row (only the fields the index reads). */
export interface ProposalRecord {
  id: string
  slug: string
  prospect_id: string
  created_at: string
}

/** One row of the proposals index table. */
export interface ProposalListRow {
  proposalId: string
  slug: string
  prospectId: string
  /** "Dr. Hausauer · Aesthetx" — name, with practice when present. */
  who: string
  /** Successful gate passes (proposal_sessions count). */
  visits: number
  /** Cumulative dwell across the proposal (sum of section_dwell payloads). */
  totalDwellMs: number
  /** ISO of the most-recent signal (session OR event), or null if never opened. */
  lastSeenAt: string | null
  /** Section with the most cumulative dwell, or null if no dwell recorded. */
  hottestSection: string | null
  /** Proposal creation time — sort tiebreak for never-opened rows. */
  createdAt: string
}

/** The later of two ISO timestamps, tolerating nulls on either side. */
function latestIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

/**
 * Join proposals to their prospect's engagement and shape index rows.
 * Ordered most-recently-seen first; never-opened proposals sort after, newest
 * created first. A proposal whose prospect has no engagement entry still emits
 * a zeroed row (it is a real, openable page).
 */
export function buildProposalRows(
  proposals: ProposalRecord[],
  engagements: ProspectEngagement[],
): ProposalListRow[] {
  const byProspect = new Map<string, ProspectEngagement>()
  for (const e of engagements) byProspect.set(e.prospectId, e)

  const rows: ProposalListRow[] = proposals.map((p) => {
    const e = byProspect.get(p.prospect_id)
    return {
      proposalId: p.id,
      slug: p.slug,
      prospectId: p.prospect_id,
      who: e?.who ?? 'Unknown prospect',
      visits: e?.sessionCount ?? 0,
      totalDwellMs: e?.cumulativeDwellMs ?? 0,
      lastSeenAt: e ? latestIso(e.lastSessionAt, e.lastEventAt) : null,
      hottestSection: e?.hottestSection ?? null,
      createdAt: p.created_at,
    }
  })

  return rows.sort((a, b) => {
    // Most-recently-seen first; nulls (never opened) sink to the bottom.
    if (a.lastSeenAt && b.lastSeenAt) {
      const diff = new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
      if (diff !== 0) return diff
    } else if (a.lastSeenAt) {
      return -1
    } else if (b.lastSeenAt) {
      return 1
    }
    // Tiebreak / never-opened ordering: newest proposal first.
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

/** Human dwell label. Returns "—" for zero/absent dwell (never a fake number). */
export function formatDwell(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

/** Relative "last seen" label from an ISO timestamp. Null → "Never opened". */
export function relativeTime(iso: string | null, nowMs: number): string {
  if (!iso) return 'Never opened'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'Never opened'
  const diff = nowMs - t
  if (diff < 60_000) return 'just now'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return `${mo}mo ago`
}
