import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_FILING_STATUSES = ['draft', 'approved', 'filed'] as const

// PATCH /api/patents/[id] — update filing_status
// Allowed transitions: draft → approved, approved → filed
// Auth: Bearer token required; must be patent owner
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = auth.slice(7)

  // Verify user via anon client
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { filing_status?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { filing_status } = body

  if (!filing_status) {
    return NextResponse.json({ error: 'filing_status required' }, { status: 400 })
  }
  if (!ALLOWED_FILING_STATUSES.includes(filing_status as typeof ALLOWED_FILING_STATUSES[number])) {
    return NextResponse.json(
      { error: `filing_status must be one of: ${ALLOWED_FILING_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  // Verify ownership
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, filing_status')
    .eq('id', id)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })

  // Owner check — patent_profiles.id matches auth user id
  if (patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await supabaseService
    .from('patents')
    .update({ filing_status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, filing_status, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}
