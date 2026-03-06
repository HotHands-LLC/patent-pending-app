import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_FILING_STATUSES = ['draft', 'approved', 'filed'] as const

// Fields user is allowed to update via PATCH
const ALLOWED_UPDATE_FIELDS = [
  'filing_status',
  'title',
  'description',
  'provisional_number',
  'application_number',
  'filing_date',
  'provisional_deadline',
  'non_provisional_deadline',
  'inventors',
  'tags',
  'status',
  'asking_price',
  'is_listed',
] as const

type AllowedField = typeof ALLOWED_UPDATE_FIELDS[number]

// PATCH /api/patents/[id] — update allowed fields
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

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate filing_status if present
  if (body.filing_status !== undefined) {
    if (!ALLOWED_FILING_STATUSES.includes(body.filing_status as typeof ALLOWED_FILING_STATUSES[number])) {
      return NextResponse.json(
        { error: `filing_status must be one of: ${ALLOWED_FILING_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }
  }

  // Build update payload — only allowed fields
  const updates: Partial<Record<AllowedField, unknown>> = {}
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in body) updates[field] = body[field]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Verify ownership
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id')
    .eq('id', id)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await supabaseService
    .from('patents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}
