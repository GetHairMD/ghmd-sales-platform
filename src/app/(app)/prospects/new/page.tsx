'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildProspectInsert } from '@/lib/prospect-insert'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

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
    // E-0a rep attribution: stamp the creating user's auth.uid() as assigned_rep_id.
    // Null when there is no session — a legitimate unattributed lead, never a fabricated id.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error } = await supabase.from('prospects').insert(
      buildProspectInsert({
        full_name: formData.get('full_name') as string,
        email: formData.get('email') as string,
        phone: formData.get('phone') as string,
        lead_source: formData.get('source_channel') as string,
        assigned_rep_id: user?.id ?? null,
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
    <main className="mx-auto max-w-lg p-6 sm:p-8">
      <h1 className="mb-6 font-heading text-2xl font-bold text-text">Add Prospect</h1>
      <Card padding="lg">
        {error && <p className="mb-4 text-sm text-error">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1">Full Name *</label>
            <Input name="full_name" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Email</label>
            <Input name="email" type="email" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Phone</label>
            <Input name="phone" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Source Channel</label>
            <select
              name="source_channel"
              className="w-full rounded-md border border-mist bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="inbound_web">Inbound Web</option>
              <option value="outbound_cold">Outbound Cold</option>
              <option value="referral">Referral</option>
              <option value="salon_partner">Salon Partner</option>
              <option value="event">Event</option>
            </select>
          </div>
          <Button type="submit" variant="primary" block loading={loading}>
            Add Prospect
          </Button>
        </form>
      </Card>
    </main>
  )
}
