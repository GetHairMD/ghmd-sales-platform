import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/ui/EmptyState'
import Scoreboard from '@/components/scoreboard/Scoreboard'
import {
  type ScoreboardSummaryRow,
  toScoreboardRow,
  rankRows,
  currentMonthKey,
} from '@/lib/scoreboard/scoreboard'

/**
 * Scoreboard (E-1) — the rep leaderboard, visible to ALL internal users (both
 * designations; the RPC gates on internal_users membership and returns aggregate
 * figures only). Data comes from scoreboard_summary(), a SECURITY DEFINER RPC that
 * returns one AGGREGATE row per rep — no individual prospect identity, no territory
 * geometry, no addressable/census. The money figure (pipeline value) and the streak
 * are derived here in TS via the pure scoreboard lib, keeping the $179K price
 * single-sourced (TERRITORY_STANDARD_PRICE) and the calendar logic unit-tested.
 *
 * ZERO-REP EMPTY STATE (AC6): production currently has zero reps provisioned, so the
 * RPC returns zero rows and this page renders the EmptyState — exercised live, not
 * just asserted.
 */
export default async function ScoreboardPage() {
  const supabase = createClient()
  const { data } = await supabase.rpc('scoreboard_summary')
  const summaries = (data ?? []) as ScoreboardSummaryRow[]

  // Reference month resolved once server-side so every row's streak walks back from
  // the same "current month" (UTC, matching the RPC's close-month bucketing) — no
  // cross-row skew if the request straddles a month boundary.
  const referenceMonth = currentMonthKey()
  const rows = rankRows(summaries.map((s) => toScoreboardRow(s, referenceMonth)))

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
