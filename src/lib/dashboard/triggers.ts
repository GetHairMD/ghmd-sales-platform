/**
 * Proposal-engagement triggers (spec §7 P0) + dashboard derivations (spec §8).
 *
 * Pure and server-computed: every value here derives from proposal_events /
 * proposal_sessions rows, never free text. Isomorphic (no 'use client', no
 * server-only imports) so the /dashboard render, the (PR-B) email-notification
 * path, and Vitest all read the SAME logic.
 *
 * The three P0 triggers (spec §7):
 *   • financing_cta_click — prospect clicked "See what financing you qualify for"
 *   • third_session       — a prospect's 3rd (or later) proposal session
 *   • high_dwell          — >5 min cumulative dwell across the proposal
 *
 * Thresholds below are spec §7 trigger definitions — NOT addressable-market
 * formula constants, so Rule 6 / lib/addressable-market-constants.ts does not
 * apply. They live here as the single source for trigger tuning.
 */

import type { ProposalEventType } from '../proposal/events'

// ── Trigger thresholds (spec §7) ─────────────────────────────────────────────

/** >5 min cumulative dwell fires the high-dwell trigger. */
export const HIGH_DWELL_THRESHOLD_MS = 5 * 60 * 1000
/** The 3rd session (or later) fires the repeat-visit trigger. */
export const SESSION_COUNT_THRESHOLD = 3
/** Hot-lead list window: trigger signals within the last 7 days (spec §8). */
export const HOT_LEAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const MS_PER_DAY = 86_400_000

// ── Inputs (narrow projections of the DB rows) ───────────────────────────────

/** A proposal_events row projection (only the fields the triggers read). */
export interface ProposalEventRow {
  prospect_id: string
  event_type: ProposalEventType
  payload: Record<string, unknown> | null
  created_at: string
}

/** A proposal_sessions row projection. */
export interface ProposalSessionRow {
  prospect_id: string
  started_at: string
}

/** Prospect display info, keyed by id (name/practice for feed copy + links). */
export interface ProspectDisplay {
  id: string
  full_name: string
  practice_name: string | null
}

// ── Aggregated engagement (one row per prospect) ─────────────────────────────

export interface ProspectEngagement {
  prospectId: string
  /** "Dr. Hausauer · Aesthetx" — name, with practice when present. */
  who: string
  sessionCount: number
  cumulativeDwellMs: number
  financingClicks: number
  /** ISO of the most-recent financing click, or null. */
  lastFinancingClickAt: string | null
  /** ISO of the most-recent session start, or null. */
  lastSessionAt: string | null
  /** ISO of the most-recent event of any kind, or null. */
  lastEventAt: string | null
  /** Section with the most cumulative dwell (for feed copy), or null. */
  hottestSection: string | null
}

function displayName(p: ProspectDisplay): string {
  return p.practice_name ? `${p.full_name} · ${p.practice_name}` : p.full_name
}

function maxIso(a: string | null, b: string): string {
  if (!a) return b
  return new Date(b).getTime() > new Date(a).getTime() ? b : a
}

/**
 * Roll raw event/session rows up to one ProspectEngagement per prospect.
 * Only prospects present in `prospects` are emitted (a row referencing an
 * unknown prospect is skipped — the caller controls the visible set).
 */
export function aggregateEngagement(
  events: ProposalEventRow[],
  sessions: ProposalSessionRow[],
  prospects: ProspectDisplay[],
): ProspectEngagement[] {
  const byId = new Map<string, ProspectEngagement>()
  const dwellBySection = new Map<string, Map<string, number>>()

  for (const p of prospects) {
    byId.set(p.id, {
      prospectId: p.id,
      who: displayName(p),
      sessionCount: 0,
      cumulativeDwellMs: 0,
      financingClicks: 0,
      lastFinancingClickAt: null,
      lastSessionAt: null,
      lastEventAt: null,
      hottestSection: null,
    })
    dwellBySection.set(p.id, new Map())
  }

  for (const s of sessions) {
    const e = byId.get(s.prospect_id)
    if (!e) continue
    e.sessionCount += 1
    e.lastSessionAt = maxIso(e.lastSessionAt, s.started_at)
  }

  for (const ev of events) {
    const e = byId.get(ev.prospect_id)
    if (!e) continue
    e.lastEventAt = maxIso(e.lastEventAt, ev.created_at)

    if (ev.event_type === 'financing_cta_click') {
      e.financingClicks += 1
      e.lastFinancingClickAt = maxIso(e.lastFinancingClickAt, ev.created_at)
    } else if (ev.event_type === 'section_dwell') {
      const ms = Number(ev.payload?.dwell_ms)
      if (Number.isFinite(ms) && ms > 0) {
        e.cumulativeDwellMs += ms
        const section = typeof ev.payload?.section === 'string' ? ev.payload.section : null
        if (section) {
          const sec = dwellBySection.get(ev.prospect_id)!
          sec.set(section, (sec.get(section) ?? 0) + ms)
        }
      }
    }
  }

  // Resolve hottest section per prospect.
  dwellBySection.forEach((sec, id) => {
    let best: string | null = null
    let bestMs = 0
    sec.forEach((ms, section) => {
      if (ms > bestMs) {
        bestMs = ms
        best = section
      }
    })
    const e = byId.get(id)
    if (e) e.hottestSection = best
  })

  return Array.from(byId.values())
}

