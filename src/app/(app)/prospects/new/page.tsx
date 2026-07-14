'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildProspectInsert } from '@/lib/prospect-insert'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface Rep {
  user_id: string
  full_name: string | null
}

/** Display label for a rep — full_name is nullable (may be unpopulated at provisioning). */
function repLabel(rep: Rep): string {
  return rep.full_name?.trim() || `Unnamed rep (${rep.user_id.slice(0, 8)}…)`
}

// Shared token classes for the native <select> controls (no Select primitive exists yet;
// mirrors Input's exact tokens — same as the Source Channel field).
const selectClass =
  'w-full rounded-md border border-mist bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary'

export default function NewProspectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Rep roster for the required "Assign to" selector (PR #124). Fetched from the
  // exec-gated /api/internal-users/reps route on mount.
  const [reps, setReps] = useState<Rep[]>([])
  const [repsLoading, setRepsLoading] = useState(true)
  const [repsError, setRepsError] = useState<string | null>(null)
  const [assignedRepId, setAssignedRepId] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/internal-users/reps')
        if (!res.ok) {
          throw new Error(
            res.status === 401 || res.status === 403
              ? 'Executive access is required to assign a rep.'
              : 'Failed to load reps.',
          )
        }
        const json = (await res.json()) as { reps?: Rep[] }
        if (active) setReps(json.reps ?? [])
      } catch (e) {
        if (active) setRepsError(e instanceof Error ? e.message : 'Failed to load reps.')
      } finally {
        if (active) setRepsLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const noReps = !repsLoading && !repsError && reps.length === 0

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // assigned_rep_id comes ONLY from the explicit rep selection — never the creating
    // exec's own uid (the bug the Second-Opinion Gate caught). The <select> is `required`,
    // so this is belt-and-suspenders.
    if (!assignedRepId) {
      setError('Select a rep to assign this prospect to.')
      return
    }
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
        assigned_rep_id: assignedRepId,
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
        {repsError && <p className="mb-4 text-sm text-error">{repsError}</p>}
        {noReps && (
          <p className="mb-4 text-sm text-error">
            No reps have been provisioned yet, so a prospect can’t be assigned. Provision a rep
            (see CLAUDE.md “Rep provisioning”) before adding prospects.
          </p>
        )}
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
            <label className="block text-sm font-medium text-text mb-1">Assign to *</label>
            <select
              name="assigned_rep_id"
              required
              value={assignedRepId}
              onChange={(e) => setAssignedRepId(e.target.value)}
              disabled={repsLoading || noReps}
              className={selectClass}
            >
              <option value="" disabled>
                {repsLoading ? 'Loading reps…' : 'Select a rep…'}
              </option>
              {reps.map((rep) => (
                <option key={rep.user_id} value={rep.user_id}>
                  {repLabel(rep)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Source Channel</label>
            <select name="source_channel" className={selectClass}>
              <option value="inbound_web">Inbound Web</option>
              <option value="outbound_cold">Outbound Cold</option>
              <option value="referral">Referral</option>
              <option value="salon_partner">Salon Partner</option>
              <option value="event">Event</option>
            </select>
          </div>
          <Button type="submit" variant="primary" block loading={loading} disabled={noReps}>
            Add Prospect
          </Button>
        </form>
      </Card>
    </main>
  )
}
