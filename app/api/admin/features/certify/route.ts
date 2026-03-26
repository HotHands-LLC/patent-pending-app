/**
 * POST /api/admin/features/certify — Chad approves certification
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(t: string) { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { global: { headers: { Authorization: `Bearer ${t}` } } }) }
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function POST(req: NextRequest) {
  const t = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUser(t).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { feature_key, action } = await req.json() // action: 'certify' | 'reject'
  if (!feature_key) return NextResponse.json({ error: 'feature_key required' }, { status: 400 })

  const svc = getSvc()
  const certified = action !== 'reject'
  await svc.from('feature_catalog').update({
    certified, certified_at: certified ? new Date().toISOString() : null,
  }).eq('feature_key', feature_key)

  await svc.from('certification_history').insert({
    feature_key, stage: 'chad_approval',
    result: certified ? 'approved' : 'rejected',
    performed_by: 'chad',
  })

  return NextResponse.json({ ok: true, certified })
}