// ── Triggers ─────────────────────────────────────────────────────────────────

export type TriggerType = 'financing_cta_click' | 'third_session' | 'high_dwell'

export interface TriggerHit {
  prospectId: string
  who: string
  type: TriggerType
  /** ISO of the signal that fired the trigger (best available), or null. */
  occurredAt: string | null
  /** Heat weight — higher sorts first. */
  weight: number
  /** One-line rep action predicate (composed with `who` for display). */
  action: string
}

/**
 * All triggers currently firing for one prospect, strongest first.
 * A prospect with no qualifying signal yields an empty array.
 */
export function detectTriggers(e: ProspectEngagement): TriggerHit[] {
  const hits: TriggerHit[] = []
  const base = { prospectId: e.prospectId, who: e.who }

  if (e.financingClicks > 0) {
    hits.push({
      ...base,
      type: 'financing_cta_click',
      occurredAt: e.lastFinancingClickAt,
      weight: 100,
      action: 'clicked "See what you qualify for" — call today',
    })
  }
  if (e.cumulativeDwellMs > HIGH_DWELL_THRESHOLD_MS) {
    const mins = Math.round(e.cumulativeDwellMs / 60_000)
    const where = e.hottestSection ? ` (most on ${e.hottestSection})` : ''
    hits.push({
      ...base,
      type: 'high_dwell',
      occurredAt: e.lastEventAt,
      weight: 70,
      action: `${mins} min on the proposal${where} — high intent`,
    })
  }
  if (e.sessionCount >= SESSION_COUNT_THRESHOLD) {
    hits.push({
      ...base,
      type: 'third_session',
      occurredAt: e.lastSessionAt,
      weight: 50,
      action: `${e.sessionCount} visits — actively evaluating`,
    })
  }

  return hits.sort((a, b) => b.weight - a.weight)
}

/** True when a trigger's firing signal falls within the hot-lead window. */
function withinHotWindow(occurredAt: string | null, nowMs: number): boolean {
  if (!occurredAt) return false
  const t = new Date(occurredAt).getTime()
  if (Number.isNaN(t)) return false
  return nowMs - t <= HOT_LEAD_WINDOW_MS && t <= nowMs
}

export interface HotLead {
  prospectId: string
  who: string
  /** The strongest recent trigger. */
  type: TriggerType
  action: string
  occurredAt: string | null
  weight: number
}

/**
 * Hot-lead list (spec §8): prospects with a trigger whose signal fired in the
 * last 7 days, one row each (strongest recent trigger), hottest first.
 */
export function computeHotLeads(engagements: ProspectEngagement[], nowMs: number): HotLead[] {
  const leads: HotLead[] = []
  for (const e of engagements) {
    const recent = detectTriggers(e).filter((h) => withinHotWindow(h.occurredAt, nowMs))
    if (recent.length === 0) continue
    const top = recent[0]
    leads.push({
      prospectId: top.prospectId,
      who: top.who,
      type: top.type,
      action: top.action,
      occurredAt: top.occurredAt,
      weight: top.weight,
    })
  }
  return leads.sort((a, b) => b.weight - a.weight)
}

// ── Engagement feed (spec §8 / §4B Recommended-Actions pattern) ──────────────

export type FeedPriority = 'High' | 'Med' | 'Low'

export interface FeedItem {
  prospectId: string
  who: string
  priority: FeedPriority
  /**
   * Feed category tag (spec §4B). ENGAGEMENT = proposal-engagement signals;
   * RESOURCE = Resource Library tracked-link opens (E-3). Both heat-sort into one feed.
   */
  category: 'ENGAGEMENT' | 'RESOURCE'
  action: string
  weight: number
}

function priorityFor(weight: number): FeedPriority {
  if (weight >= 100) return 'High'
  if (weight >= 70) return 'Med'
  return 'Low'
}

/**
 * Engagement feed (spec §8): one item per *engaged* prospect (strongest signal),
 * rendered as priority chip + ENGAGEMENT tag + one-line action, sorted by heat.
 * A prospect with a live session but no strong trigger still surfaces as a Low
 * "viewing" nudge; a prospect with zero engagement is omitted.
 */
