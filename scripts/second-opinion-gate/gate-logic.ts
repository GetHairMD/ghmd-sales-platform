/**
 * Second-Opinion Gate — pure logic (A1–A3 of the design doc).
 *
 * This module has NO side effects: no network, no git, no process exit.
 * It holds the second-opinion system prompt (A1), the PR-block + model-output parsers,
 * and the asymmetric-agreement decision function (A3). The thin runners
 * (run-gate.ts / run-sweep.ts) do all I/O and call into here so the logic
 * is unit-testable (see __tests__/gate-logic.test.ts).
 */

export type ResidualRisk = 'none' | 'accepted' | 'unresolved'

/** A1 — the exact adversarial-review system prompt sent to OpenAI. Do not soften. */
export const SYSTEM_PROMPT = `You are an adversarial second reviewer for a healthcare technology company
(GetHairMD). You are reviewing a single code change in isolation. You were
not involved in writing this code and have no context beyond what is provided
below. Your job is not to confirm the change is fine — your job is to find
the specific way it fails.

You will be given:
1. SPEC: a description of what this change is supposed to do or prevent
2. DIFF: the actual code change

Your task, in order:

STEP 1 — ATTACK
Find the most likely way this change fails to do what SPEC claims. Look
specifically for:
- Security/auth bypass: can this be called, queried, or triggered in a way
  that skips the intended check?
- Data exposure: does this expose PHI, PHI-adjacent data, or provider/patient
  identity beyond what SPEC intends?
- Logic divergence: does the actual computation (financial formula, gating
  threshold, cache/TTL logic, taxonomy match) diverge from what SPEC says it
  should compute, including edge cases (zero, null, boundary values, expired
  state, concurrent access)?
- Silent failure: if this breaks, does it fail loudly (error, block) or
  quietly (wrong number, stale data, unauthenticated pass-through)?

State the single most serious issue you find. If you genuinely find nothing
after this analysis, say so explicitly — do not invent a minor issue to
appear thorough.

STEP 2 — VERDICT
Classify what you found into exactly one of three categories:
- BLOCK: This is PHI/PHI-adjacent exposure without a compensating control,
  an unverifiable financial or clinical claim a physician or patient could
  rely on, an irreversible action without rollback, or anything touching
  regulatory filings, securities, or signed-contract logic. No rationale
  makes this acceptable to ship as-is.
- ACCEPTABLE WITH RATIONALE: A real, known limitation exists, but there is a
  specific, falsifiable, checkable reason the risk is contained right now
  (not "low risk" — a concrete mechanism: e.g. "only one known caller ID
  validated server-side," "TTL exposure window is bounded to under 4 hours
  by X"). If you classify something this way, you must state the falsifiable
  claim explicitly. If you cannot state a checkable reason, this is not
  ACCEPTABLE WITH RATIONALE — reclassify as BLOCK.
- NO ISSUE: Nothing found after genuine adversarial analysis. This is not
  the default — only use this if Step 1 produced no serious finding.

STEP 3 — OUTPUT
Respond in this exact structure, nothing else:

WHAT_THIS_DOES: [one sentence, from SPEC]
FINDING: [one to two sentences — the specific issue, or "none found"]
VERDICT: [BLOCK | ACCEPTABLE_WITH_RATIONALE | NO_ISSUE]
RATIONALE: [required if ACCEPTABLE_WITH_RATIONALE — the falsifiable claim.
            Omit for BLOCK or NO_ISSUE.]
STAKES: [one sentence — what happens if your finding is correct and ignored]
RESIDUAL_RISK: [none | accepted | unresolved — maps directly to VERDICT:
  NO_ISSUE -> none, ACCEPTABLE_WITH_RATIONALE -> accepted, BLOCK -> unresolved]

Do not soften findings to be agreeable. Do not pad NO_ISSUE responses with
caveats. A wrong BLOCK costs the team 90 seconds of review. A missed real
issue costs the team an undetected gap. Bias toward finding real issues.`

/**
 * A6 trigger categories. Classification is by what the code DOES, not just the
 * file it touches (A6 classification note). Tagged manually by the PR author
 * (Step 5) in the PR-body block below.
 */
