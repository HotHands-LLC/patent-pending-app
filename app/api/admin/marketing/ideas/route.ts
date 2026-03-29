import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}
function userClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}
async function adminCheck(token: string): Promise<boolean> {
  const { data: { user } } = await userClient(token).auth.getUser()
  return !!(user && ADMIN_EMAILS.includes(user.email ?? ''))
}

/** GET /api/admin/marketing/ideas?brand=pp.app */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await adminCheck(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const brand = req.nextUrl.searchParams.get('brand') ?? 'pp.app'
  const { data } = await svc().from('marketing_ideas').select('*').eq('brand', brand)
    .order('created_at', { ascending: false })
  return NextResponse.json({ ideas: data ?? [] })
}

/** POST /api/admin/marketing/ideas — create new idea */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await adminCheck(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const body = await req.json()
  const { data, error } = await svc().from('marketing_ideas').insert({
    brand: body.brand ?? 'pp.app',
    channel: body.channel,
    title: body.title,
    body: body.body ?? null,
    hook: body.hook ?? null,
    subject_line: body.subject_line ?? null,
    status: body.status ?? 'idea',
    source: body.source ?? 'chad',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ idea: data })
}

/** PATCH /api/admin/marketing/ideas — update idea */
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await adminCheck(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const body = await req.json()
  const { id, ...fields } = body
  if (fields.status === 'posted') fields.posted_at = new Date().toISOString()
  const { data, error } = await svc().from('marketing_ideas').update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ idea: data })
}

/** DELETE /api/admin/marketing/ideas?id=... */
export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await adminCheck(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await svc().from('marketing_ideas').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
