import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(t: string) { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { global: { headers: { Authorization: `Bearer ${t}` } } }) }
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }
async function checkAdmin(t: string) {
  const { data: { user } } = await getUser(t).auth.getUser()
  return user && ADMIN_EMAILS.includes(user.email ?? '') ? user : null
}

export async function GET(req: NextRequest) {
  const t = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(t)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const brand = req.nextUrl.searchParams.get('brand') ?? 'pp.app'
  const { data } = await getSvc().from('integration_credentials').select('service,is_active,connected_at,realm_id').eq('brand', brand)
  return NextResponse.json({ integrations: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const t = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(t)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const service = req.nextUrl.searchParams.get('service') ?? ''
  await getSvc().from('integration_credentials').update({ is_active: false }).eq('service', service)
  return NextResponse.json({ ok: true })
}
