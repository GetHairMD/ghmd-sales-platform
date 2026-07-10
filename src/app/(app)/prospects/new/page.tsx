'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildProspectInsert } from '@/lib/prospect-insert'

export default function NewProspectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const supabase = createClient()
    const { error } = await supabase.from('prospects').insert(
      buildProspectInsert({
        full_name: formData.get('full_name') as string,
        email: formData.get('email') as string,
        phone: formData.get('phone') as string,
        lead_source: formData.get('source_channel') as string,
      }),
    )
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/prospects')
    }
  }

  return (
    <main className="max-w-lg mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Add Prospect</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Full Name *</label>
          <input name="full_name" required className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input name="email" type="email" className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input name="phone" className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Source Channel</label>
          <select name="source_channel" className="w-full border rounded px-3 py-2">
            <option value="inbound_web">Inbound Web</option>
            <option value="outbound_cold">Outbound Cold</option>
            <option value="referral">Referral</option>
            <option value="salon_partner">Salon Partner</option>
            <option value="event">Event</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Add Prospect'}
        </button>
      </form>
    </main>
  )
}
