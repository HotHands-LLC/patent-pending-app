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
 * POST /api/patents/[id]/chat-messages
 * Save a single Pattie chat message (user or assistant).
 * Non-blocking — client fires and forgets.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let sessionId: string, role: string, content: string
  try {
    const body = await req.json()
    sessionId = body.session_id
    role      = body.role
    content   = body.content
    if (!sessionId || !role || !content) throw new Error('Missing fields')
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // Verify patent access (owner or collaborator)
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (patent.owner_id !== user.id) {
    const { data: collab } = await supabaseService
      .from('patent_collaborators')
      .select('id')
      .eq('patent_id', patentId)
      .not('accepted_at', 'is', null)
      .or(`user_id.eq.${user.id},invited_email.eq.${user.email ?? ''}`)
      .limit(1)
      .single()
    if (!collab) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseService
    .from('patent_chat_messages')
    .insert({
      patent_id:  patentId,
      user_id:    user.id,
      session_id: sessionId,
      role,
      content,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
