import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@supabase/supabase-js'
import { runGeminiResearch, type PatentAnalysisOptions } from '@/lib/research/gemini-research'

export const dynamic = 'force-dynamic'

export const maxDuration = 300

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
  const {
    query: rawQuery,
    run_type,
    patent_id,
    analysis_type,
  } = body as {
    query?:         string
    run_type?:      string
    patent_id?:     string
    analysis_type?: 'prior_art' | 'competitive' | 'acquisition'
  }

  const VALID_RUN_TYPES = ['keyword', 'patent_number', 'category', 'patent_analysis']

  // Patent analysis: query is derived from the patent title — use placeholder
  const isPatentAnalysis = run_type === 'patent_analysis'

  // Strip surrounding quotes the user may have typed
  const query = isPatentAnalysis
    ? (rawQuery?.trim() || 'Patent Analysis')
    : rawQuery?.trim().replace(/^["']|["']$/g, '').trim()

  if (!query && !isPatentAnalysis) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }
  if (!VALID_RUN_TYPES.includes(run_type ?? '')) {
    return NextResponse.json({
      error: `run_type must be one of: ${VALID_RUN_TYPES.join(' | ')}`
    }, { status: 400 })
  }
  if (isPatentAnalysis && !patent_id) {
    return NextResponse.json({ error: 'patent_id is required for patent_analysis runs' }, { status: 400 })
  }

  // Create pending run row and return immediately
  const { data: run, error } = await supabaseService
    .from('research_runs')
    .insert({
      query:         query ?? 'Patent Analysis',
      run_type,
      status:        'pending',
      created_by:    user.id,
      patent_id:     patent_id ?? null,
      analysis_type: analysis_type ?? null,
    })
    .select('id')
    .single()

  if (error || !run) {
    return NextResponse.json({ error: 'Failed to create research run' }, { status: 500 })
  }

  const patentOptions: PatentAnalysisOptions | undefined = isPatentAnalysis
    ? { patentId: patent_id, analysisType: analysis_type ?? 'acquisition' }
    : undefined

  // Kick off async Gemini loop — doesn't block response
  waitUntil(runGeminiResearch(run.id, query ?? 'Patent Analysis', run_type!, patentOptions))

  return NextResponse.json({ run_id: run.id, status: 'pending' })
}
