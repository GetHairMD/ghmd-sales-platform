/**
 * Block-group (GEOID) census cache — the durable, call-shape-agnostic cache behind the
 * v3 sizing data layer (CLAUDE.md Rule 5, realized at the block-group grain).
 *
 * WHY GEOID-keyed (not territory-keyed): within one sizing run the expansion search
 * evaluates several candidate drive-times, and the 15-min block-group set is a strict
 * subset of the 45-min set — identical per-block-group census data re-fetched every
 * candidate minute. Across runs, two practices in the same metro share most of their
 * block groups. A territories.census_raw_data cache (keyed to a territories row) helps
 * neither the intra-run repetition nor ad-hoc/no-territoryId calls. Keying the cache to
 * the census GEOID makes every block group fetched at most once per 90-day window,
 * regardless of which call (or how many) touches it.
 *
 * Storage lives in public.census_block_group_cache (service-role-only RLS). The pure
 * (de)serialization helpers are unit-testable; the read/write functions take an injected
 * Supabase client so they can be exercised with a fake in tests.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { CENSUS_CACHE_TTL_DAYS } from '../../lib/addressable-market-constants'
import type { BlockGroupRecord, BlockRecord } from './polygon-apportionment'
import type { Position } from './geometry'

export const CENSUS_BG_CACHE_TABLE = 'census_block_group_cache'

/** Chunk size for `.in()` reads and upserts (keeps URLs/statements well within limits). */
const CHUNK = 400

/** A cache row as stored (jsonb columns typed loosely; helpers coerce on the way out). */
export interface BlockGroupCacheRow {
  geoid: string
  state_fips: string
  centroid_lng: number | null
  centroid_lat: number | null
  b19001: Record<string, number>
  blocks: BlockRecord[]
  fetched_at?: string
}

/** A BlockGroupRecord plus its representative centroid, as returned from the live fetch. */
export interface BlockGroupWithCentroid extends BlockGroupRecord {
  centroid: Position | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure (de)serialization — unit-testable, no network.
// ─────────────────────────────────────────────────────────────────────────────

/** Cache row → BlockGroupRecord for the engine. Coerces jsonb into typed blocks. */
export function rowToBlockGroup(row: BlockGroupCacheRow): BlockGroupRecord {
  const blocks: BlockRecord[] = Array.isArray(row.blocks)
    ? row.blocks
        .map((b) => ({
          households: Math.max(0, Number((b as BlockRecord).households) || 0),
          point: (b as BlockRecord).point,
        }))
        .filter((b) => Array.isArray(b.point) && b.point.length === 2)
    : []
  return { geoid: row.geoid, stateFips: row.state_fips, b19001: row.b19001 ?? {}, blocks }
}

/** BlockGroupRecord (+ optional centroid) → cache row for upsert. */
export function blockGroupToRow(bg: BlockGroupWithCentroid): BlockGroupCacheRow {
  return {
    geoid: bg.geoid,
    state_fips: bg.stateFips,
    centroid_lng: bg.centroid ? bg.centroid[0] : null,
    centroid_lat: bg.centroid ? bg.centroid[1] : null,
    b19001: bg.b19001,
    blocks: bg.blocks,
  }
}

/** ISO cutoff before which a cache row is stale (now − CENSUS_CACHE_TTL_DAYS). */
export function freshnessCutoffIso(nowMs: number, ttlDays: number = CENSUS_CACHE_TTL_DAYS): string {
  return new Date(nowMs - ttlDays * 86_400_000).toISOString()
}

// ─────────────────────────────────────────────────────────────────────────────
// Read / write (injected Supabase client — service role).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the FRESH (≤ 90-day) cached block groups for `geoids`. Missing or stale GEOIDs are
 * simply absent from the returned map, so the caller fetches exactly the misses. Reads are
 * chunked; a chunk error is swallowed to a cache-miss (the cache is an optimization, never
 * a correctness dependency — a read failure just means we re-fetch).
 */
export async function readFreshBlockGroups(
  client: SupabaseClient,
  geoids: string[],
  nowMs: number = Date.now(),
): Promise<Map<string, BlockGroupRecord>> {
  const out = new Map<string, BlockGroupRecord>()
  const unique = Array.from(new Set(geoids.filter((g) => /^\d{12}$/.test(g))))
  const cutoff = freshnessCutoffIso(nowMs)

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    const { data, error } = await client
      .from(CENSUS_BG_CACHE_TABLE)
      .select('geoid, state_fips, centroid_lng, centroid_lat, b19001, blocks, fetched_at')
      .in('geoid', chunk)
      .gte('fetched_at', cutoff)
    if (error || !data) continue
    for (const row of data as BlockGroupCacheRow[]) {
      out.set(row.geoid, rowToBlockGroup(row))
    }
  }
  return out
}

/**
 * Upsert freshly fetched block groups into the cache (refreshing fetched_at). Best-effort:
 * a write failure is logged by the caller's timing but never fails the sizing run.
 */
export async function upsertBlockGroups(
  client: SupabaseClient,
  records: BlockGroupWithCentroid[],
): Promise<void> {
  const rows = records
    .filter((r) => /^\d{12}$/.test(r.geoid))
    .map((r) => ({ ...blockGroupToRow(r), fetched_at: new Date().toISOString(), updated_at: new Date().toISOString() }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    await client.from(CENSUS_BG_CACHE_TABLE).upsert(chunk, { onConflict: 'geoid' })
  }
}
