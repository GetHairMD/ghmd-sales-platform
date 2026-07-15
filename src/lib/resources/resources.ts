/**
 * Resource Library — "Field Kit" (E-3) — pure domain constants + row logic.
 *
 * Single source of truth for the six collateral categories and the asset-type enum.
 * Everything here is pure: no Supabase client, no fetching, no React. The security
 * boundary is RLS (see migrations 20260714240000 / 250000 / 260000) — this module
 * NEVER decides who may read or write anything. It only names the vocabulary the UI,
 * the server actions, and the DB CHECK constraints all agree on.
 *
 * The category and asset-type arrays MUST stay in lock-step with the DB CHECK
 * constraints in migration 20260714240000_e3_resource_assets.sql — a Vitest test
 * (`resources.test.ts`) reads that migration and asserts the two agree, the same way
 * the community-board and proposal-events enums are pinned.
 */

/**
 * The six Field Kit categories (spec §4C.3). Mirrors the DB CHECK on
 * resource_assets.category. `objection_playbook` ships this session as an empty
 * category slot only — its content (E-6, seeded from the proposal FAQ) is a
 * separate brief.
 */
export const RESOURCE_CATEGORIES = [
  'decks',
  'testimonial_videos',
  'case_studies',
  'clinical_evidence',
  'business_opportunity',
  'objection_playbook',
] as const
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]

/**
 * Allowed values for resource_assets.asset_type. Mirrors the DB CHECK constraint.
 * `wistia_video` carries a wistia_id rather than an external_url; the other three
 * carry an external_url. (Wistia play tracking is explicitly out of scope for E-3 —
 * this session tracks link_opened only.)
 */
export const RESOURCE_ASSET_TYPES = ['pdf', 'wistia_video', 'link', 'doc'] as const
export type ResourceAssetType = (typeof RESOURCE_ASSET_TYPES)[number]

/** Display order for the /resources grid — matches the spec §4C.3 listing. */
export const RESOURCE_CATEGORY_ORDER: readonly ResourceCategory[] = RESOURCE_CATEGORIES

export const RESOURCE_CATEGORY_LABEL: Record<ResourceCategory, string> = {
  decks: 'Decks',
  testimonial_videos: 'Testimonial Videos',
  case_studies: 'Case Studies',
  clinical_evidence: 'Clinical Evidence',
  business_opportunity: 'Business Opportunity',
  objection_playbook: 'Objection Playbook',
}

/** One-line description shown on each category's empty state. */
export const RESOURCE_CATEGORY_DESCRIPTION: Record<ResourceCategory, string> = {
  decks: 'Approved pitch and overview decks. Nothing published yet.',
  testimonial_videos: 'Patient and provider testimonial videos. Nothing published yet.',
  case_studies: 'Clinic and outcome case studies. Nothing published yet.',
  clinical_evidence: 'Clinical and medical evidence. Nothing published yet.',
  business_opportunity: 'Business-opportunity materials for prospective owners. Nothing published yet.',
  objection_playbook: 'Objection-handling guidance. Nothing published yet.',
}

export function isResourceCategory(v: unknown): v is ResourceCategory {
  return typeof v === 'string' && (RESOURCE_CATEGORIES as readonly string[]).includes(v)
}

export function isResourceAssetType(v: unknown): v is ResourceAssetType {
  return typeof v === 'string' && (RESOURCE_ASSET_TYPES as readonly string[]).includes(v)
}

/** The raw resource_assets row shape as PostgREST returns it. */
export interface ResourceAssetRow {
  id: string
  category: string
  title: string
  description: string | null
  asset_type: string
  external_url: string | null
  wistia_id: string | null
  version: string | null
  approved_date: string | null
  approved_by: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ResourceAsset {
  id: string
  category: ResourceCategory
  title: string
  description: string | null
  assetType: ResourceAssetType
  externalUrl: string | null
  wistiaId: string | null
  version: string | null
  approvedDate: string | null
  active: boolean
}

export function toResourceAsset(row: ResourceAssetRow): ResourceAsset {
  return {
    id: row.id,
    // The DB CHECK constrains both columns, so an out-of-range value is impossible; the
    // fallbacks exist so a hypothetical bad row degrades instead of crashing the grid.
    category: isResourceCategory(row.category) ? row.category : 'decks',
    title: row.title,
    description: row.description,
    assetType: isResourceAssetType(row.asset_type) ? row.asset_type : 'link',
    externalUrl: row.external_url,
    wistiaId: row.wistia_id,
    version: row.version,
    approvedDate: row.approved_date,
    active: row.active,
  }
}

/** Group active assets by category, preserving category display order. */
export function groupByCategory(
  assets: readonly ResourceAsset[],
): Record<ResourceCategory, ResourceAsset[]> {
  const out = {} as Record<ResourceCategory, ResourceAsset[]>
  for (const category of RESOURCE_CATEGORIES) out[category] = []
  for (const asset of assets) out[asset.category].push(asset)
  return out
}
