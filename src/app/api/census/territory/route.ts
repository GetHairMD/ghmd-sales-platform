import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeTerritorySignals } from '../../../../../lib/census/territory-score'
import { CensusError } from '../../../../../lib/census/client'

// Reads cookies + env and hits the Census API — never static.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIPS_PATTERN = /^\d{5}$/

/**
 * GET /api/census/territory?fips=XXXXX
 * Returns TerritorySignals for a 5-digit county FIPS. Auth-gated via the
 * existing Supabase session (same mechanism as middleware — no new auth).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth gate — reuse the Supabase server session.
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validate the fips query param: exactly 5 numeric digits.
  const fips = request.nextUrl.searchParams.get('fips')
  if (!fips || !FIPS_PATTERN.test(fips)) {
    return NextResponse.json(
      { error: 'Invalid fips parameter: expected exactly 5 numeric digits' },
      { status: 400 },
    )
  }

  try {
    const signals = await computeTerritorySignals(fips)
    return NextResponse.json(signals)
  } catch (err) {
    if (err instanceof CensusError) {
      // Surface upstream Census failures as a Bad Gateway with the detail.
      return NextResponse.json(
        { error: 'Census API error', detail: err.censusMessage, status: err.status },
        { status: 502 },
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to compute territory signals', detail: message }, { status: 500 })
  }
}
