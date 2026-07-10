/**
 * Real-derived v3 QA-anchor freeze fixtures (decision #96; figures per decision #127).
 *
 * Distinct from v3-geo.ts, which holds ABSTRACT/synthetic geometry for unit tests. These
 * three fixtures are REAL: each carries the winning Mapbox drive-time isochrone that the
 * #127 sizing job produced, plus the census block groups (from public.census_block_group_cache)
 * that produced that job's addressable figure. They exist to make the §8.8 anchors a hard,
 * offline regression check on the addressable-arithmetic path.
 *
 * Provenance (source job id, source decision #127, freeze date, census integrity filter,
 * and the exact reproduction scope) lives in each JSON's `_provenance` block. Regenerate
 * only when the v3 methodology changes and the anchors are re-derived:
 *   npx tsx --env-file=.env.local scripts/freeze-qa-anchor-fixtures.ts
 *
 * SCOPE (read before trusting these): the frozen figure reproduces the addressable
 * computation at the LOCKED WINNING MINUTE. It does NOT reproduce the expansion /
 * minute-selection search (that needs every probed contour; the job persists only the
 * winning one). See src/lib/__tests__/v3-qa-anchors.regression.test.ts.
 */

import type { IsochroneContour } from '../isochrone'
import type { BlockGroupRecord } from '../polygon-apportionment'
import austinWestlake from './qa-anchors/austin-westlake.json'
import dallasPrestonHollow from './qa-anchors/dallas-preston-hollow.json'
import nashvilleGreenHills from './qa-anchors/nashville-green-hills.json'

export interface QaAnchorFixture {
  name: string
  slug: string
  stateFips: string
  center: { lat: number; lng: number }
  /** The locked winning drive-time (integer minutes). */
  minutes: number
  /** The value the frozen inputs reproduce EXACTLY (the regression lock). */
  expectedAddressable: number
  /** The decision #127 / §8.8 published figure (2 decimal places). */
  publishedAddressable: number
  /** The frozen winning Mapbox isochrone contour (real geometry). */
  winningContour: IsochroneContour
  /** The census block groups that reproduce the figure (real, from the Rule-5 cache). */
  blockGroups: BlockGroupRecord[]
}

// JSON imports don't structurally match the GeoJSON/tuple types (points widen to number[]),
// so cast at the boundary; the generator guarantees the shape and the exact reproduction.
export const V3_QA_ANCHORS: QaAnchorFixture[] = [
  austinWestlake,
  dallasPrestonHollow,
  nashvilleGreenHills,
] as unknown as QaAnchorFixture[]
