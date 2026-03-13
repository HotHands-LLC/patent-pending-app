import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@supabase/supabase-js'
import { runGeminiResearch } from '@/lib/research/gemini-research'

export const maxDuration = 300

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
 * POST /api/research/run
 * Admin only. Starts a Gemini research loop asynchronously.
 * Returns immediately with { run_id, status: 'pending' }.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getAdminUser(token)
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { query, run_type } = body as { query?: string; run_type?: string }

  if (!query?.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }
  if (!['keyword', 'patent_number', 'category'].includes(run_type ?? '')) {
    return NextResponse.json({ error: 'run_type must be keyword | patent_number | category' }, { status: 400 })
  }

  // Create pending run row and return immediately
  const { data: run, error } = await supabaseService
    .from('research_runs')
    .insert({
      query:      query.trim(),
      run_type,
      status:     'pending',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !run) {
    return NextResponse.json({ error: 'Failed to create research run' }, { status: 500 })
  }

  // Kick off async Gemini loop — doesn't block response
  waitUntil(runGeminiResearch(run.id, query.trim(), run_type!))

  return NextResponse.json({ run_id: run.id, status: 'pending' })
}
