import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/**
 * POST /api/invite/accept
 * Body: { token }
 * Authenticated — the user must be signed in.
 * Sets user_id + accepted_at on the collaborator record.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const bearerToken = authHeader.slice(7)
    const { data: { user } } = await getUserClient(bearerToken).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { token } = await req.json()
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

    // Look up invite
    const { data: collab, error: collabErr } = await supabaseService
      .from('patent_collaborators')
      .select('id, patent_id, accepted_at, invited_email, role, ownership_pct')
      .eq('invite_token', token)
      .single()

    if (collabErr || !collab) {
      return NextResponse.json({ error: 'Invite not found or already used' }, { status: 404 })
    }
    if (collab.accepted_at) {
      return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 409 })
    }

    // Accept
    await supabaseService
      .from('patent_collaborators')
      .update({
        user_id: user.id,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', collab.id)

    // Fetch patent title for response
    const { data: patent } = await supabaseService
      .from('patents')
      .select('title')
      .eq('id', collab.patent_id)
      .single()

    return NextResponse.json({
      message: 'Invite accepted',
      patent_id: collab.patent_id,
      patent_title: patent?.title ?? 'your patent',
      role: collab.role,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('[invite/accept] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
