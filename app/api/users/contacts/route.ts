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

async function requireUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  return user ?? null
}

/** GET /api/users/contacts — list all contacts for current user */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  let query = supabaseService
    .from('user_contacts')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (type) query = query.eq('contact_type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}

/** POST /api/users/contacts — create a new contact */
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    contact_type, is_default, name_first, name_middle, name_last,
    organization, address_line_1, address_line_2, city, state, zip,
    country = 'US', phone, email,
  } = body

  if (!contact_type) return NextResponse.json({ error: 'contact_type required' }, { status: 400 })

  // If setting as default, clear existing default for this type
  if (is_default) {
    await supabaseService.from('user_contacts')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('contact_type', contact_type)
  }

  const { data, error } = await supabaseService.from('user_contacts').insert({
    user_id: user.id,
    contact_type, is_default: is_default ?? false,
    name_first, name_middle, name_last, organization,
    address_line_1, address_line_2, city, state, zip, country, phone, email,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, contact: data }, { status: 201 })
}

/** PATCH /api/users/contacts — update a contact by id */
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Verify ownership
  const { data: existing } = await supabaseService.from('user_contacts')
    .select('id, user_id, contact_type').eq('id', id).single()
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (fields.is_default === true) {
    await supabaseService.from('user_contacts')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('contact_type', existing.contact_type)
      .neq('id', id)
  }

  const { data, error } = await supabaseService.from('user_contacts')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, contact: data })
}
