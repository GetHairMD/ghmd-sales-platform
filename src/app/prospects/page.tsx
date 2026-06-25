import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function ProspectsPage() {
  const supabase = createClient()
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, full_name, email, stage, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Prospects</h1>
        <Link
          href="/prospects/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add Prospect
        </Link>
      </div>
      {error && <p className="text-red-600">Error: {error.message}</p>}
      {!error && (!prospects || prospects.length === 0) && (
        <p className="text-gray-500">No prospects yet. Add your first one.</p>
      )}
      {prospects && prospects.length > 0 && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Name</th>
              <th className="text-left py-2">Email</th>
              <th className="text-left py-2">Stage</th>
              <th className="text-left py-2">Added</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="py-2">{p.full_name}</td>
                <td className="py-2">{p.email}</td>
                <td className="py-2">{p.stage}</td>
                <td className="py-2">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
