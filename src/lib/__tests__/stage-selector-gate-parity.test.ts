import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Deal Room ↔ Pipeline Board gate parity guard.
 *
 * The Deal Room StageSelector previously wrote `prospects.stage` directly from the
 * browser, checked only the funding pre-qual gate via a raw window.confirm(), and had
 * NO triage-gate check — so a prospect could be advanced past either soft gate from the
 * Deal Room with no skipped_triage / skipped_funding_prequal flag recorded (residual
 * risk on ops.decision_log id 60).
 *
 * Both stage-change surfaces must now funnel through the ONE sanctioned server action
 * (`moveProspectStage`), which records skips SERVER-SIDE, and use the ONE confirm UI
 * (ConfirmDialog). This source-scan pins that invariant so the direct-write /
 * window.confirm / single-gate regression can't return.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const STAGE_SELECTOR = 'src/components/StageSelector.tsx'
const ACTIONS = 'src/app/pipeline/actions.ts'

describe('Deal Room StageSelector routes through the sanctioned gate path', () => {
  it('calls the shared moveProspectStage server action', () => {
    const src = read(STAGE_SELECTOR)
    expect(src, 'StageSelector must import moveProspectStage').toContain('moveProspectStage')
    expect(src).toContain("from '@/app/pipeline/actions'")
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

  it('handles BOTH soft gates (triage and prequal), not just funding', () => {
    const src = read(STAGE_SELECTOR)
    expect(src).toContain("'triage'")
    expect(src).toContain("'prequal'")
  })
})

describe('the triage gate is enforced and recorded SERVER-SIDE', () => {
  it('moveProspectStage requires confirm and records skipped_triage when crossing into Proposal Sent', () => {
    const src = read(ACTIONS)
    expect(src).toContain('TRIAGE_GATE_STAGE')
    // Crossing the gate without confirmation returns requiresConfirm: 'triage' ...
    expect(src).toContain("requiresConfirm: 'triage'")
    // ... and once confirmed, the skip is written to the record server-side.
    expect(src).toContain('skipped_triage')
  })
})
