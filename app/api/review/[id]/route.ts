import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function userClient(jwt: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )
}

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null
}

// PATCH /api/review/[id] — Chad approves or rejects
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = userClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status, reviewer_notes } = await req.json()
  if (!['approved', 'rejected', 'revision_requested'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('review_queue')
    .update({ status, reviewer_notes: reviewer_notes ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id, status, reviewed_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
