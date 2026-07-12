/**
 * Global TopBar search helpers. Pure string handling only — the actual Supabase
 * query runs client-side under the signed-in role's existing RLS (reps see their
 * own prospects, execs see all; territories are internal_users-wide). Nothing here
 * widens access; it only shapes the term.
 */

/** Trim and reject terms too short to be worth a table scan. Returns null to skip. */
export function normalizeSearchTerm(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length < 2) return null
  return trimmed
}

/** Escape Postgres ilike metacharacters so user-typed % _ \ match literally. */
export function escapeIlike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Build a `%term%` contains-pattern with metacharacters escaped. */
export function ilikeContains(term: string): string {
  return `%${escapeIlike(term)}%`
}
