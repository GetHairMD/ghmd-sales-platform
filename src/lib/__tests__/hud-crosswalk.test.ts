import { describe, expect, it } from 'vitest'
import {
  loadHudCrosswalk,
  assertCrosswalkPopulated,
  zctasForCounty,
  zctasForZips,
  type HudCrosswalkRow,
} from '../hud-crosswalk'

const FIXTURE_ROWS: HudCrosswalkRow[] = [
  { zip: '94901', zcta: '94901', county_fips: '06041', res_ratio: 1 },   // San Rafael, Marin
  { zip: '94903', zcta: '94903', county_fips: '06041', res_ratio: 1 },   // Marin
  { zip: '94957', zcta: '94957', county_fips: '06041', res_ratio: 1 },   // Ross, Marin
  { zip: '94112', zcta: '94112', county_fips: '06075', res_ratio: 1 },   // San Francisco
]

describe('loadHudCrosswalk', () => {
  it('parses a well-formed file', () => {
    const file = loadHudCrosswalk({ provenance: {}, manual_download_required: false, rows: FIXTURE_ROWS })
    expect(file.rows).toHaveLength(4)
  })

  it('throws on a malformed file', () => {
    expect(() => loadHudCrosswalk(null)).toThrow(/malformed/)
    expect(() => loadHudCrosswalk({ rows: 'nope' })).toThrow(/malformed/)
  })
})

describe('assertCrosswalkPopulated', () => {
  it('throws when the manual download flag is still set', () => {
    expect(() =>
      assertCrosswalkPopulated({ provenance: {} as any, manual_download_required: true, rows: FIXTURE_ROWS }),
    ).toThrow(/not populated/)
  })

  it('throws when rows are empty (placeholder file)', () => {
    expect(() =>
      assertCrosswalkPopulated({ provenance: {} as any, manual_download_required: false, rows: [] }),
    ).toThrow(/not populated/)
  })

  it('passes for a populated file', () => {
    expect(() =>
      assertCrosswalkPopulated({ provenance: {} as any, manual_download_required: false, rows: FIXTURE_ROWS }),
    ).not.toThrow()
  })
})

describe('geography joins (join-only, no weighting)', () => {
  it('returns unique sorted ZCTAs for a county', () => {
    expect(zctasForCounty(FIXTURE_ROWS, '06041')).toEqual(['94901', '94903', '94957'])
    expect(zctasForCounty(FIXTURE_ROWS, '06075')).toEqual(['94112'])
    expect(zctasForCounty(FIXTURE_ROWS, '99999')).toEqual([])
  })

  it('returns unique sorted ZCTAs for a set of ZIPs', () => {
    expect(zctasForZips(FIXTURE_ROWS, ['94901', '94957'])).toEqual(['94901', '94957'])
    expect(zctasForZips(FIXTURE_ROWS, ['00000'])).toEqual([])
  })
})
