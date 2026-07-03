import { describe, expect, it } from 'vitest'
import { addressableHouseholds } from '../addressable'

describe('addressableHouseholds (corrected v2 — households × income × credit, no prevalence)', () => {
  it('multiplies the three factors', () => {
    expect(addressableHouseholds(10_000, 0.5, 0.7)).toBeCloseTo(3_500, 6)
  })

  it('reconciles the Marin ground-truth row @PTI8 (64,194)', () => {
    // data/sources/ghmd_county_analysis_PTI8.csv — Marin County, CA
    const v = addressableHouseholds(103_018, 0.8688, 0.7172)
    expect(Math.round(v)).toBe(64_191) // 64,194 file value differs by ~3 (component rounding)
    expect(Math.abs(v - 64_194)).toBeLessThan(5)
  })

  it('reconciles the Marin ground-truth row @PTI5 (57,826)', () => {
    const v = addressableHouseholds(103_018, 0.7826, 0.7172)
    expect(Math.abs(v - 57_826)).toBeLessThan(5)
  })

  it('clamps negative households to 0', () => {
    expect(addressableHouseholds(-100, 0.5, 0.7)).toBe(0)
  })

  it('is zero when any screen is zero', () => {
    expect(addressableHouseholds(10_000, 0, 0.7)).toBe(0)
    expect(addressableHouseholds(10_000, 0.5, 0)).toBe(0)
  })
})
