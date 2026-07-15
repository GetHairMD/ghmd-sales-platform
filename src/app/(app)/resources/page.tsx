import { createClient } from '@/lib/supabase/server'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import ResourcesView, { type ProspectOption } from './ResourcesView'
import {
  toResourceAsset,
  type ResourceAsset,
  type ResourceAssetRow,
} from '@/lib/resources/resources'

/**
 * Resource Library / Field Kit (E-3, spec §4C.3).
 *
 * NOT an exec-only route — a shared internal surface for BOTH designations (the nav item
 * has no execOnly flag). THE FETCH BELOW IS NOT THE SECURITY BOUNDARY — RLS IS. The
 * asset select runs as the AUTHENTICATED user, so resource_assets' SELECT policies decide
 * what returns per viewer: a rep sees active=true only; an executive sees every row.
 *
 * Ships empty this session (structure only) — every category renders a genuine empty
 * state. The prospect selector (rep share actions) is populated only for reps, and the
 * prospects RLS (rep_read_own) already narrows it to the rep's OWN assigned prospects, so
 * no explicit owner filter is needed here.
 */
export const dynamic = 'force-dynamic'

export default async function ResourcesPage() {
  const supabase = createClient()
  const designation = await getViewerDesignation()

  const { data: assetRows } = await supabase
    .from('resource_assets')
    .select('*')
    .order('created_at', { ascending: false })

  let prospects: ProspectOption[] = []
  if (designation === 'rep') {
    const { data: prospectRows } = await supabase
      .from('prospects')
      .select('id, full_name, practice_name')
      .eq('archived', false)
      .order('full_name')
    prospects = (prospectRows ?? []) as ProspectOption[]
  }

  const assets: ResourceAsset[] = ((assetRows ?? []) as ResourceAssetRow[]).map(toResourceAsset)

  return <ResourcesView designation={designation} assets={assets} prospects={prospects} />
}
