/**
 * Typed wrapper around the CMS NPI Registry public API (v2.1).
 * Source: https://npiregistry.cms.hhs.gov/api/
 *
 * Server-side only. The NPI Registry is a PUBLIC endpoint — no API key is
 * required and none is sent. Import this module only from server code (Route
 * handlers, server components, the scoring layer).
 *
 * Stateless by design: a plain function, no singleton and no cache. The
 * `npi_provider_cache` Supabase table is deferred to Sprint 2 hardening.
 */

const BASE_URL = 'https://npiregistry.cms.hhs.gov/api/'
const NPI_API_VERSION = '2.1'

/**
 * Taxonomy description used for the Sprint 1 physician-density signal.
 *
 * NOTE — hair-restoration physicians have no single NPPES taxonomy. Hair
 * transplant surgeons are board-certified **dermatologists** or **plastic
 * surgeons** (some also practice under cosmetic / general-surgery taxonomies).
 * For Sprint 1 we approximate with the single dominant taxonomy "Dermatology".
 * This will be refined into a multi-taxonomy set in a later sprint, alongside
 * the deferred `npi_provider_cache` table.
 */
export const NPI_TAXONOMY_HAIR = 'Dermatology'

/**
 * Raw NPI Registry response shape. Only the fields this scaffold consumes are
 * typed; individual provider records are left as `unknown` (no per-record
 * parsing is needed for a density count).
 */
export type NpiResult = {
  result_count: number
  results: unknown[]
}

/** Typed error for any NPI Registry API failure (HTTP status + message). */
export class NpiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(`NPI Registry API error (${status}): ${message}`)
    this.name = 'NpiError'
    this.status = status
  }
}

/**
 * Query the NPI Registry for providers in a state matching a taxonomy.
 *
 * @param state                Two-letter state abbreviation (e.g. "TX")
 * @param taxonomyDescription  NPPES taxonomy description (e.g. "Dermatology")
 * @param limit                Results per request; the API caps this at 200.
 * @returns Raw {@link NpiResult}; callers read `result_count`.
 * @throws NpiError on a non-200 response or a malformed body. Callers in the
 *   query layer catch this and degrade to 0 — NPI must never break scoring.
 */
export async function npiClient(
  state: string,
  taxonomyDescription: string,
  limit = 200,
): Promise<NpiResult> {
  const url = new URL(BASE_URL)
  url.searchParams.set('version', NPI_API_VERSION)
  url.searchParams.set('state', state)
  url.searchParams.set('taxonomy_description', taxonomyDescription)
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url.toString(), { cache: 'no-store' })

  if (!res.ok) {
    // NPI Registry returns a JSON or text error body on failure.
    const body = await res.text().catch(() => '')
    throw new NpiError(res.status, body.trim() || res.statusText)
  }

  const data = (await res.json()) as unknown
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as { result_count?: unknown }).result_count !== 'number' ||
    !Array.isArray((data as { results?: unknown }).results)
  ) {
    throw new NpiError(res.status, 'NPI Registry returned malformed data')
  }

  return data as NpiResult
}