export const TRIGGER_CATEGORIES: Record<number, string> = {
  1: 'Security/auth boundaries, RLS policies, webhook signature verification',
  2: 'Financial formulas (addressable market, PPI rent-burden multiplier, financing math)',
  3: 'PHI-adjacent data paths',
  4: 'Operator-score gating logic (the low-confidence hard gate specifically)',
  5: 'NPI provider data handling (caching, TTL expiry, taxonomy matching)',
}

/**
 * A8 hard exceptions — always escalate, even on a clean double NO_ISSUE pass.
 * Set hard_exception: true in the PR block when the change touches any of these.
 */
export const HARD_EXCEPTION_TRIGGERS = [
  'PHI architecture changes',
  'Regulatory filing logic',
  'Securities-related logic',
  'Signed-contract logic (Ottri, Revian, HairCodeRx terms encoded as business rules)',
]

export interface GateBlock {
  category: number | null
  hardException: boolean
  coderResidualRisk: ResidualRisk
  decisionLogId: number | null
  spec: string
  coderSelfJustification: string
}

export interface GptVerdict {
  whatThisDoes: string
  finding: string
  verdict: 'BLOCK' | 'ACCEPTABLE_WITH_RATIONALE' | 'NO_ISSUE' | null
  rationale: string
  stakes: string
  residualRisk: ResidualRisk | null
}

export interface Disposition {
  escalate: boolean
  /** Stable machine reason — one of the A3 branches. */
  reason:
    | 'pass'
    | 'gpt-unavailable'
    | 'hard-exception'
    | 'gpt-block'
    | 'coder-residual'
    | 'gpt-accepted'
    | 'ambiguous-fail-closed'
  human: string
}

const BLOCK_OPEN = '<!-- second-opinion-gate'
const SCALAR_KEYS = ['category', 'hard_exception', 'coder_residual_risk', 'decision_log_id']
const BLOCK_KEYS = ['spec', 'coder_self_justification']
const ALL_KEYS = [...SCALAR_KEYS, ...BLOCK_KEYS]

function isResidualRisk(v: string): v is ResidualRisk {
  return v === 'none' || v === 'accepted' || v === 'unresolved'
}

/**
 * Parse the gate block out of a PR body. Returns null when no block is present
 * — that means the PR is NOT classified into the trigger list (A6) and the
 * gate is a no-op for it. A present-but-broken block returns a GateBlock with
 * category null / coderResidualRisk defaulted, which the runner treats as a
 * malformed-classification escalation (fail closed).
 *
 * Expected format inside the PR description:
 *
 *   <!-- second-opinion-gate
 *   category: 2
 *   hard_exception: false
 *   coder_residual_risk: none
 *   decision_log_id: 22
 *   spec: |
 *     What this change is supposed to do or prevent.
 *   coder_self_justification: |
 *     One to two sentences.
 *   -->
 */
export function parseGateBlock(prBody: string | null | undefined): GateBlock | null {
  if (!prBody) return null
  const start = prBody.indexOf(BLOCK_OPEN)
  if (start === -1) return null
  const afterOpen = start + BLOCK_OPEN.length
  const end = prBody.indexOf('-->', afterOpen)
  const inner = prBody.slice(afterOpen, end === -1 ? undefined : end)
  const lines = inner.split('\n')

  const scalars: Record<string, string> = {}
  const blocks: Record<string, string[]> = {}
  let capturing: string | null = null

  const keyMatch = (line: string): { key: string; rest: string } | null => {
    const m = line.match(/^\s*([a-z_]+)\s*:\s?(.*)$/)
    if (m && ALL_KEYS.includes(m[1])) return { key: m[1], rest: m[2] }
    return null
  }

  for (const line of lines) {
    const km = keyMatch(line)
    if (km) {
      if (BLOCK_KEYS.includes(km.key)) {
        capturing = km.key
        blocks[km.key] = []
        // Support inline `spec: some text` as well as `spec: |` block scalars.
        const inline = km.rest.trim()
        if (inline && inline !== '|' && inline !== '>') blocks[km.key].push(inline)
      } else {
        scalars[km.key] = km.rest.trim()
        capturing = null
      }
      continue
    }
    if (capturing) blocks[capturing].push(line)
  }

  const dedent = (arr: string[] | undefined): string => {
    if (!arr || arr.length === 0) return ''
    const text = arr.join('\n').replace(/^\n+|\n+$/g, '')
    const indents = text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => (l.match(/^\s*/)?.[0].length ?? 0))
    const min = indents.length ? Math.min(...indents) : 0
    return text
      .split('\n')
      .map((l) => l.slice(min))
      .join('\n')
      .trim()
  }

  const categoryRaw = scalars['category']
  const category = categoryRaw && /^\d+$/.test(categoryRaw) ? Number(categoryRaw) : null
  const decisionLogRaw = scalars['decision_log_id']
  const decisionLogId =
    decisionLogRaw && /^\d+$/.test(decisionLogRaw) ? Number(decisionLogRaw) : null

  const crrRaw = (scalars['coder_residual_risk'] ?? '').toLowerCase()
  // Default to 'unresolved' when missing/invalid — fail closed (forces escalation).
  const coderResidualRisk: ResidualRisk = isResidualRisk(crrRaw) ? crrRaw : 'unresolved'

  return {
    category,
    hardException: (scalars['hard_exception'] ?? '').toLowerCase() === 'true',
    coderResidualRisk,
    decisionLogId,
    spec: dedent(blocks['spec']),
    coderSelfJustification: dedent(blocks['coder_self_justification']),
  }
}

