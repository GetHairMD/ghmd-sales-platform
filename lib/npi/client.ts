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
 * Target NPPES taxonomy CODES for the hair-restoration physician-density signal.
 *
 * Refines the single-description Sprint 1 approximation ({@link NPI_TAXONOMY_HAIR})
 * into the full set of surgical + aesthetic specialties relevant to hair
 * restoration. These are NPPES *codes* (10-char), distinct from the
 * *description* string the count query still sends — see the note on
 * {@link filterProvidersByTargetTaxonomy} for how the two relate.
 *
 * A provider is in-scope if ANY of its taxonomies matches a code in this set.
 */
export const TARGET_TAXONOMIES = [
  '208200000X', // Plastic Surgery
  '207XS0114X', // Plastic Surgery — Surgery of the Hand
  '207YS0123X', // Otolaryngology — Facial Plastic Surgery
  '207ND0900X', // Dermatology
  '207N00000X', // Dermatology (general)
  '204D00000X', // Neuromusculoskeletal Medicine
] as const

/**
 * NPPES taxonomy codes explicitly EXCLUDED from the hair-restoration signal.
 *
 * Cardiovascular Disease is not relevant to hair restoration; it is enumerated
 * here (rather than merely absent from {@link TARGET_TAXONOMIES}) so the filter
 * can flag it if a provider record carries it — see
 * {@link filterProvidersByTargetTaxonomy}.
 */
export const EXCLUDED_TAXONOMIES = [
  '207RC0000X', // Cardiovascular Disease — explicitly excluded
] as const

/** Fast-membership sets derived from the exported code arrays. */
const TARGET_TAXONOMY_SET: ReadonlySet<string> = new Set(TARGET_TAXONOMIES)
const EXCLUDED_TAXONOMY_SET: ReadonlySet<string> = new Set(EXCLUDED_TAXONOMIES)

/** Minimal NPPES taxonomy entry — only the fields the code filter reads. */
export type NpiTaxonomy = {
  code: string
  desc?: string
  primary?: boolean
}

/** Minimal NPPES provider record consumed by {@link filterProvidersByTargetTaxonomy}. */
export type NpiProviderRecord = {
  number?: string
  taxonomies?: NpiTaxonomy[]
}

/**
 * Filter NPI provider records to those matching a {@link TARGET_TAXONOMIES} code.
 *
 * A provider is kept if ANY of its taxonomies has a code in TARGET_TAXONOMIES.
 * Records with no taxonomies (or none matching) are dropped. When a provider
 * carries an {@link EXCLUDED_TAXONOMIES} code it is flagged via a console log
 * ("flag if present") — it can still be kept if it ALSO holds a target code,
 * since multi-specialty providers are common.
 *
 * Why a separate code filter? The Sprint 1 density count
 * ({@link npiClient} via the query layer) filters server-side by taxonomy
 * *description* and reads `result_count`; it cannot express a multi-code set.
 * This client-side filter is the canonical TARGET_TAXONOMIES consumer for any
 * flow that holds the actual provider records (e.g. the npi_provider_cache
 * enrichment path).
 */
export function filterProvidersByTargetTaxonomy<T extends NpiProviderRecord>(
  providers: T[],
): T[] {
  return providers.filter((provider) => {
    const taxonomies = provider.taxonomies ?? []

    for (const taxonomy of taxonomies) {
      if (EXCLUDED_TAXONOMY_SET.has(taxonomy.code)) {
        console.warn(
          `[npi] provider ${provider.number ?? '(unknown)'} carries excluded taxonomy ${taxonomy.code}`,
        )
      }
    }

    return taxonomies.some((taxonomy) => TARGET_TAXONOMY_SET.has(taxonomy.code))
  })
}

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
