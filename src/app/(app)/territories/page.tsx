import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function TerritoriesPage() {
  const supabase = createClient()
  const { data: territories } = await supabase
    .from('territories')
    .select('id, name, status, addressable_patients_primary, center_lat, center_lng, census_fetched_at')
    .order('created_at', { ascending: false })

  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    reserved: 'bg-yellow-100 text-yellow-700',
    sold: 'bg-red-100 text-red-700',
  }

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Territories</h1>
        <span className="text-sm text-gray-400">{territories?.length ?? 0} territories</span>
      </div>

      {!territories || territories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500 mb-1">No territories yet</p>
          <p className="text-sm text-gray-400">
            Territories are added via the Supabase console or a future admin UI.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {territories.map(t => {
            const status = t.status ?? 'available'
            return (
              <Link
                key={t.id}
                href={`/territories/${t.id}`}
                className="block rounded-xl border border-gray-200 p-5 hover:border-[#4681A3] hover:shadow-sm transition-all bg-white"
              >
                <div className="flex justify-between items-start mb-3">
                  <h2 className="font-semibold text-gray-900">{t.name}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {status}
                  </span>
                </div>

                {t.addressable_patients_primary != null ? (
                  <div className="mb-1">
                    <span className="text-2xl font-bold text-[#4681A3]">
                      {t.addressable_patients_primary.toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-400 ml-1">addressable patients</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mb-1">Census data pending</p>
                )}

                {t.census_fetched_at && (
                  <p className="text-xs text-gray-400">
                    Data: {new Date(t.census_fetched_at).toLocaleDateString()}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
