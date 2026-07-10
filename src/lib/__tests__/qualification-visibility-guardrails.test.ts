import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Qualification visibility guardrails (PR3 §1/§5/§8).
 *
 * The exec-only qualification tables — qualification_scores, qualification_enrichment,
 * rep_call_grades — must NEVER be rendered or fetched by a rep-facing surface: not
 * hidden-by-CSS, actually never queried for a rep session (scoping §5). RLS is the hard
 * backstop, but per the Hard Rule 10 lesson we also lock the source shape so a
 * regression can't quietly query an exec-only table from a page a rep loads.
 *
 * The repo has no rep-vs-exec DB harness (RLS is otherwise proven by live MCP checks +
 * migration source-scans), so this is the in-repo enforcement — same idiom as
 * public-proposal-guardrails.test.ts.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Recursively collect .ts/.tsx files under a repo-relative dir (skips stories). */
function collect(relDir: string): string[] {
  const abs = join(process.cwd(), relDir)
  if (!existsSync(abs)) return []
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    const rel = `${relDir}/${entry}`
    if (statSync(join(process.cwd(), rel)).isDirectory()) out.push(...collect(rel))
    else if (/\.tsx?$/.test(entry) && !/\.stories\.tsx?$/.test(entry)) out.push(rel)
  }
  return out
}

// Tables that carry the exec-only mechanics reps must never see.
const EXEC_ONLY_TABLES = ['qualification_scores', 'qualification_enrichment', 'rep_call_grades']

// The ONLY files permitted to reference the exec-only tables — both are exec-gated
// (rendered only behind an executive branch AND re-check the viewer themselves).
const EXEC_ONLY_SURFACES = [
  'src/components/qualification/QualificationExecDetail.tsx',
  'src/components/qualification/RepCallGradeForm.tsx',
]

// Rep-facing render surfaces a rep session actually loads. None may reference an
// exec-only table. (qualification_reviews / qualification_review_notes ARE rep-safe and
// intentionally not in the forbidden list.)
const REP_FACING = [
  'src/app/(app)/prospects/[id]/page.tsx',
  'src/app/(app)/prospects/[id]/DealRoom.tsx',
  'src/components/qualification/QualificationReviewPanel.tsx',
  'src/app/(app)/pipeline/PipelineBoard.tsx',
  // Every qualification component EXCEPT the exec-only ones.
  ...collect('src/components/qualification').filter((f) => !EXEC_ONLY_SURFACES.includes(f)),
]
// De-dupe (QualificationReviewPanel is also picked up by collect()).
const REP_FACING_UNIQUE = [...new Set(REP_FACING)]

describe('rep-facing surfaces never render or fetch exec-only qualification tables', () => {
  for (const file of REP_FACING_UNIQUE) {
    const src = read(file)
    for (const table of EXEC_ONLY_TABLES) {
      it(`${file} never references ${table}`, () => {
        expect(src, `${file} must not query the exec-only ${table}`).not.toContain(table)
      })
    }
  }
})

describe('the exec-only detail surface self-gates (defense in depth under RLS)', () => {
  it('QualificationExecDetail re-checks viewerIsExecutive and fails closed', () => {
    const src = read('src/components/qualification/QualificationExecDetail.tsx')
    expect(src).toContain('viewerIsExecutive')
    expect(src, 'must return null for a non-exec').toMatch(/return null/)
  })

  it('the prospect page renders QualificationExecDetail ONLY inside an executive branch', () => {
    const src = read('src/app/(app)/prospects/[id]/page.tsx')
    // The exec node is constructed only when isExecutive is true.
    expect(src).toMatch(/isExecutive\s*\?\s*<QualificationExecDetail/)
    // And the page itself never queries an exec-only table.
    for (const table of EXEC_ONLY_TABLES) {
      expect(src, `page.tsx must not query ${table}`).not.toContain(table)
    }
  })
})

describe('exec-only WRITE paths are gated on viewerIsExecutive', () => {
  it('the qualification actions gate the recommendation + rep-grade writes on executive', () => {
    const src = read('src/app/(app)/prospects/[id]/qualification-actions.ts')
    expect(src).toContain('viewerIsExecutive')
  })
})
