import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        GHMD Sales Platform
      </h1>
      <p className="text-lg text-gray-600">
        {error
          ? `DB error: ${error.message}`
          : `Prospects in pipeline: ${count ?? 0}`}
      </p>
    </main>
  )
}
