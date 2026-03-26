import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }
async function checkAdmin(token: string) {
  const { data: { user } } = await getUser(token).auth.getUser()
  return user && ADMIN_EMAILS.includes(user.email ?? '') ? user : null
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { data } = await getSvc().from('blog_posts').select('id,slug,title,status,published_at,word_count,category,created_at').order('created_at', { ascending: false })
  return NextResponse.json({ posts: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id, status } = await req.json()
  if (!id || !status) return NextResponse.json({ error: 'id + status required' }, { status: 400 })
  const updates: Record<string, unknown> = { status }
  if (status === 'published') updates.published_at = new Date().toISOString()
  await getSvc().from('blog_posts').update(updates).eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await getSvc().from('blog_posts').update({ status: 'archived' }).eq('id', id)
  return NextResponse.json({ ok: true })
}
