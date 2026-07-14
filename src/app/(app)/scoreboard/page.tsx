import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/ui/EmptyState'
import Scoreboard from '@/components/scoreboard/Scoreboard'
import {
  type ScoreboardSummaryRow,
  toScoreboardRow,
  rankRows,
} from '@/lib/scoreboard/scoreboard'

/**
 * Scoreboard (E-1) — the rep leaderboard, visible to ALL internal users (both
 * designations; the RPC gates on internal_users membership and returns aggregate
 * figures only). Data comes from scoreboard_summary(), a SECURITY DEFINER RPC that
 * returns one AGGREGATE row per rep — no individual prospect identity, no territory
 * geometry, no addressable/census, and (follow-up #2) no month-level detail: the
 * streak is a NUMBER computed in SQL. Only pipeline_value is derived here in TS
 * (active-pipeline count × the single-source $179K TERRITORY_STANDARD_PRICE, which SQL
 * cannot import).
 *
 * ZERO-REP EMPTY STATE (AC6): production currently has zero reps provisioned, so the
 * RPC returns zero rows and this page renders the EmptyState — exercised live, not
 * just asserted.
 */
export default async function ScoreboardPage() {
  const supabase = createClient()
  const { data } = await supabase.rpc('scoreboard_summary')
  const summaries = (data ?? []) as ScoreboardSummaryRow[]

  // Every figure (incl. current_streak) is already aggregated by the RPC; the page only
  // derives pipeline_value (× the single-source price) inside toScoreboardRow and ranks.
  const rows = rankRows(summaries.map((s) => toScoreboardRow(s)))

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text">Scoreboard</h1>
        <p className="mt-1 text-sm text-text-muted">
          Team leaderboard — deals closed, pipeline value, proposal engagement, and close streaks.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No reps on the board yet"
          description="Once reps are provisioned and start closing deals, the leaderboard fills in here."
        />
      ) : (
        <Scoreboard rows={rows} />
      )}
    </main>
  )
}
