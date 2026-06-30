import { describe, it, expect } from 'vitest'
import {
  parseGateBlock,
  blockIsMalformed,
  parseGptOutput,
  decideDisposition,
  buildEscalationComment,
  type ResidualRisk,
} from '../gate-logic'

const wellFormedBody = `Some PR description.

<!-- second-opinion-gate
category: 2
hard_exception: false
coder_residual_risk: none
decision_log_id: 22
spec: |
  Adds a rent-burden multiplier to the PPI formula.
  Must never exceed 1.5x.
coder_self_justification: |
  Clamped server-side; covered by 15 unit tests.
-->

More text.`

describe('parseGateBlock', () => {
  it('parses a well-formed block', () => {
    const b = parseGateBlock(wellFormedBody)!
    expect(b.category).toBe(2)
    expect(b.hardException).toBe(false)
    expect(b.coderResidualRisk).toBe('none')
    expect(b.decisionLogId).toBe(22)
    expect(b.spec).toContain('rent-burden multiplier')
    expect(b.spec).toContain('1.5x')
    expect(b.coderSelfJustification).toContain('Clamped server-side')
    expect(blockIsMalformed(b)).toBe(false)
  })

  it('returns null when no block present (not in scope)', () => {
    expect(parseGateBlock('just a normal PR body')).toBeNull()
    expect(parseGateBlock('')).toBeNull()
    expect(parseGateBlock(null)).toBeNull()
  })

  it('defaults coder_residual_risk to unresolved (fail closed) when missing/invalid', () => {
    const b = parseGateBlock(`<!-- second-opinion-gate
category: 1
spec: x
coder_residual_risk: bogus
-->`)!
    expect(b.coderResidualRisk).toBe('unresolved')
  })

  it('flags malformed block when category or spec is missing', () => {
    const noCategory = parseGateBlock(`<!-- second-opinion-gate
spec: something
-->`)!
    expect(blockIsMalformed(noCategory)).toBe(true)

    const noSpec = parseGateBlock(`<!-- second-opinion-gate
category: 3
-->`)!
    expect(blockIsMalformed(noSpec)).toBe(true)
  })

  it('reads hard_exception: true', () => {
    const b = parseGateBlock(`<!-- second-opinion-gate
category: 2
hard_exception: TRUE
coder_residual_risk: none
spec: signed-contract terms encoded
-->`)!
    expect(b.hardException).toBe(true)
  })
})

describe('parseGptOutput', () => {
  it('parses a NO_ISSUE verdict', () => {
    const v = parseGptOutput(`WHAT_THIS_DOES: Adds a column.
FINDING: none found
VERDICT: NO_ISSUE
STAKES: nothing
RESIDUAL_RISK: none`)
    expect(v.verdict).toBe('NO_ISSUE')
    expect(v.residualRisk).toBe('none')
  })

  it('parses an ACCEPTABLE_WITH_RATIONALE verdict', () => {
    const v = parseGptOutput(`WHAT_THIS_DOES: Caches NPI.
FINDING: TTL could serve stale data.
VERDICT: ACCEPTABLE_WITH_RATIONALE
RATIONALE: Window bounded under 24h by the cron.
STAKES: One stale provider row.
RESIDUAL_RISK: accepted`)
    expect(v.verdict).toBe('ACCEPTABLE_WITH_RATIONALE')
    expect(v.residualRisk).toBe('accepted')
    expect(v.rationale).toContain('bounded under 24h')
  })

  it('parses a BLOCK verdict', () => {
    const v = parseGptOutput(`WHAT_THIS_DOES: Changes RLS.
FINDING: Anon can now read PHI-adjacent rows.
VERDICT: BLOCK
STAKES: Data exposure.
RESIDUAL_RISK: unresolved`)
    expect(v.verdict).toBe('BLOCK')
    expect(v.residualRisk).toBe('unresolved')
  })

  it('derives residual_risk from verdict when the field is absent', () => {
    const v = parseGptOutput(`VERDICT: BLOCK
FINDING: bad`)
    expect(v.residualRisk).toBe('unresolved')
  })

  it('signals malformed (null residual_risk) when nothing parseable', () => {
    const v = parseGptOutput('the model rambled without structure')
    expect(v.residualRisk).toBeNull()
  })
})

describe('decideDisposition (A3 asymmetric agreement)', () => {
  const base = {
    gptUnavailable: false,
    hardException: false,
    gptResidualRisk: 'none' as ResidualRisk | null,
    coderResidualRisk: 'none' as ResidualRisk,
  }

  it('PASS only when both sides are none', () => {
    const d = decideDisposition(base)
    expect(d.escalate).toBe(false)
    expect(d.reason).toBe('pass')
  })

  it('escalates when GPT is unavailable/malformed (highest priority)', () => {
    // Even if both would otherwise be none, unavailability wins.
    const d = decideDisposition({ ...base, gptUnavailable: true, gptResidualRisk: null })
    expect(d.escalate).toBe(true)
    expect(d.reason).toBe('gpt-unavailable')
  })

  it('escalates hard-exception even on clean double none', () => {
    const d = decideDisposition({ ...base, hardException: true })
    expect(d.escalate).toBe(true)
    expect(d.reason).toBe('hard-exception')
  })

  it('escalates on GPT BLOCK regardless of coder', () => {
    const d = decideDisposition({ ...base, gptResidualRisk: 'unresolved' })
    expect(d.escalate).toBe(true)
    expect(d.reason).toBe('gpt-block')
  })

  it('escalates when coder declares accepted (even if GPT says none)', () => {
    const d = decideDisposition({ ...base, coderResidualRisk: 'accepted' })
    expect(d.escalate).toBe(true)
    expect(d.reason).toBe('coder-residual')
  })

  it('escalates when coder declares unresolved', () => {
    const d = decideDisposition({ ...base, coderResidualRisk: 'unresolved' })
    expect(d.escalate).toBe(true)
    expect(d.reason).toBe('coder-residual')
  })

  it('escalates when GPT says accepted (even if coder says none)', () => {
    const d = decideDisposition({ ...base, gptResidualRisk: 'accepted' })
    expect(d.escalate).toBe(true)
    expect(d.reason).toBe('gpt-accepted')
  })

  it('hard-exception precedence: hard exception escalates before GPT-block reason is read', () => {
    const d = decideDisposition({ ...base, hardException: true, gptResidualRisk: 'unresolved' })
    expect(d.reason).toBe('hard-exception')
  })
})

describe('buildEscalationComment (A4 format)', () => {
  it('produces the four labelled lines and tags Trace', () => {
    const block = parseGateBlock(wellFormedBody)!
    const gpt = parseGptOutput(`WHAT_THIS_DOES: Adds a rent-burden multiplier.
FINDING: Clamp is applied after rounding, allowing 1.51x.
VERDICT: BLOCK
STAKES: Overstated affordability in proposals.
RESIDUAL_RISK: unresolved`)
    const disposition = decideDisposition({
      gptUnavailable: false,
      hardException: false,
      gptResidualRisk: gpt.residualRisk,
      coderResidualRisk: block.coderResidualRisk,
    })
    const comment = buildEscalationComment({ block, gpt, disposition, trace: 'traceh-ghmd' })
    expect(comment).toContain('WHAT THIS IS TRYING TO DO:')
    expect(comment).toContain('WHAT CODER SAYS:')
    expect(comment).toContain('WHAT GPT-5 FOUND:')
    expect(comment).toContain("WHAT'S AT STAKE IF THE CONCERN IS RIGHT:")
    expect(comment).toContain('@traceh-ghmd')
    expect(comment).toContain('VERDICT: BLOCK')
  })
})
