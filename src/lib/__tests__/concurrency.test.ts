import { describe, expect, it } from 'vitest'
import { mapPool } from '../concurrency'

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

describe('mapPool', () => {
  it('preserves input order regardless of completion order', async () => {
    // Later items resolve sooner — output must still be in input order.
    const out = await mapPool([0, 1, 2, 3, 4], 2, async (n) => {
      await tick((5 - n) * 3)
      return n * 10
    })
    expect(out).toEqual([0, 10, 20, 30, 40])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    await mapPool(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await tick(4)
      active--
    })
    expect(maxActive).toBeLessThanOrEqual(3)
    expect(maxActive).toBe(3) // enough work to actually saturate the pool
  })

  it('returns [] for empty input and runs nothing', async () => {
    let calls = 0
    const out = await mapPool([], 4, async () => calls++)
    expect(out).toEqual([])
    expect(calls).toBe(0)
  })

  it('coerces a nonsensical limit to at least 1', async () => {
    const out = await mapPool([1, 2, 3], 0, async (n) => n)
    expect(out).toEqual([1, 2, 3])
  })

  it('rejects with the first error', async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      }),
    ).rejects.toThrow('boom')
  })
})