/** True when the block is missing the fields needed to run the gate at all. */
export function blockIsMalformed(block: GateBlock): boolean {
  return block.category === null || block.spec.trim().length === 0
}

/** Parse the structured second-opinion response (A1 STEP 3 format). */
export function parseGptOutput(text: string | null | undefined): GptVerdict {
  const get = (key: string): string => {
    if (!text) return ''
    // Capture from `KEY:` up to the next known KEY: marker or end of string.
    const re = new RegExp(
      `^\\s*${key}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:WHAT_THIS_DOES|FINDING|VERDICT|RATIONALE|STAKES|RESIDUAL_RISK)\\s*:|$)`,
      'm',
    )
    const m = text.match(re)
    return m ? m[1].trim() : ''
  }

  const verdictRaw = get('VERDICT').toUpperCase()
  let verdict: GptVerdict['verdict'] = null
  if (verdictRaw.includes('ACCEPTABLE')) verdict = 'ACCEPTABLE_WITH_RATIONALE'
  else if (verdictRaw.includes('BLOCK')) verdict = 'BLOCK'
  else if (verdictRaw.includes('NO_ISSUE') || verdictRaw.includes('NO ISSUE'))
    verdict = 'NO_ISSUE'

  const rrRaw = get('RESIDUAL_RISK').toLowerCase()
  let residualRisk: ResidualRisk | null = null
  if (rrRaw.includes('unresolved')) residualRisk = 'unresolved'
  else if (rrRaw.includes('accepted')) residualRisk = 'accepted'
  else if (rrRaw.includes('none')) residualRisk = 'none'

  // If RESIDUAL_RISK was unparseable but VERDICT was clear, derive it (A1: they
  // map directly). Leaving residualRisk null signals "malformed" to the caller.
  if (residualRisk === null && verdict) {
    residualRisk =
      verdict === 'NO_ISSUE' ? 'none' : verdict === 'ACCEPTABLE_WITH_RATIONALE' ? 'accepted' : 'unresolved'
  }

  return {
    whatThisDoes: get('WHAT_THIS_DOES'),
    finding: get('FINDING'),
    verdict,
    rationale: get('RATIONALE'),
    stakes: get('STAKES'),
    residualRisk,
  }
}

/**
 * The minimal projection returned by public.gate_decision_for_pr(pr_number):
 * the single ops.decision_log row bound to a PR via related_pr. Never carries
 * reasoning/decision/title/legal_flag — the lookup deliberately omits them.
 */
export interface DecisionRow {
  id: number
  residual_risk: ResidualRisk
  status: string
}

export interface VerifyInput {
  /** True if the decision_log lookup failed/timed out or its credentials are absent. */
  rpcUnavailable: boolean
  /** The row bound to this PR, or null when none is bound. */
  row: DecisionRow | null
  /** coder_residual_risk declared in the PR body. */
  coderResidualRisk: ResidualRisk
  /** decision_log_id declared in the PR body, or null when absent. */
  bodyDecisionLogId: number | null
}

