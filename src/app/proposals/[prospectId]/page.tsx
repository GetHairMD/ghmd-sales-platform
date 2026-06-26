import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

interface PageProps {
  params: { prospectId: string }
}

// Public page — no auth wall. Uses service role to bypass RLS (read-only, server-side only).
export default async function ProposalPage({ params }: PageProps) {
  const { prospectId } = params

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch prospect
  const { data: prospect } = await admin
    .from('prospects')
    .select('id, full_name, practice_name, specialty, email')
    .eq('id', prospectId)
    .single()

  if (!prospect) return notFound()

  // Fetch most recent deal with territory data
  const { data: deal } = await admin
    .from('deals')
    .select(`
      id,
      territory_price,
      territories (
        id,
        name,
        addressable_patients_primary,
        center_lat,
        center_lng
      )
    `)
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Supabase infers FK join results as arrays; cast through unknown then take [0]
  const territory = (deal?.territories as unknown as {
    id: string
    name: string
    addressable_patients_primary: number | null
    center_lat: number
    center_lng: number
  }[] | undefined)?.[0] ?? null

  const territoryPrice = deal?.territory_price
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
        Number(deal.territory_price),
      )
    : '$179,000'

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-[#4681A3] text-white py-10 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg">
              G
            </div>
            <span className="text-white/80 text-sm font-medium tracking-wide uppercase">GetHairMD</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">
            Territory Proposal for {prospect.full_name}
          </h1>
          {prospect.practice_name && (
            <p className="text-white/80 text-lg">{prospect.practice_name}</p>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Territory Snapshot */}
        {territory ? (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Territory</h2>
            <div className="rounded-xl border border-gray-200 p-6 bg-gray-50 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Territory</p>
                  <p className="text-2xl font-bold text-gray-900">{territory.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Territory Price</p>
                  <p className="text-2xl font-bold text-[#4681A3]">{territoryPrice}</p>
                </div>
              </div>

              {territory.addressable_patients_primary != null && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Addressable Market</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {territory.addressable_patients_primary.toLocaleString()}
                    <span className="text-base font-normal text-gray-500 ml-2">estimated patients</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Within your 30-minute primary drive-time zone — income-qualified adults with clinically meaningful hair loss who are likely to seek treatment.
                  </p>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section>
            <div className="rounded-xl border border-gray-200 p-6 bg-gray-50 text-gray-500">
              Territory details are being prepared. Your representative will follow up shortly.
            </div>
          </section>
        )}

        {/* What's Included */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">What&apos;s Included</h2>
          <ul className="space-y-3">
            {[
              'Exclusive protected territory with defined drive-time boundaries',
              'Complete GHMD practice buildout and clinical protocol',
              'Marketing and patient acquisition system',
              'Ongoing clinical and operational support',
              'GetHairMD brand license and physician network access',
            ].map(item => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 w-5 h-5 rounded-full bg-[#4681A3] flex-shrink-0 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Next Steps */}
        <section className="rounded-xl bg-[#4681A3]/5 border border-[#4681A3]/20 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Next Steps</h2>
          <p className="text-gray-600 mb-5">
            Review the territory agreement and connect with your GetHairMD representative to finalize your territory.
          </p>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 bg-[#E5B36A] text-white font-semibold px-6 py-3 rounded-lg opacity-70 cursor-not-allowed"
            title="Agreement signing coming in Sprint 4"
          >
            Review Agreement
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Coming Soon</span>
          </button>
          <p className="text-xs text-gray-400 mt-2">Online agreement signing available soon.</p>
        </section>

        {/* Contact */}
        <section className="pt-4 border-t border-gray-100 text-sm text-gray-500">
          <p>Questions? Contact your GetHairMD representative or reply to the email where you received this link.</p>
        </section>
      </main>

      <footer className="bg-gray-50 border-t border-gray-200 py-6 px-6 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} GetHairMD. This proposal is confidential and intended solely for {prospect.full_name}.
      </footer>
    </div>
  )
}
