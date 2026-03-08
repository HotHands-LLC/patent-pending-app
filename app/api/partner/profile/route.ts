import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

async function requireUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  return user ?? null
}

/**
 * GET /api/partner/profile — get current user's partner_profile
 * Returns null if user is not a partner
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabaseService
    .from('partner_profiles')
    .select('*, counsel_partner:counsel_partner_id(*)')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ profile: data ?? null })
}

/**
 * PATCH /api/partner/profile — update partner profile (firm, bar, practice areas)
 */
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowed = ['firm_name', 'bar_id', 'bar_state', 'practice_areas', 'bio']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  const { data, error } = await supabaseService
    .from('partner_profiles')
    .update(update)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, profile: data })
}
