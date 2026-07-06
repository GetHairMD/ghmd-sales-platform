import { describe, expect, it } from 'vitest'
import {
  bboxToEnvelope,
  splitBlockGroupGeoid,
  parseCensusTable,
  b19001HistogramFromRow,
  centroidOfArcgisFeature,
  CensusTigerError,
} from '../census-tiger'
import { B19001_TOTAL_HH_VAR } from '../../../lib/addressable-market-constants'

describe('bboxToEnvelope', () => {
  it('joins a bbox into an ArcGIS envelope string', () => {
    expect(bboxToEnvelope([-98, 30, -97, 31])).toBe('-98,30,-97,31')
  })
})

describe('splitBlockGroupGeoid', () => {
  it('splits a 12-digit GEOID into census parts', () => {
    expect(splitBlockGroupGeoid('480530011001')).toEqual({
      stateFips: '48',
      countyFips: '053',
      tract: '001100',
      blockGroup: '1',
    })
  })
  it('rejects malformed GEOIDs', () => {
    expect(() => splitBlockGroupGeoid('4805300110')).toThrow(CensusTigerError)
    expect(() => splitBlockGroupGeoid('abcdefghijkl')).toThrow(CensusTigerError)
  })
})

describe('parseCensusTable', () => {
  it('maps header row onto data rows', () => {
    const rows = [
      ['B19001_001E', 'state', 'county'],
      ['1234', '48', '053'],
      ['5678', '48', '055'],
    ]
    const parsed = parseCensusTable(rows)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ B19001_001E: '1234', state: '48', county: '053' })
  })
  it('throws on malformed input', () => {
    expect(() => parseCensusTable(null)).toThrow(CensusTigerError)
    expect(() => parseCensusTable([])).toThrow(CensusTigerError)
  })
})

describe('b19001HistogramFromRow', () => {
  it('coerces the B19001 fetch vars to non-negative integers', () => {
    const row = { [B19001_TOTAL_HH_VAR]: '2000', B19001_017E: '150', B19001_002E: '-666666666' }
    const hist = b19001HistogramFromRow(row)
    expect(hist[B19001_TOTAL_HH_VAR]).toBe(2000)
    expect(hist.B19001_017E).toBe(150)
    expect(hist.B19001_002E).toBe(0) // census jam value → 0
  })
})

describe('centroidOfArcgisFeature', () => {
  it('prefers CENTLON/CENTLAT attributes', () => {
    expect(centroidOfArcgisFeature({ attributes: { CENTLON: '-97.5', CENTLAT: '30.2' } })).toEqual([
      -97.5, 30.2,
    ])
  })
  it('falls back to averaging the outer ring', () => {
    const point = centroidOfArcgisFeature({
      geometry: { rings: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] },
    })
    expect(point).not.toBeNull()
    expect(point![0]).toBeCloseTo(1.6, 6) // (0+4+4+0+0)/5
    expect(point![1]).toBeCloseTo(1.6, 6)
  })
  it('returns null when neither is available', () => {
    expect(centroidOfArcgisFeature({ attributes: {} })).toBeNull()
  })
})
