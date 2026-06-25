'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Activity = {
  id: string
  created_at: string
  activity_type: string
  body: string
  created_by: string
}

export default function ActivityLog({
  prospectId,
  initialActivities,
}: {
  prospectId: string
  initialActivities: Activity[]
}) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities)
  const [body, setBody] = useState('')
  const [type, setType] = useState('note')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('activities')
      .insert({
        prospect_id: prospectId,
        activity_type: type,
        body: body.trim(),
        created_by: 'trace',
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
    } else if (data) {
      setActivities([data as Activity, ...activities])
      setBody('')
    }
    setSaving(false)
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Activity Log</h2>

      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="flex gap-2 mb-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4681A3]"
          >
            <option value="note">Note</option>
            <option value="call_log">Call Log</option>
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note or call log…"
          rows={3}
          className="w-full border rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#4681A3]"
        />
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving || !body.trim()}
          className="bg-[#4681A3] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#3a6e8c] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Entry'}
        </button>
      </div>

      {activities.length === 0 ? (
        <p className="text-gray-500 text-sm">No activity yet.</p>
      ) : (
        <div className="space-y-3">
          {activities.map((a) => (
            <div key={a.id} className="bg-white border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    a.activity_type === 'call_log'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {a.activity_type === 'call_log' ? 'Call Log' : 'Note'}
                </span>
                <div className="text-xs text-gray-400">
                  {a.created_by} · {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
