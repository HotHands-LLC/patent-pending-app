/**
 * GET/POST /api/admin/research/saved-queries
 * Admin-only. Manage autoresearch saved queries.
 *
 * GET  → list all saved queries (active + inactive)
 * POST → create a new saved query
 *
 * No module-level Supabase client. (Standing rule.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

async function getAdminUser(token: string) {
  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const svc = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, svc }
  const { data: profile } = await svc.from('profiles').select('is_admin').eq('id', user.id).single()
  return { user: profile?.is_admin ? user : null, svc }
}

export async function GET(req: NextRequest) {
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { user, svc } = await getAdminUser(token)
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { data, error } = await svc
    .from('research_saved_queries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ queries: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { user, svc } = await getAdminUser(token)
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { label, cpc_codes, keywords, patent_id } = body

  if (!label?.trim()) return NextResponse.json({ error: 'label is required' }, { status: 400 })

  const { data, error } = await svc
    .from('research_saved_queries')
    .insert({
      label:      label.trim(),
      cpc_codes:  Array.isArray(cpc_codes) ? cpc_codes.filter(Boolean) : null,
      keywords:   Array.isArray(keywords)  ? keywords.filter(Boolean)  : null,
      patent_id:  patent_id ?? null,
      is_active:  true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ query: data }, { status: 201 })
}
