import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPhysicianCountByCounty } from '../queries'
import { NPI_TAXONOMY_HAIR } from '../client'

// ---------------------------------------------------------------------------
// getPhysicianCountByCounty — NPI Registry HTTP fully mocked (no live API).
// ---------------------------------------------------------------------------
describe('getPhysicianCountByCounty (mocked HTTP)', () => {
  beforeEach(() => {
    // Silence the resilience-path error logs; assertions cover behavior, not noise.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Stub the global fetch with an NPI-shaped JSON body (or a raw string). */
  function stubNpi(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () => {
      const payload = typeof body === 'string' ? body : JSON.stringify(body)
      return new Response(payload, { status })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('returns the result_count for a valid FIPS and queries the right state/taxonomy', async () => {
    const fetchMock = stubNpi({ result_count: 42, results: new Array(42).fill({}) })

    // 48 → TX
    const count = await getPhysicianCountByCounty('48453')
    expect(count).toBe(42)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL((fetchMock.mock.calls[0][0] as string | URL).toString())
    expect(url.searchParams.get('state')).toBe('TX')
    expect(url.searchParams.get('taxonomy_description')).toBe(NPI_TAXONOMY_HAIR)
    expect(url.searchParams.get('limit')).toBe('200')
    expect(url.searchParams.get('version')).toBe('2.1')
  })

  it('returns 0 on an HTTP error response (does not throw)', async () => {
    stubNpi('upstream unavailable', 500)
    await expect(getPhysicianCountByCounty('48453')).resolves.toBe(0)
  })

  it('returns 0 for an unmapped state FIPS without making a request', async () => {
    const fetchMock = stubNpi({ result_count: 999, results: [] })

    // 03 is not an assigned state FIPS code.
    const count = await getPhysicianCountByCounty('03001')
    expect(count).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 0 for a malformed FIPS without making a request', async () => {
    const fetchMock = stubNpi({ result_count: 5, results: [] })

    expect(await getPhysicianCountByCounty('4845')).toBe(0) // too short
    expect(await getPhysicianCountByCounty('abcde')).toBe(0) // non-numeric
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 0 when the API response shape is malformed (parse failure)', async () => {
    stubNpi({ unexpected: true }) // missing result_count / results
    await expect(getPhysicianCountByCounty('48453')).resolves.toBe(0)
  })

  it('handles the API 200-result cap (passes the capped count through)', async () => {
    const fetchMock = stubNpi({ result_count: 200, results: new Array(200).fill({}) })

    const count = await getPhysicianCountByCounty('06037') // 06 → CA
    expect(count).toBe(200)
    const url = new URL((fetchMock.mock.calls[0][0] as string | URL).toString())
    expect(url.searchParams.get('limit')).toBe('200')
  })
})
