import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

async function getAdminUser(token: string) {
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService
    .from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

/**
 * GET /api/research/runs?id=<uuid>
 * Admin only. Returns run list (no id) or single run (with id).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getAdminUser(token)
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const runId = req.nextUrl.searchParams.get('id')

  if (runId) {
    // Single run — full candidates
    const { data, error } = await supabaseService
      .from('research_runs')
      .select('*')
      .eq('id', runId)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(data)
  }

  // List — omit candidates (too large for list view)
  const { data, error } = await supabaseService
    .from('research_runs')
    .select('id, query, run_type, status, summary, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
  return NextResponse.json(data ?? [])
}
