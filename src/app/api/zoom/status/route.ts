import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ connected: false })
    }

    const { data: tokenRow, error: tokenError } = await supabase
      .from('zoom_tokens')
      .select('access_token, expires_at')
      .eq('user_id', user.id)
      .single()

    if (tokenError || !tokenRow || !tokenRow.access_token) {
      return NextResponse.json({ connected: false })
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000)
    if (tokenRow.expires_at && now >= tokenRow.expires_at) {
      return NextResponse.json({ connected: false, reason: 'expired' })
    }

    return NextResponse.json({ connected: true })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
