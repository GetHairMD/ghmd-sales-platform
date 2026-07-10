import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * qualification_review_notes RLS guardrail (source-scan) — PR3 §2.
 *
 * The rep note-write path is a SEPARATE table (pure RLS), chosen so reps get zero write
 * policy on qualification_reviews and therefore cannot touch the exec-issued columns
 * (recommendation / reviewed_by / reviewed_at / ai_summary). The live adversarial proof
 * runs via the Supabase MCP; this locks the migration's structural invariants into CI,
 * same idiom as rls-remediation.test.ts.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const NOTES = 'supabase/migrations/20260710090000_qualification_review_rep_notes.sql'
const PR1 = 'supabase/migrations/20260709120000_qualification_gate_schema_rls.sql'

const sql = read(NOTES)
// Comment-stripped view (leading `--` lines only) — the header documents the NIP id and
// design prose, so structural / absence checks scan executable SQL only.
const code = sql
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')

describe('qualification_review_notes migration', () => {
  it('targets the sales project and never references the NIP project in SQL', () => {
    expect(sql).toMatch(/cprltmwwldbxcsunsafl/)
    expect(code).not.toMatch(/kjweckggegifjmmqccul/)
  })

  it('creates the table keyed to prospects.id, one row per prospect, cascade-deleting', () => {
    expect(code).toMatch(/create table public\.qualification_review_notes/i)
    expect(code).toMatch(/prospect_id\s+uuid\s+not null\s+unique\s+references public\.prospects\(id\)\s+on delete cascade/i)
    expect(code).toMatch(/author_id\s+uuid\s+references auth\.users\(id\)/i)
  })

  it('enables RLS and revokes anon', () => {
    expect(code).toMatch(/alter table public\.qualification_review_notes enable row level security/i)
    expect(code).toMatch(/revoke all on public\.qualification_review_notes\s+from anon/i)
  })

  it('grants execs full access', () => {
    expect(code).toMatch(/create policy "exec_all" on public\.qualification_review_notes\s+for all/i)
    expect(code).toMatch(/iu\.designation = 'executive'/i)
  })

  it('gives reps SELECT / INSERT / UPDATE — scoped to their OWN prospect and authored as themselves', () => {
    expect(code).toMatch(/create policy "rep_select_own" on public\.qualification_review_notes\s+for select/i)
    expect(code).toMatch(/create policy "rep_insert_own" on public\.qualification_review_notes\s+for insert/i)
    expect(code).toMatch(/create policy "rep_update_own" on public\.qualification_review_notes\s+for update/i)
    // Own-prospect scoping.
    expect(code).toMatch(/p\.assigned_rep_id = \(select auth\.uid\(\)\)/i)
    // Author pinned to the caller (rep cannot attribute a note to someone else).
    expect(code).toMatch(/author_id = \(select auth\.uid\(\)\)/i)
  })

  it('gives reps NO delete path (append/edit only)', () => {
    expect(code).not.toMatch(/for delete/i)
  })

  it('introduces no blanket USING (true) / WITH CHECK (true) policy', () => {
    expect(code).not.toMatch(/using \(true\)/i)
    expect(code).not.toMatch(/with check \(true\)/i)
  })

  it('does NOT touch qualification_reviews — rep writes are isolated to the notes table', () => {
    // The exec-issued columns stay unwritable by reps because this migration adds no
    // policy to qualification_reviews at all.
    expect(code).not.toMatch(/on public\.qualification_reviews/i)
  })
})

describe('PR1 kept reps SELECT-only on qualification_reviews (the protected columns)', () => {
  const pr1 = read(PR1)
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')

  it('reps get only a rep_read_own FOR SELECT on qualification_reviews', () => {
    expect(pr1).toMatch(/create policy "rep_read_own" on public\.qualification_reviews\s+for select/i)
    // No rep insert/update/delete policy on the exec-issued table in PR1.
    expect(pr1).not.toMatch(/create policy "rep_(insert|update|delete)[^"]*" on public\.qualification_reviews/i)
  })
})
