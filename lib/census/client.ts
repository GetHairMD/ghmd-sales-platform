/**
 * Typed wrapper around the U.S. Census Bureau API (ACS 5-Year estimates).
 *
 * Server-side only. The CENSUS_API_KEY env var is read at call time and is
 * never bundled to the client nor logged. Import this module only from server
 * code (Edge/Route handlers, server components, scoring layer).
 */

// Pin the ACS 5-Year vintage. 2022 is the stable fallback release; bump
// deliberately when a newer vintage is validated against QA anchors.
export const CENSUS_YEAR = 2022

const BASE_URL = 'https://api.census.gov/data'
const DATASET = 'acs/acs5'

/** County geography split from a 5-digit FIPS code. */
export type CountyGeography = {
  state: string // 2-digit state FIPS
  county: string // 3-digit county FIPS
}

/**
 * Typed error for any Census API failure. Surfaces the HTTP status and the
 * raw message body returned by Census (often a plain-text error string).
 */
export class CensusError extends Error {
  readonly status: number
  readonly censusMessage: string

  constructor(status: number, censusMessage: string) {
    super(`Census API error (${status}): ${censusMessage}`)
    this.name = 'CensusError'
    this.status = status
    this.censusMessage = censusMessage
  }
}

class CensusClient {
  /**
   * Fetch one or more ACS variables for a single county geography.
   * Returns a variable-code → raw-string-value map for the single result row
   * (Census returns all values as strings; parsing is the caller's concern).
   *
   * @throws CensusError on missing key, non-200 response, or empty/malformed data.
   */
  async fetchCounty(
    variables: string[],
    geo: CountyGeography,
  ): Promise<Record<string, string>> {
    const apiKey = process.env.CENSUS_API_KEY
    if (!apiKey) {
      throw new CensusError(0, 'CENSUS_API_KEY is not set in the server environment')
    }

    const url = new URL(`${BASE_URL}/${CENSUS_YEAR}/${DATASET}`)
    url.searchParams.set('get', variables.join(','))
    url.searchParams.set('for', `county:${geo.county}`)
    url.searchParams.set('in', `state:${geo.state}`)
    url.searchParams.set('key', apiKey)

    const res = await fetch(url.toString(), { cache: 'no-store' })

    if (!res.ok) {
      // Census returns a plain-text body on error (e.g. "error: unknown variable").
      const body = await res.text().catch(() => '')
      throw new CensusError(res.status, body.trim() || res.statusText)
    }

    // ACS responses are [ [header...], [value...] ] for a single geography.
    const rows = (await res.json()) as unknown
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new CensusError(res.status, 'Census returned empty or malformed data')
    }

    const headers = rows[0] as string[]
    const values = rows[1] as string[]
    const out: Record<string, string> = {}
    headers.forEach((h, i) => {
      out[h] = values[i]
    })
    return out
  }
}

/** Singleton Census client. */
export const censusClient = new CensusClient()
