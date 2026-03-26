import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { data } = await getServiceClient().from('pattie_context').select('context_json, updated_at').eq('brand', 'pp.app').single()
  return NextResponse.json(data ?? { context_json: {}, updated_at: null })
}

export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { context_json } = await req.json()
  if (!context_json || typeof context_json !== 'object') return NextResponse.json({ error: 'context_json required' }, { status: 400 })
  const svc = getServiceClient()
  const { error } = await svc.from('pattie_context')
    .upsert({ brand: 'pp.app', context_json, updated_at: new Date().toISOString() }, { onConflict: 'brand' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
