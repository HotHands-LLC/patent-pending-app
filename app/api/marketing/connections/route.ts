/**
 * /api/marketing/connections — CRUD for platform credentials
 * Credentials stored as-is in jsonb (admin-only table, RLS enforced).
 * Never log credential values.
 */
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

async function checkAdmin(token: string) {
  const { data: { user } } = await getUserClient(token).auth.getUser()
  return user && ADMIN_EMAILS.includes(user.email ?? '') ? user : null
}

/** GET /api/marketing/connections?brand=pp.app */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const brand = req.nextUrl.searchParams.get('brand') ?? 'pp.app'
  const { data } = await getServiceClient()
    .from('platform_credentials')
    .select('id, platform, is_active, last_tested_at, last_post_at, post_count, created_at')
    .eq('brand', brand)
  return NextResponse.json({ connections: data ?? [] })
}

/** POST /api/marketing/connections — upsert credentials for a platform */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { brand, platform, credentials } = await req.json()
  if (!platform || !credentials) return NextResponse.json({ error: 'platform + credentials required' }, { status: 400 })
  const { error } = await getServiceClient()
    .from('platform_credentials')
    .upsert({ brand: brand ?? 'pp.app', platform, credentials_jsonb: credentials, is_active: true }, { onConflict: 'brand,platform' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE /api/marketing/connections?brand=pp.app&platform=reddit */
export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const brand = req.nextUrl.searchParams.get('brand') ?? 'pp.app'
  const platform = req.nextUrl.searchParams.get('platform') ?? ''
  await getServiceClient().from('platform_credentials')
    .update({ is_active: false }).eq('brand', brand).eq('platform', platform)
  return NextResponse.json({ ok: true })
}
