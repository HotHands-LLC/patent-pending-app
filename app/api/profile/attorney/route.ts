/**
 * PATCH /api/profile/attorney
 * Enables attorney mode on a user's patent_profiles row.
 * Requires explicit TOS acceptance (tos_accepted: true).
 */
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

export async function PATCH(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tos_accepted, bar_number, firm_name, bar_state } = body

  if (!tos_accepted) {
    return NextResponse.json({
      error: 'You must accept the ethics acknowledgment to enable attorney mode.',
    }, { status: 400 })
  }

  const { error } = await supabaseService
    .from('patent_profiles')
    .update({
      is_attorney: true,
      bar_number:  typeof bar_number  === 'string' ? bar_number.trim()  || null : null,
      firm_name:   typeof firm_name   === 'string' ? firm_name.trim()   || null : null,
      bar_state:   typeof bar_state   === 'string' ? bar_state.trim().toUpperCase() || null : null,
      attorney_tos_accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('[profile/attorney] update error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, is_attorney: true })
}