export function computeEngagementFeed(
  engagements: ProspectEngagement[],
  nowMs: number,
  limit = 12,
): FeedItem[] {
  const items: FeedItem[] = []
  for (const e of engagements) {
    const hits = detectTriggers(e)
    if (hits.length > 0) {
      const top = hits[0]
      items.push({
        prospectId: e.prospectId,
        who: e.who,
        priority: priorityFor(top.weight),
        category: 'ENGAGEMENT',
        action: top.action,
        weight: top.weight,
      })
    } else if (e.sessionCount > 0 || e.lastEventAt) {
      // Engaged but below every trigger threshold — gentle Low nudge.
      const recent = withinHotWindow(e.lastEventAt, nowMs)
      items.push({
        prospectId: e.prospectId,
        who: e.who,
        priority: 'Low',
        category: 'ENGAGEMENT',
        action: recent ? 'viewing the proposal — no strong signal yet' : 'opened the proposal earlier',
        weight: 10,
      })
    }
  }
  return items.sort((a, b) => b.weight - a.weight).slice(0, limit)
}

// ── Resource Library engagement (E-3, spec §4C.3) ────────────────────────────

/** A resource_engagement_events (link_opened) row projection. */
export interface ResourceOpenEventRow {
  share_id: string
  created_at: string
}

/** A resource_shares row projection (the link a rep generated for a prospect). */
export interface ResourceShareLink {
  id: string
  rep_id: string
  prospect_id: string
  asset_id: string
}

/** Who is looking at the dashboard — drives the rep-own vs exec-all feed split. */
export interface ResourceViewer {
  designation: 'executive' | 'rep' | null
  userId: string | null
}

/** Prospect display + ownership, keyed by prospect id, for resource-feed scoping. */
export interface ResourceProspect {
  who: string
  assignedRepId: string | null
}

/** Heat weight for a resource open: a single open is a soft signal, repeated opens
 *  (the spec's "watched the LUX testimonial twice") escalate, capped below a financing
 *  CTA click (100) so proposal intent still tops the feed. */
function resourceWeight(opens: number): number {
  return Math.min(90, 45 + 20 * Math.max(0, opens - 1))
}

/**
 * The Resource Library contribution to the dashboard feed — TWO distinct renders of the
 * SAME underlying data (spec §4C.3, AC8a/AC8b), chosen by the viewer:
 *
 *   • REP  → only opens on prospects assigned to that rep (assignedRepId === viewer.userId),
 *            same rep-scoping as every other rep surface. No rep name (it is their own feed).
 *   • EXEC → ALL reps' shares, fully attributed with the SHARING rep's name.
 *
 * A null viewer (unauthenticated / not on the allow-list) yields nothing — fail closed.
 * One item per share (asset × prospect) that has at least one open, heat-sorted with the
 * proposal-engagement items by the caller.
 */
export function computeResourceFeed(args: {
  events: ResourceOpenEventRow[]
  shares: ResourceShareLink[]
  assetTitleById: Record<string, string>
  prospectById: Record<string, ResourceProspect>
  repNameById: Record<string, string>
  viewer: ResourceViewer
  limit?: number
}): FeedItem[] {
  const { events, shares, assetTitleById, prospectById, repNameById, viewer, limit = 12 } = args
  if (viewer.designation === null) return [] // fail closed — no viewer, no rows

  const opensByShare = new Map<string, number>()
  for (const ev of events) {
    opensByShare.set(ev.share_id, (opensByShare.get(ev.share_id) ?? 0) + 1)
  }

  const isExec = viewer.designation === 'executive'
  const items: FeedItem[] = []

  for (const share of shares) {
    const opens = opensByShare.get(share.id) ?? 0
    if (opens === 0) continue

    const prospect = prospectById[share.prospect_id]
    if (!prospect) continue // unknown/lost prospect — not on a heat surface

    // Rep sees only their own prospects' opens; exec sees all.
    if (!isExec && prospect.assignedRepId !== viewer.userId) continue

    const title = assetTitleById[share.asset_id] ?? 'a resource'
    const times = opens > 1 ? ` ${opens} times` : ''
    const attribution = isExec ? ` · shared by ${repNameById[share.rep_id] ?? 'a rep'}` : ''
    const weight = resourceWeight(opens)

    items.push({
      prospectId: share.prospect_id,
      who: prospect.who,
      priority: priorityFor(weight),
      category: 'RESOURCE',
      action: `opened "${title}"${times}${attribution}`,
      weight,
    })
  }

  return items.sort((a, b) => b.weight - a.weight).slice(0, limit)
}

/** Days since an ISO timestamp (floored, never negative). For feed/timeline copy. */
export function daysSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((nowMs - t) / MS_PER_DAY))
}
