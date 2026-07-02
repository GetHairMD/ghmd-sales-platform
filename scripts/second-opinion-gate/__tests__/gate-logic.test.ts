import { describe, it, expect } from 'vitest'
import {
  parseGateBlock,
  blockIsMalformed,
  parseGptOutput,
  decideDisposition,
  verifyDeclaration,
  buildEscalationComment,
  buildVerificationComment,
  type ResidualRisk,
  type DecisionRow,
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

describe('verifyDeclaration (declaration-integrity, closes row #24)', () => {
  const base = {
    rpcUnavailable: false,
    row: null as DecisionRow | null,
    coderResidualRisk: 'none' as ResidualRisk,
    bodyDecisionLogId: null as number | null,
  }

  it('OK when no row is bound and coder declares none (normal case)', () => {
    const v = verifyDeclaration(base)
    expect(v.escalate).toBe(false)
    expect(v.reason).toBe('verify-ok')
  })

  // The fourth test (amendment 1): a nonzero declaration with nothing to verify
  // against is itself the failure — it must NOT silently pass.
  it('escalates when no row is bound but coder declares accepted', () => {
    const v = verifyDeclaration({ ...base, coderResidualRisk: 'accepted' })
    expect(v.escalate).toBe(true)
    expect(v.reason).toBe('verify-no-row-nonzero')
  })

  it('escalates when no row is bound but coder declares unresolved', () => {
    const v = verifyDeclaration({ ...base, coderResidualRisk: 'unresolved' })
    expect(v.escalate).toBe(true)
    expect(v.reason).toBe('verify-no-row-nonzero')
  })

  it('escalates (fail closed) when the lookup is unavailable', () => {
    const v = verifyDeclaration({ ...base, rpcUnavailable: true })
    expect(v.escalate).toBe(true)
    expect(v.reason).toBe('verify-rpc-unavailable')
  })

  it('OK when a bound row matches the body declaration (none)', () => {
    const row: DecisionRow = { id: 30, residual_risk: 'none', status: 'ADOPTED' }
    const v = verifyDeclaration({ ...base, row, coderResidualRisk: 'none' })
    expect(v.escalate).toBe(false)
    expect(v.reason).toBe('verify-ok')
  })

  it('OK when a bound row matches an accepted declaration (still escalates later in decideDisposition)', () => {
    const row: DecisionRow = { id: 31, residual_risk: 'accepted', status: 'ADOPTED' }
    const v = verifyDeclaration({ ...base, row, coderResidualRisk: 'accepted' })
    expect(v.escalate).toBe(false)
    expect(v.reason).toBe('verify-ok')
  })

  it('escalates when the bound row residual_risk differs from the body (dishonest declaration)', () => {
    const row: DecisionRow = { id: 32, residual_risk: 'accepted', status: 'ADOPTED' }
    const v = verifyDeclaration({ ...base, row, coderResidualRisk: 'none' })
    expect(v.escalate).toBe(true)
    expect(v.reason).toBe('verify-risk-mismatch')
  })

  it('escalates when body decision_log_id points at a different row than the one bound to the PR', () => {
    const row: DecisionRow = { id: 32, residual_risk: 'none', status: 'ADOPTED' }
    const v = verifyDeclaration({ ...base, row, coderResidualRisk: 'none', bodyDecisionLogId: 99 })
    expect(v.escalate).toBe(true)
    expect(v.reason).toBe('verify-id-mismatch')
  })

  it('OK when body decision_log_id matches the bound row id', () => {
    const row: DecisionRow = { id: 32, residual_risk: 'none', status: 'ADOPTED' }
    const v = verifyDeclaration({ ...base, row, coderResidualRisk: 'none', bodyDecisionLogId: 32 })
    expect(v.escalate).toBe(false)
    expect(v.reason).toBe('verify-ok')
  })

  // Regression (found by the gate's own GPT-5 review of PR #44): a bigint id
  // serialized as a string must not falsely trigger verify-id-mismatch.
  it('does not false-mismatch when the row id arrives as a string', () => {
    const row = { id: '32' as unknown as number, residual_risk: 'none' as ResidualRisk, status: 'ADOPTED' }
    const v = verifyDeclaration({ ...base, row, coderResidualRisk: 'none', bodyDecisionLogId: 32 })
    expect(v.escalate).toBe(false)
    expect(v.reason).toBe('verify-ok')
  })
})

describe('buildVerificationComment', () => {
  it('renders the body declaration, the bound row, and tags Trace on a risk mismatch', () => {
    // wellFormedBody declares decision_log_id: 22, coder_residual_risk: none.
    // Bind a row with the SAME id (so the id check passes) but residual_risk:
    // accepted — isolating the risk-mismatch branch.
    const block = parseGateBlock(wellFormedBody)!
    const row: DecisionRow = { id: 22, residual_risk: 'accepted', status: 'ADOPTED' }
    const verify = verifyDeclaration({
      rpcUnavailable: false,
      row,
      coderResidualRisk: block.coderResidualRisk,
      bodyDecisionLogId: block.decisionLogId,
    })
    const comment = buildVerificationComment({ block, verify, row, trace: 'traceh-ghmd' })
    expect(comment).toContain('declaration integrity escalation')
    expect(comment).toContain('PR-BODY DECLARATION:')
    expect(comment).toContain('#22')
    expect(comment).toContain('verify-risk-mismatch')
    expect(comment).toContain('@traceh-ghmd')
  })

  it('states "none bound" when the failure is a nonzero declaration with no row', () => {
    const block = parseGateBlock(`<!-- second-opinion-gate
category: 1
coder_residual_risk: accepted
spec: something
-->`)!
    const verify = verifyDeclaration({
      rpcUnavailable: false,
      row: null,
      coderResidualRisk: block.coderResidualRisk,
      bodyDecisionLogId: block.decisionLogId,
    })
    const comment = buildVerificationComment({ block, verify, row: null, trace: 'traceh-ghmd' })
    expect(comment).toContain('none bound to this PR')
    expect(comment).toContain('verify-no-row-nonzero')
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
