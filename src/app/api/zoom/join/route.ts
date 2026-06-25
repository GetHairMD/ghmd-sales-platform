import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the Zoom token for this user
    const { data: tokenRow, error: tokenError } = await supabase
      .from('zoom_tokens')
      .select('access_token, refresh_token, expires_at, meeting_number, meeting_password')
      .eq('user_id', user.id)
      .single()

    if (tokenError || !tokenRow) {
      return NextResponse.json({ error: 'No Zoom token found. Please connect your Zoom account.' }, { status: 401 })
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000)
    if (tokenRow.expires_at && now >= tokenRow.expires_at) {
      return NextResponse.json({ error: 'Zoom access token has expired. Please reconnect.' }, { status: 401 })
    }

    const meetingNumber = tokenRow.meeting_number
    const password = tokenRow.meeting_password || ''
    const zak = tokenRow.access_token

    if (!meetingNumber) {
      return NextResponse.json({ error: 'No meeting number configured.' }, { status: 400 })
    }

    // Construct Zoom Web Client join URL
    const joinUrl = `https://zoom.us/wc/join/${meetingNumber}?pwd=${encodeURIComponent(password)}&zak=${encodeURIComponent(zak)}`

    return NextResponse.json({ joinUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
