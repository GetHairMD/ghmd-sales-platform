import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Deal Room ↔ Pipeline Board gate parity guard.
 *
 * The Deal Room StageSelector previously wrote `prospects.stage` directly from the
 * browser, checked only the funding pre-qual gate via a raw window.confirm(), and had
 * NO triage-gate check — so a prospect could be advanced past a gate from the Deal Room
 * with no flag recorded (residual risk on ops.decision_log id 60).
 *
 * Both stage-change surfaces must funnel through the ONE sanctioned server action
 * (`moveProspectStage`), which enforces the gates SERVER-SIDE, and use the ONE dialog UI
 * (ConfirmDialog). This source-scan pins that invariant so the direct-write /
 * window.confirm / single-gate regression can't return.
 *
 * PR3 (#110): the soft triage confirm was REPLACED by the HARD qualification gate at the
 * same boundary (advancing past Qualification Review requires a cleared 'proceed'
 * review; scoping §2.1). This test now pins the hard gate + prequal soft gate, and that
 * skipped_triage is never written.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const STAGE_SELECTOR = 'src/components/StageSelector.tsx'
const PIPELINE_BOARD = 'src/app/(app)/pipeline/PipelineBoard.tsx'
const ACTIONS = 'src/app/(app)/pipeline/actions.ts'

describe('Deal Room StageSelector routes through the sanctioned gate path', () => {
  it('calls the shared moveProspectStage server action', () => {
    const src = read(STAGE_SELECTOR)
    expect(src, 'StageSelector must import moveProspectStage').toContain('moveProspectStage')
    expect(src).toContain("from '@/app/(app)/pipeline/actions'")
  })

  it('does NOT write prospects.stage directly from the client', () => {
    const src = read(STAGE_SELECTOR)
    // The old bypass imported the browser Supabase client and called .from('prospects').update().
    expect(src, 'StageSelector must not use the browser Supabase client for stage writes').not.toContain(
      '@/lib/supabase/client',
    )
    expect(src).not.toContain("from('prospects')")
  })

  it('uses ConfirmDialog, not a raw window.confirm()', () => {
    const src = read(STAGE_SELECTOR)
    expect(src).toContain('ConfirmDialog')
    expect(src, 'StageSelector must not reintroduce window.confirm').not.toContain('window.confirm')
  })

  it('handles the hard qualification block AND the prequal soft gate', () => {
    const src = read(STAGE_SELECTOR)
    expect(src, 'must handle the hard qualification block').toContain("'qualification'")
    expect(src, 'must still handle the prequal soft gate').toContain("'prequal'")
  })
})

describe('Pipeline Board handles the same gates through the same action', () => {
  it('routes through moveProspectStage and handles the qualification hard block', () => {
    const src = read(PIPELINE_BOARD)
    expect(src).toContain('moveProspectStage')
    expect(src, 'board must handle the hard qualification block').toContain("'qualification'")
    expect(src).toContain('ConfirmDialog')
  })
})

describe('the hard qualification gate is enforced SERVER-SIDE; skipped_triage stays deprecated (#110)', () => {
  it('moveProspectStage hard-blocks crossing the qualification boundary and never records skipped_triage', () => {
    const src = read(ACTIONS)
    // The hard gate is evaluated on the move itself (not a UI-only guard).
    expect(src, 'must evaluate the qualification boundary crossing').toContain('crossesQualificationGate')
    expect(src, 'must return the non-overridable hard block').toContain("blocked: 'qualification'")
    // The proceed review is the gate signal.
    expect(src).toContain("'proceed'")
    // The soft triage confirm was replaced by the hard gate — it must be gone.
    expect(src, 'the soft triage confirm was replaced by the hard gate').not.toContain("requiresConfirm: 'triage'")
    // skipped_triage remains deprecated (#110) — the flag must NOT be written
    // (a deprecation *comment* naming the column would be fine; only an assignment is forbidden).
    expect(src, 'skipped_triage is deprecated (#110) — actions.ts must not write it').not.toMatch(/skipped_triage\s*[:=]/)
    // The prequal soft gate is retained.
    expect(src).toContain("requiresConfirm: 'prequal'")
  })
})
