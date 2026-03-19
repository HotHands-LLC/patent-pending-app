/**
 * PATCH /api/admin/blog/[id]
 * Admin-only. Update blog post status (published | rejected | draft).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

async function getAdminSvc(token: string) {
  const svc = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
  )
  const userClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await svc.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? svc : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth   = req.headers.get('authorization')
  const token  = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await getAdminSvc(token)
  if (!svc) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { status?: string }
  const ALLOWED_STATUSES = ['draft', 'published', 'rejected']
  if (!body.status || !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${ALLOWED_STATUSES.join(' | ')}` }, { status: 400 })
  }

  const patch: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() }
  if (body.status === 'published') {
    // Set published_at if not already set
    const { data: existing } = await svc.from('blog_posts').select('published_at').eq('id', id).single()
    if (!existing?.published_at) patch.published_at = new Date().toISOString()
  }

  const { data, error } = await svc
    .from('blog_posts')
    .update(patch)
    .eq('id', id)
    .select('id, title, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
