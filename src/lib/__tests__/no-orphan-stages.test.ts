import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression guard: the 7-stage franchise pipeline used to be copy-pasted into three files.
 * Consumers must now import from src/lib/pipeline-stages.ts and never re-declare a stage
 * list or reference a retired label. This scans the actual source on disk.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const RETIRED_LABELS = ['FDD Delivered', 'LOI Signed', 'Agreement Signed']

// Files that render/mutate stage and must source it from the shared constant.
const STAGE_CONSUMERS = [
  'src/components/StageSelector.tsx',
  'src/app/pipeline/KanbanBoard.tsx',
  'src/app/prospects/[id]/page.tsx',
  'src/app/prospects/page.tsx',
]

describe('no orphaned stage definitions', () => {
  it('no consumer contains a retired franchise-era stage label', () => {
    for (const f of STAGE_CONSUMERS) {
      const src = read(f)
      for (const label of RETIRED_LABELS) {
        expect(src, `${f} still references "${label}"`).not.toContain(label)
      }
    }
  })

  it('every stage consumer imports from pipeline-stages', () => {
    for (const f of STAGE_CONSUMERS) {
      expect(read(f), `${f} does not import from pipeline-stages`).toContain(
        "@/lib/pipeline-stages",
      )
    }
  })

  it('no consumer re-declares a hardcoded { id: 1, label: ... } stage array', () => {
    for (const f of STAGE_CONSUMERS) {
      expect(read(f), `${f} re-declares a hardcoded stage list`).not.toMatch(
        /id:\s*1,\s*label:/,
      )
    }
  })

  it('the new-prospect form no longer inserts the string stage "new_lead"', () => {
    expect(read('src/app/prospects/new/page.tsx')).not.toContain("stage: 'new_lead'")
  })
})
