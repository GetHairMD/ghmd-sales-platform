import { createClient } from '@/lib/supabase/server'
import KanbanBoard from './KanbanBoard'

export default async function PipelinePage() {
  const supabase = createClient()
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, full_name, email, stage')
    .eq('archived', false)
    .order('stage_updated_at', { ascending: false })

  if (error) {
    return (
      <main className="p-8">
        <p className="text-red-600">Error loading pipeline: {error.message}</p>
      </main>
    )
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Pipeline</h1>
      <KanbanBoard initialProspects={prospects ?? []} />
    </main>
  )
}