export interface VerifyResult {
  escalate: boolean
  reason:
    | 'verify-ok'
    | 'verify-rpc-unavailable'
    | 'verify-id-mismatch'
    | 'verify-risk-mismatch'
    | 'verify-no-row-nonzero'
  human: string
}

/**
 * Declaration-integrity check (closes decision_log row #24). Verifies the
 * PR-body `coder_residual_risk` declaration against the ops.decision_log row
 * bound to this PR. Runs BEFORE the OpenAI second opinion so a dishonest or
 * unverifiable declaration is caught (and the API call is skipped).
 *
 * Matrix (agreed with Trace, corrected no-row semantics):
 *   - lookup unavailable                 -> escalate (fail closed)
 *   - row exists, body id mismatches      -> escalate (author pointed elsewhere)
 *   - row exists, residual_risk mismatch  -> escalate (declaration != table)
 *   - row exists, matches                 -> ok (an honest `accepted`/`unresolved`
 *                                            still escalates later in decideDisposition)
 *   - no row, body says `none`            -> ok (normal case; most PRs log nothing)
 *   - no row, body says accepted/unresolved -> escalate: a nonzero declaration with
 *                                            nothing to verify against is itself the failure
 */
export function verifyDeclaration(input: VerifyInput): VerifyResult {
  const { rpcUnavailable, row, coderResidualRisk, bodyDecisionLogId } = input

  if (rpcUnavailable) {
    return {
      escalate: true,
      reason: 'verify-rpc-unavailable',
      human:
        'Could not verify the PR-body residual_risk declaration against ops.decision_log ' +
        '(lookup unavailable) — failing closed.',
    }
  }

  if (row) {
    // Coerce row.id defensively: PostgREST serializes this bigint as a JSON
    // number in the current config, but Number() keeps the comparison correct
    // even if a driver/config change returns it as a string (ids are far below
    // 2^53, so no precision loss). Without this a string id would strict-!==
    // the numeric body value and falsely trigger verify-id-mismatch.
    if (bodyDecisionLogId !== null && Number(row.id) !== bodyDecisionLogId) {
      return {
        escalate: true,
        reason: 'verify-id-mismatch',
        human:
          `PR-body decision_log_id (${bodyDecisionLogId}) does not match the ops.decision_log ` +
          `row bound to this PR (#${row.id}).`,
      }
    }
    if (coderResidualRisk !== row.residual_risk) {
      return {
        escalate: true,
        reason: 'verify-risk-mismatch',
        human:
          `PR-body coder_residual_risk (${coderResidualRisk}) does not match ops.decision_log ` +
          `row #${row.id} (residual_risk: ${row.residual_risk}).`,
      }
    }
    return {
      escalate: false,
      reason: 'verify-ok',
      human: `PR-body declaration matches ops.decision_log row #${row.id}.`,
    }
  }

  // No row bound to this PR.
  if (coderResidualRisk !== 'none') {
    return {
      escalate: true,
      reason: 'verify-no-row-nonzero',
      human:
        `PR-body declares coder_residual_risk: ${coderResidualRisk} but no ops.decision_log row ` +
        'is bound to this PR — a nonzero declaration with nothing to verify against fails closed.',
    }
  }
  return {
    escalate: false,
    reason: 'verify-ok',
    human: 'No decision_log row bound to this PR and coder_residual_risk: none — nothing to verify.',
  }
}

export interface DecideInput {
  /** True if the OpenAI call failed, timed out, or returned malformed output. */
  gptUnavailable: boolean
  hardException: boolean
  gptResidualRisk: ResidualRisk | null
  coderResidualRisk: ResidualRisk
}

/**
 * A3 — asymmetric-agreement comparison, in the exact order specified.
 * Silent pass requires BOTH sides to independently conclude "none". Any
 * accepted/unresolved from either side, any hard exception, or any GPT
 * unavailability escalates. Anything ambiguous fails closed (escalates).
 */
