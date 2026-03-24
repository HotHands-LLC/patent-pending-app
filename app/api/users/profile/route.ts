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

const ALLOWED = [
  'name_first', 'name_middle', 'name_last', 'full_name',
  'phone', 'address_line_1', 'address_line_2', 'city', 'state', 'zip', 'country',
  'company', 'uspto_customer_number',
  'default_assignee_name', 'default_assignee_address',
  'referred_by_code', 'referred_by_partner_id',
] as const

/** GET /api/users/profile — returns current user's profile */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseService
    .from('patent_profiles')
    .select('id, email, full_name, name_first, name_middle, name_last, company, phone, address_line_1, address_line_2, city, state, zip, country, uspto_customer_number, default_assignee_name, default_assignee_address, inventor_contact_id, attorney_contact_id, assignee_contact_id')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}

/** PATCH /api/users/profile — updates allowed profile fields */
export async function PATCH(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  for (const field of ALLOWED) {
    if (field in body) updates[field] = body[field]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Keep full_name in sync if split fields provided
  if ((updates.name_first || updates.name_last) && !updates.full_name) {
    const { data: existing } = await supabaseService.from('patent_profiles')
      .select('name_first, name_middle, name_last').eq('id', user.id).single()
    const first  = (updates.name_first  as string) ?? existing?.name_first ?? ''
    const middle = (updates.name_middle as string) ?? existing?.name_middle ?? ''
    const last   = (updates.name_last   as string) ?? existing?.name_last  ?? ''
    updates.full_name = [first, middle, last].filter(Boolean).join(' ')
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseService
    .from('patent_profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id, email, full_name, name_first, name_middle, name_last, phone, address_line_1, address_line_2, city, state, zip, country, company, uspto_customer_number, default_assignee_name, default_assignee_address')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, profile: data })
}
