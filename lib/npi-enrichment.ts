/**
 * NPI Registry API enrichment helpers.
 * Source: https://npiregistry.cms.hhs.gov/api/
 *
 * TODO: Sprint 4 — wire to spoke_candidates enrichment flow
 */

export interface NpiResult {
  npi: string
  providerType: 'individual' | 'organization'
  credential: string | null
  firstName: string | null
  lastName: string | null
  organizationName: string | null
  practiceAddress: {
    line1: string
    city: string
    state: string
    zip: string
  } | null
}

interface NpiApiProvider {
  number: string
  enumeration_type: 'NPI-1' | 'NPI-2'
  basic?: {
    credential?: string
    first_name?: string
    last_name?: string
    organization_name?: string
  }
  addresses?: Array<{
    address_purpose: string
    address_1: string
    city: string
    state: string
    postal_code: string
  }>
}

interface NpiApiResponse {
  result_count: number
  results: NpiApiProvider[]
}

/**
 * Fetch NPI record(s) by provider name and state from the CMS NPI Registry.
 * Returns the first matching result, or null if no match found.
 *
 * @param name  Full or partial provider name (searched across first + last for individuals)
 * @param state Two-letter state abbreviation (e.g. "TX")
 */
export async function fetchNpiByName(name: string, state: string): Promise<NpiResult | null> {
  const url = new URL('https://npiregistry.cms.hhs.gov/api/')
  url.searchParams.set('version', '2.1')
  url.searchParams.set('state', state)
  url.searchParams.set('limit', '5')

  // Try as organization name first, then as individual name
  const nameParts = name.trim().split(/\s+/)
  if (nameParts.length >= 2) {
    url.searchParams.set('first_name', nameParts[0])
    url.searchParams.set('last_name', nameParts.slice(1).join(' '))
  } else {
    url.searchParams.set('organization_name', name)
  }

  // NPPES is a public US provider registry; results identify the provider
  // (physician/organization), never a patient.
  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`NPI Registry error: ${res.status}`)

  const data: NpiApiResponse = await res.json()
  if (!data.result_count || !data.results.length) return null

  const provider = data.results[0]
  const practiceAddr = provider.addresses?.find(a => a.address_purpose === 'LOCATION') ?? provider.addresses?.[0] ?? null

  return {
    npi: provider.number,
    providerType: provider.enumeration_type === 'NPI-1' ? 'individual' : 'organization',
    credential: provider.basic?.credential ?? null,
    firstName: provider.basic?.first_name ?? null,
    lastName: provider.basic?.last_name ?? null,
    organizationName: provider.basic?.organization_name ?? null,
    practiceAddress: practiceAddr
      ? {
          line1: practiceAddr.address_1,
          city: practiceAddr.city,
          state: practiceAddr.state,
          zip: practiceAddr.postal_code,
        }
      : null,
  }
}
