import { describe, expect, it } from 'vitest'
import {
  PIPELINE_STAGES,
  STAGE,
  FIRST_STAGE,
  LAST_STAGE,
  stageLabel,
  DEAL_STATUSES,
  isDealStatus,
  FUNDING_PREQUAL_GATE_STAGE,
  requiresFundingPrequalConfirm,
  showPrequalSkippedBadge,
  TRIAGE_GATE_STAGE,
  requiresTriageConfirm,
  showTriageSkippedBadge,
} from '../pipeline-stages'

describe('PIPELINE_STAGES shape', () => {
  it('has exactly 12 stages with sequential ids 1..12', () => {
    expect(PIPELINE_STAGES).toHaveLength(12)
    expect(PIPELINE_STAGES.map(s => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('has the expected labels in order', () => {
    expect(PIPELINE_STAGES.map(s => s.label)).toEqual([
      'New Lead',
      'Contacted',
      'Discovery Call Scheduled',
      'Discovery Call Met',
      'Qualification Review',
      'Proposal Sent',
      'Validation',
      'Funding Pre-Qualified',
      'Contract Sent',
      'Contract Signed',
      'Funded / Won',
      'Implementation Handoff Scheduled',
    ])
  })

  it('has unique labels', () => {
    const labels = PIPELINE_STAGES.map(s => s.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('does not contain any retired franchise-era labels', () => {
    const retired = ['FDD Delivered', 'LOI Signed', 'Agreement Signed']
    const labels = PIPELINE_STAGES.map(s => s.label)
    for (const r of retired) expect(labels).not.toContain(r)
  })
})

describe('STAGE named ids', () => {
  it('every STAGE value maps to a real PIPELINE_STAGES id', () => {
    const ids = new Set(PIPELINE_STAGES.map(s => s.id))
    for (const v of Object.values(STAGE)) expect(ids.has(v)).toBe(true)
  })

  it('has one named key per stage and they are all distinct', () => {
    const values = Object.values(STAGE)
    expect(values).toHaveLength(PIPELINE_STAGES.length)
    expect(new Set(values).size).toBe(values.length)
  })

  it('anchors the known positions', () => {
    expect(STAGE.NEW_LEAD).toBe(1)
    expect(STAGE.QUALIFICATION_REVIEW).toBe(5)
    expect(STAGE.PROPOSAL_SENT).toBe(6)
    expect(STAGE.FUNDING_PRE_QUALIFIED).toBe(8)
    expect(STAGE.CONTRACT_SENT).toBe(9)
    expect(FIRST_STAGE).toBe(1)
    expect(LAST_STAGE).toBe(12)
  })
})

describe('stageLabel', () => {
  it('returns the label for a valid id', () => {
    expect(stageLabel(STAGE.CONTRACT_SIGNED)).toBe('Contract Signed')
  })
  it('falls back gracefully for an out-of-range id', () => {
    expect(stageLabel(99)).toBe('Stage 99')
  })
})

describe('deal status', () => {
  it('allows exactly active | stalled | lost', () => {
    expect([...DEAL_STATUSES]).toEqual(['active', 'stalled', 'lost'])
  })
  it('isDealStatus accepts only the three values', () => {
    expect(isDealStatus('active')).toBe(true)
    expect(isDealStatus('stalled')).toBe(true)
    expect(isDealStatus('lost')).toBe(true)
    expect(isDealStatus('won')).toBe(false)
    expect(isDealStatus('')).toBe(false)
    expect(isDealStatus(null)).toBe(false)
    expect(isDealStatus(1)).toBe(false)
  })
})

describe('soft funding pre-qual gate', () => {
  it('gates at Contract Sent (stage 9)', () => {
    expect(FUNDING_PREQUAL_GATE_STAGE).toBe(9)
  })

  it('advancing to 9+ WITHOUT cleared pre-qual requires confirm', () => {
    expect(requiresFundingPrequalConfirm(9, false)).toBe(true)
    expect(requiresFundingPrequalConfirm(12, false)).toBe(true)
  })

  it('advancing to 9+ WITH cleared pre-qual does not require confirm', () => {
    expect(requiresFundingPrequalConfirm(9, true)).toBe(false)
    expect(requiresFundingPrequalConfirm(11, true)).toBe(false)
  })

  it('advancing below stage 9 never requires confirm, cleared or not', () => {
    expect(requiresFundingPrequalConfirm(8, false)).toBe(false)
    expect(requiresFundingPrequalConfirm(1, false)).toBe(false)
  })

  it('badge shows only when skipped AND at/after the gate stage', () => {
    expect(showPrequalSkippedBadge(9, true)).toBe(true)
    expect(showPrequalSkippedBadge(11, true)).toBe(true)
    expect(showPrequalSkippedBadge(8, true)).toBe(false) // moved back before gate
    expect(showPrequalSkippedBadge(9, false)).toBe(false) // not skipped
  })
})

describe('soft triage gate', () => {
  it('gates at Proposal Sent (stage 6)', () => {
    expect(TRIAGE_GATE_STAGE).toBe(6)
  })

  it('advancing to 6+ WITHOUT a complete triage requires confirm', () => {
    expect(requiresTriageConfirm(6, false)).toBe(true)
    expect(requiresTriageConfirm(9, false)).toBe(true)
  })

  it('advancing to 6+ WITH a complete triage does not require confirm', () => {
    expect(requiresTriageConfirm(6, true)).toBe(false)
    expect(requiresTriageConfirm(12, true)).toBe(false)
  })

  it('advancing below stage 6 never requires confirm, triage complete or not', () => {
    expect(requiresTriageConfirm(5, false)).toBe(false)
    expect(requiresTriageConfirm(1, false)).toBe(false)
  })

  it('badge shows only when skipped AND at/after the gate stage', () => {
    expect(showTriageSkippedBadge(6, true)).toBe(true)
    expect(showTriageSkippedBadge(9, true)).toBe(true)
    expect(showTriageSkippedBadge(5, true)).toBe(false) // moved back before gate
    expect(showTriageSkippedBadge(6, false)).toBe(false) // not skipped
  })
})
