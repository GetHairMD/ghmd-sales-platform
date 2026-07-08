import { describe, it, expect } from 'vitest'
import {
  resolveTerritoryDisplayKind,
  addressableFloorStatus,
  parseSizingJobResult,
  resolveProspectTerritory,
} from '../territories/v3-display'
import { V3_MIN_ADDRESSABLE_FLOOR } from '../../../lib/addressable-market-constants'

describe('resolveTerritoryDisplayKind', () => {
  it('is V2_LEGACY for a formula_version=2 territory with a number (AC7: v2 unchanged)', () => {
    expect(
      resolveTerritoryDisplayKind({
        formula_version: 2,
        boundary_geojson: null,
        addressable_patients_primary: 5483,
      }),
    ).toBe('V2_LEGACY')
  })

  it('is V2_LEGACY even while a v3 job is in flight (rep view uninterrupted — number still exists)', () => {
    // The kind depends only on the persisted number/boundary, never on job state.
    expect(
      resolveTerritoryDisplayKind({
        formula_version: 2,
        boundary_geojson: null,
        addressable_patients_primary: 5483,
      }),
    ).toBe('V2_LEGACY')
  })

  it('is APPROVED_V3 only when formula_version=3 AND a boundary is saved', () => {
    expect(
      resolveTerritoryDisplayKind({
        formula_version: 3,
        boundary_geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } },
        addressable_patients_primary: 60000,
      }),
    ).toBe('APPROVED_V3')
  })

  it('is not APPROVED_V3 when formula_version=3 but the boundary is missing', () => {
    // Falls back to the number-driven display; never claims "approved" without a boundary.
    expect(
      resolveTerritoryDisplayKind({
        formula_version: 3,
        boundary_geojson: null,
        addressable_patients_primary: 60000,
      }),
    ).toBe('V2_LEGACY')
  })

  it('is PENDING_REVIEW only when there is no number and no approved boundary', () => {
    expect(
      resolveTerritoryDisplayKind({
        formula_version: 2,
        boundary_geojson: null,
        addressable_patients_primary: null,
      }),
    ).toBe('PENDING_REVIEW')
  })
})

describe('addressableFloorStatus', () => {
  it('clears the 18,600 floor when at or above it', () => {
    const s = addressableFloorStatus(59_699)
    expect(s.floor).toBe(V3_MIN_ADDRESSABLE_FLOOR)
    expect(s.clears).toBe(true)
    expect(s.delta).toBe(59_699 - V3_MIN_ADDRESSABLE_FLOOR)
  })

  it('does not clear the floor when below it', () => {
    const s = addressableFloorStatus(10_000)
    expect(s.clears).toBe(false)
    expect(s.delta).toBe(10_000 - V3_MIN_ADDRESSABLE_FLOOR)
  })

  it('clamps and rounds the addressable value', () => {
    expect(addressableFloorStatus(-5).addressable).toBe(0)
    expect(addressableFloorStatus(18_600.6).addressable).toBe(18_601)
  })
})

describe('parseSizingJobResult', () => {
  const viableRaw = {
    result: {
      status: 'VIABLE',
      minutes: 12,
      addressable: 59_699,
      probes: [{ minutes: 15, addressable: 59_699 }],
    },
    sizedContour: {
      minutes: 12,
      polygon: { type: 'Feature', properties: { contour: 12 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] } },
    },
    provenance: { engine: 'v3-drive-time' },
  }

  it('reads a VIABLE result: addressable, minutes, and boundary feature', () => {
    const p = parseSizingJobResult(viableRaw)
    expect(p).not.toBeNull()
    expect(p!.status).toBe('VIABLE')
    expect(p!.addressable).toBe(59_699)
    expect(p!.minutes).toBe(12)
    expect(p!.boundaryFeature).toEqual(viableRaw.sizedContour.polygon)
  })

  it('reads an UNRESOLVED result: best addressable, no minutes, no boundary (AC6)', () => {
    const p = parseSizingJobResult({
      result: {
        status: 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING',
        bestMinutes: 45,
        bestAddressable: 9_000,
        probes: [],
      },
      sizedContour: null,
      provenance: {},
    })
    expect(p!.status).toBe('UNRESOLVED_BELOW_THRESHOLD_AT_CEILING')
    expect(p!.addressable).toBe(9_000)
    expect(p!.minutes).toBeNull()
    expect(p!.boundaryFeature).toBeNull()
  })

  it('returns null for a malformed / empty result', () => {
    expect(parseSizingJobResult(null)).toBeNull()
    expect(parseSizingJobResult({})).toBeNull()
    expect(parseSizingJobResult({ result: { status: 'NONSENSE' } })).toBeNull()
  })
})

describe('resolveProspectTerritory (§D — deals.territory_id authoritative, reserved_for dead)', () => {
  it('uses the most-recent deal territory when reserved_for is unset', () => {
    const r = resolveProspectTerritory({
      reservedForTerritoryId: null,
      latestDealTerritoryId: 'deal-terr',
    })
    expect(r.territoryId).toBe('deal-terr')
    expect(r.source).toBe('deal')
    expect(r.disagree).toBe(false)
  })

  it('flags a disagreement when reserved_for is set and differs from the deal link (AC8)', () => {
    const r = resolveProspectTerritory({
      reservedForTerritoryId: 'terr-A',
      latestDealTerritoryId: 'terr-B',
    })
    expect(r.disagree).toBe(true)
  })

  it('returns no territory when neither link is present', () => {
    const r = resolveProspectTerritory({ reservedForTerritoryId: null, latestDealTerritoryId: null })
    expect(r.territoryId).toBeNull()
    expect(r.source).toBeNull()
    expect(r.disagree).toBe(false)
  })
})
