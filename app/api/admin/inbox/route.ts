import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAdminUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

/**
 * GET /api/admin/inbox
 * Returns inbox items with optional filters.
 * Query params: action_only=true, unreviewed=true, limit=50
 */
export async function GET(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const actionOnly = searchParams.get('action_only') === 'true'
  const unreviewed = searchParams.get('unreviewed') === 'true'
  const limit = parseInt(searchParams.get('limit') ?? '100')

  let query = supabaseService
    .from('inbox_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (actionOnly) query = query.eq('is_action_required', true)
  if (unreviewed) query = query.eq('is_reviewed', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

/**
 * PATCH /api/admin/inbox
 * Mark item as reviewed, actioned, or sent_to_telegram.
 * Body: { id, is_reviewed?, actioned_at?, sent_to_telegram_at? }
 */
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Only allow safe fields
  const allowed = ['is_reviewed', 'actioned_at', 'sent_to_telegram_at', 'sent_reply']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in updates) patch[k] = updates[k]
  }

  const { error } = await supabaseService.from('inbox_items').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
