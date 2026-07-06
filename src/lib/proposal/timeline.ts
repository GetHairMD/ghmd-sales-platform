/**
 * Prospect timeline merge (Session D / spec §11 "auto-logged prospect timeline").
 *
 * Pure and isomorphic: merges three already-fetched sources into one
 * chronological list for /prospects/[id]:
 *   • proposal_sessions  — one entry per gate-passed visit ("Opened the proposal")
 *   • proposal_events    — section views, dwell, CTA clicks, Calendly booked/canceled
 *   • activities         — manual notes + prospect messages (optional context)
 *
 * De-dup rule: a `session_start` proposal_event and a proposal_sessions row are
 * emitted for the SAME visit by the gate. We treat proposal_sessions as the
 * canonical "visit" entry and DROP session_start events so a visit shows once.
 *
 * Calendly booked/canceled events flow in here automatically once Phase-1
 * provisioning lands (no code change) — they are ordinary proposal_events.
 */

import type { ProposalEventType } from './events'

export type TimelineKind = 'session' | 'proposal_event' | 'activity'

export interface TimelineEntry {
  id: string
  /** ISO 8601 timestamp used for ordering. */
  at: string
  kind: TimelineKind
  /** Short headline, e.g. "Clicked “See what you qualify for”". */
  title: string
  /** Optional secondary line (section name, note body, etc.). */
  detail: string | null
  /** True for high-signal moments (financing click, booked) so the UI can flag them. */
  hot: boolean
}

// ── Inputs (narrow row projections) ──────────────────────────────────────────

export interface TimelineEventRow {
  id: string
  event_type: ProposalEventType
  payload: Record<string, unknown> | null
  created_at: string
}

export interface TimelineSessionRow {
  id: string
  started_at: string
}

export interface TimelineActivityRow {
  id: string
  created_at: string
  activity_type: string | null
  body: string | null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Human title + hotness for a proposal_event. Returns null to omit the event. */
function describeEvent(
  eventType: ProposalEventType,
  payload: Record<string, unknown> | null,
): { title: string; detail: string | null; hot: boolean } | null {
  const section = str(payload?.section)
  switch (eventType) {
    case 'session_start':
      return null // represented by the proposal_sessions entry (see de-dup rule)
    case 'section_view':
      return { title: section ? `Viewed ${section}` : 'Viewed a section', detail: null, hot: false }
    case 'section_dwell': {
      const ms = Number(payload?.dwell_ms)
      const mins = Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : null
      const where = section ? ` on ${section}` : ''
      return { title: mins ? `Spent ${mins} min${where}` : `Dwelt${where}`, detail: null, hot: false }
    }
    case 'calculator_interaction':
      return { title: 'Used the ROI calculator', detail: null, hot: false }
    case 'video_play':
      return { title: 'Played a video', detail: section, hot: false }
    case 'case_study_tab':
      return { title: 'Opened a case study', detail: section, hot: false }
    case 'financing_cta_click':
      return { title: 'Clicked “See what you qualify for”', detail: null, hot: true }
    case 'calendly_open':
      return { title: 'Opened the scheduler', detail: null, hot: false }
    case 'get_started_click':
      return { title: 'Clicked Get Started', detail: null, hot: false }
    case 'calendly_booked':
      return { title: 'Booked a call', detail: null, hot: true }
    case 'calendly_canceled':
      return { title: 'Canceled the call', detail: null, hot: false }
    default:
      // Exhaustiveness guard — a new event type must be described here.
      return { title: 'Proposal activity', detail: null, hot: false }
  }
}

export interface TimelineSources {
  sessions: TimelineSessionRow[]
  events: TimelineEventRow[]
  activities: TimelineActivityRow[]
}

/**
 * Merge the three sources into one list, newest first. Entries with an
 * unparseable timestamp are dropped rather than sorted to an arbitrary position.
 */
export function buildTimeline({ sessions, events, activities }: TimelineSources): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const s of sessions) {
    entries.push({
      id: `session:${s.id}`,
      at: s.started_at,
      kind: 'session',
      title: 'Opened the proposal',
      detail: null,
      hot: false,
    })
  }

  for (const e of events) {
    const d = describeEvent(e.event_type, e.payload)
    if (!d) continue
    entries.push({
      id: `event:${e.id}`,
      at: e.created_at,
      kind: 'proposal_event',
      title: d.title,
      detail: d.detail,
      hot: d.hot,
    })
  }

  for (const a of activities) {
    const type = str(a.activity_type)
    entries.push({
      id: `activity:${a.id}`,
      at: a.created_at,
      kind: 'activity',
      title: type === 'note' ? 'Note' : type ? type.replace(/_/g, ' ') : 'Activity',
      detail: str(a.body),
      hot: false,
    })
  }

  return entries
    .filter((e) => !Number.isNaN(new Date(e.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
