/**
 * GET /api/admin/research/results?queryId=<uuid>
 * Returns all cached research_results for a given query_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
)

async function getAdminUser(token: string) {
  const anonClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService
    .from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getAdminUser(token)
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const queryId = req.nextUrl.searchParams.get('queryId')
  if (!queryId) return NextResponse.json({ error: 'queryId required' }, { status: 400 })

  const { data, error } = await supabaseService
    .from('research_results')
    .select('*')
    .eq('query_id', queryId)
    .eq('created_by', user.id)
    .order('readiness_score', { ascending: false })

  if (error) return NextResponse.json({ results: [] })

  return NextResponse.json({ results: data ?? [] })
}
