import dynamic from 'next/dynamic'

const MapClient = dynamic(() => import('@/components/MapClient'), { ssr: false })

export default function TerritoriesPage() {
  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Territories</h1>
        <div className="bg-[#E5B36A] text-white text-sm px-4 py-2 rounded-md font-medium">
          Territory Analysis Coming Soon
        </div>
      </div>

      <div className="rounded-lg overflow-hidden border shadow-sm">
        <MapClient />
      </div>

      <p className="text-sm text-gray-400 mt-3">
        Drive-time isochrones and Census ACS demographics coming in Sprint 3.
      </p>
    </main>
  )
}
