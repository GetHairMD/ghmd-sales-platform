/**
 * export-decision-log.ts
 *
 * Git mirror generator for the Decision Log.
 *
 * Queries ops.decision_log (Supabase project ghmd-sales-platform) newest-first
 * and renders decisions/DECISION_LOG.md in the same visual format as the
 * original Google Doc (## [date] header, decision, reasoning, status).
 *
 * The database is the source of record. The original Google Doc is a frozen
 * archive and is never edited. decisions/DECISION_LOG.md is a generated file —
 * do not edit it by hand; re-run `npm run log:export` instead.
 *
 * Requires (server-only, never committed):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service_role — RLS grants SELECT to service_role only)
 *
 * Usage: npm run log:export
 */

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const OUTPUT_PATH = resolve(process.cwd(), 'decisions', 'DECISION_LOG.md');

type DecisionRow = {
  id: number;
  decided_on: string;
  platform: string;
  title: string;
  decision: string;
  reasoning: string | null;
  status: string;
  legal_flag: boolean;
  superseded_by: number | null;
  source_session: string | null;
};

function fail(message: string): never {
  // No silent failures (CLAUDE.md rule 7).
  console.error(`[export-decision-log] ${message}`);
  process.exit(1);
}

function renderEntry(row: DecisionRow): string {
  const decision = (row.decision ?? '').trim();
  const reasoning = (row.reasoning ?? '').trim() || '—';

  const statusMeta: string[] = [row.status];
  if (row.legal_flag) statusMeta.push('⚖ Legal flag');
  if (row.superseded_by != null) statusMeta.push(`Superseded by entry #${row.superseded_by}`);
  if (row.source_session) statusMeta.push(`Source session: ${row.source_session}`);

  return [
    `## [${row.decided_on}] ${row.title}`,
    `**Decision:** ${decision}`,
    `**Reasoning:** ${reasoning}`,
    `**Status:** ${statusMeta.join('  ·  ')}`,
  ].join('\n\n');
}

function renderDocument(rows: DecisionRow[]): string {
  const preamble = [
    '# GHMD Sales Platform — Decision Log',
    '> **Git mirror — generated file. Do not edit by hand.**  ',
    '> Source of record: `ops.decision_log` (Supabase project `ghmd-sales-platform` / `cprltmwwldbxcsunsafl`).  ',
    '> Regenerate with `npm run log:export`. The original Google Doc is a frozen archive and is never edited.  ',
    '> Newest entries first.',
  ].join('\n');

  const body = rows.map(renderEntry).join('\n\n---\n\n');
  return `${preamble}\n\n---\n\n${body}\n`;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail('NEXT_PUBLIC_SUPABASE_URL is not set.');
  if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set.');

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'ops' },
  });

  const { data, error } = await supabase
    .from('decision_log')
    .select('id, decided_on, platform, title, decision, reasoning, status, legal_flag, superseded_by, source_session')
    .order('decided_on', { ascending: false })
    .order('id', { ascending: false });

  if (error) fail(`Query failed: ${error.message}`);
  if (!data || data.length === 0) fail('No rows returned from ops.decision_log.');

  const markdown = renderDocument(data as DecisionRow[]);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, markdown, 'utf8');

  console.log(`[export-decision-log] Wrote ${data.length} entries to ${OUTPUT_PATH}`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