export function decideDisposition(input: DecideInput): Disposition {
  const { gptUnavailable, hardException, gptResidualRisk, coderResidualRisk } = input

  if (gptUnavailable) {
    return {
      escalate: true,
      reason: 'gpt-unavailable',
      human: 'Second opinion missing or malformed — a broken second opinion is not "no issue found."',
    }
  }
  if (hardException) {
    return {
      escalate: true,
      reason: 'hard-exception',
      human: 'Hard-exception category (PHI architecture / regulatory / securities / signed-contract) — always escalates.',
    }
  }
  if (gptResidualRisk === 'unresolved') {
    return { escalate: true, reason: 'gpt-block', human: 'The second opinion returned BLOCK.' }
  }
  if (coderResidualRisk === 'accepted' || coderResidualRisk === 'unresolved') {
    return {
      escalate: true,
      reason: 'coder-residual',
      human: `Coder declared residual_risk: ${coderResidualRisk}.`,
    }
  }
  if (gptResidualRisk === 'accepted') {
    return {
      escalate: true,
      reason: 'gpt-accepted',
      human: 'The second opinion returned ACCEPTABLE_WITH_RATIONALE (any accepted residual risk triggers review).',
    }
  }
  if (gptResidualRisk === 'none' && coderResidualRisk === 'none') {
    return { escalate: false, reason: 'pass', human: 'Both sides independently concluded none.' }
  }
  return {
    escalate: true,
    reason: 'ambiguous-fail-closed',
    human: 'Ambiguous comparison result — failing closed.',
  }
}

/** A4 — the exact four-line escalation summary posted as a PR comment. */
export function buildEscalationComment(args: {
  block: GateBlock
  gpt: GptVerdict
  disposition: Disposition
  trace: string
}): string {
  const { block, gpt, disposition, trace } = args
  const whatItDoes = (gpt.whatThisDoes || block.spec.split('\n')[0] || '(see PR spec)').trim()
  const coderSays = (block.coderSelfJustification.split('\n')[0] || '(no self-justification provided)').trim()
  const gptFound =
    disposition.reason === 'gpt-unavailable'
      ? 'Second opinion unavailable or malformed — see workflow logs.'
      : `${gpt.finding || '(no finding text)'} — VERDICT: ${gpt.verdict ?? 'UNKNOWN'}`
  const stakes =
    gpt.stakes ||
    (disposition.reason === 'hard-exception'
      ? 'Hard-exception change shipping without human review of an irreversible/regulated action.'
      : disposition.human)

  return [
    '## 🔶 Second-Opinion Gate — escalation',
    '',
    `WHAT THIS IS TRYING TO DO: ${whatItDoes}`,
    `WHAT CODER SAYS: ${coderSays}`,
    `WHAT THE SECOND OPINION FOUND: ${gptFound}`,
    `WHAT'S AT STAKE IF THE CONCERN IS RIGHT: ${stakes}`,
    '',
    `Trigger: \`${disposition.reason}\` — ${disposition.human}`,
    '',
    `@${trace} — this change is blocked pending your review. Accept (log to ops.decision_log) or send back to Coder.`,
  ].join('\n')
}

/**
 * Escalation comment for a declaration-integrity failure (verifyDeclaration).
 * Distinct from the A4 comment: there is no GPT verdict here — the gate stopped
 * before the second opinion because the PR-body declaration could not be
 * reconciled with ops.decision_log.
 */
export function buildVerificationComment(args: {
  block: GateBlock
  verify: VerifyResult
  row: DecisionRow | null
  trace: string
}): string {
  const { block, verify, row, trace } = args
  const whatItDoes = (block.spec.split('\n')[0] || '(see PR spec)').trim()
  const bodyDeclaration =
    `coder_residual_risk: ${block.coderResidualRisk}` +
    (block.decisionLogId !== null ? `, decision_log_id: ${block.decisionLogId}` : '')
  const boundRow = row
    ? `#${row.id} (residual_risk: ${row.residual_risk}, status: ${row.status})`
    : 'none bound to this PR'

  return [
    '## 🔶 Second-Opinion Gate — declaration integrity escalation',
    '',
    `WHAT THIS IS TRYING TO DO: ${whatItDoes}`,
    `PR-BODY DECLARATION: ${bodyDeclaration}`,
    `ops.decision_log ROW BOUND TO THIS PR: ${boundRow}`,
    '',
    `Trigger: \`${verify.reason}\` — ${verify.human}`,
    '',
    `@${trace} — the PR-body residual_risk declaration could not be verified against ` +
      'ops.decision_log. Correct the PR-body declaration or the decision_log row (via a ' +
      'sanctioned write path), or review manually.',
  ].join('\n')
}
