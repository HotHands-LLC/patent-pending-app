/**
 * GET /api/admin/research/prev-searches
 * Returns the last 5 unique query_id groups from research_results.
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

  // Get last 5 unique query_ids with counts
  const { data, error } = await supabaseService
    .from('research_results')
    .select('query_id, query_params, created_at')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ searches: [] })

  // Deduplicate by query_id, keep first occurrence (most recent), count results
  const seen = new Map<string, { query_id: string; query_params: Record<string, string>; created_at: string; count: number }>()
  for (const row of (data ?? [])) {
    if (!seen.has(row.query_id)) {
      seen.set(row.query_id, { query_id: row.query_id, query_params: row.query_params, created_at: row.created_at, count: 1 })
    } else {
      seen.get(row.query_id)!.count++
    }
  }

  const searches = Array.from(seen.values()).slice(0, 5)
  return NextResponse.json({ searches })
}
