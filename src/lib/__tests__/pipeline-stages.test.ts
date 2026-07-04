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
  it('has exactly 11 stages with sequential ids 1..11', () => {
    expect(PIPELINE_STAGES).toHaveLength(11)
    expect(PIPELINE_STAGES.map(s => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('has the expected labels in order', () => {
    expect(PIPELINE_STAGES.map(s => s.label)).toEqual([
      'New Lead',
      'Contacted',
      'Discovery Call Scheduled',
      'Discovery Call Met',
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
    expect(STAGE.PROPOSAL_SENT).toBe(5)
    expect(STAGE.FUNDING_PRE_QUALIFIED).toBe(7)
    expect(STAGE.CONTRACT_SENT).toBe(8)
    expect(FIRST_STAGE).toBe(1)
    expect(LAST_STAGE).toBe(11)
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
  it('gates at Contract Sent (stage 8)', () => {
    expect(FUNDING_PREQUAL_GATE_STAGE).toBe(8)
  })

  it('advancing to 8+ WITHOUT cleared pre-qual requires confirm', () => {
    expect(requiresFundingPrequalConfirm(8, false)).toBe(true)
    expect(requiresFundingPrequalConfirm(11, false)).toBe(true)
  })

  it('advancing to 8+ WITH cleared pre-qual does not require confirm', () => {
    expect(requiresFundingPrequalConfirm(8, true)).toBe(false)
    expect(requiresFundingPrequalConfirm(10, true)).toBe(false)
  })

  it('advancing below stage 8 never requires confirm, cleared or not', () => {
    expect(requiresFundingPrequalConfirm(7, false)).toBe(false)
    expect(requiresFundingPrequalConfirm(1, false)).toBe(false)
  })

  it('badge shows only when skipped AND at/after the gate stage', () => {
    expect(showPrequalSkippedBadge(8, true)).toBe(true)
    expect(showPrequalSkippedBadge(10, true)).toBe(true)
    expect(showPrequalSkippedBadge(7, true)).toBe(false) // moved back before gate
    expect(showPrequalSkippedBadge(8, false)).toBe(false) // not skipped
  })
})

describe('soft triage gate', () => {
  it('gates at Proposal Sent (stage 5)', () => {
    expect(TRIAGE_GATE_STAGE).toBe(5)
  })

  it('advancing to 5+ WITHOUT a complete triage requires confirm', () => {
    expect(requiresTriageConfirm(5, false)).toBe(true)
    expect(requiresTriageConfirm(8, false)).toBe(true)
  })

  it('advancing to 5+ WITH a complete triage does not require confirm', () => {
    expect(requiresTriageConfirm(5, true)).toBe(false)
    expect(requiresTriageConfirm(11, true)).toBe(false)
  })

  it('advancing below stage 5 never requires confirm, triage complete or not', () => {
    expect(requiresTriageConfirm(4, false)).toBe(false)
    expect(requiresTriageConfirm(1, false)).toBe(false)
  })

  it('badge shows only when skipped AND at/after the gate stage', () => {
    expect(showTriageSkippedBadge(5, true)).toBe(true)
    expect(showTriageSkippedBadge(8, true)).toBe(true)
    expect(showTriageSkippedBadge(4, true)).toBe(false) // moved back before gate
    expect(showTriageSkippedBadge(5, false)).toBe(false) // not skipped
  })
})
