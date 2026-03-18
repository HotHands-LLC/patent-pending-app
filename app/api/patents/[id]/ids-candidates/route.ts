/**
 * GET/POST /api/patents/[id]/ids-candidates
 *
 * GET  → list all IDS candidates for this patent (sorted: pending first, then include, exclude)
 * POST → add a new candidate manually or from a research_result_id
 *
 * No module-level Supabase client. (Standing rule.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function makeClients(token: string) {
  const svc = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
  )
  const userClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  return { svc, userClient }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { svc, userClient } = makeClients(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify patent ownership
  const { data: patent } = await svc.from('patents').select('owner_id').eq('id', patentId).single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await svc
    .from('research_ids_candidates')
    .select('*')
    .eq('patent_id', patentId)
    .order('status')   // pending → include → exclude alphabetically
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort: pending first, include second, exclude last
  const ORDER = { pending: 0, include: 1, exclude: 2 }
  const sorted = (data ?? []).sort((a, b) =>
    (ORDER[a.status as keyof typeof ORDER] ?? 3) - (ORDER[b.status as keyof typeof ORDER] ?? 3)
  )

  return NextResponse.json({ candidates: sorted })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { svc, userClient } = makeClients(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: patent } = await svc.from('patents').select('owner_id').eq('id', patentId).single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  // If research_result_id provided, pull fields from that result
  let candidateData: Record<string, unknown> = {}
  if (body.research_result_id) {
    const { data: result } = await svc
      .from('research_results')
      .select('application_number, patent_number, title, inventor_names, filing_date, cpc_codes')
      .eq('id', body.research_result_id)
      .single()
    if (result) candidateData = { ...result }
  }

  // Manual fields override/supplement
  const title = body.title ?? candidateData.title
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const { data, error } = await svc
    .from('research_ids_candidates')
    .insert({
      patent_id:          patentId,
      owner_id:           user.id,
      research_result_id: body.research_result_id ?? null,
      application_number: body.application_number ?? candidateData.application_number ?? null,
      patent_number:      body.patent_number      ?? candidateData.patent_number      ?? null,
      title,
      inventor_names:     body.inventor_names     ?? candidateData.inventor_names     ?? null,
      filing_date:        body.filing_date        ?? candidateData.filing_date        ?? null,
      cpc_codes:          body.cpc_codes          ?? candidateData.cpc_codes          ?? null,
      status:             'pending',
      relevance_notes:    body.relevance_notes    ?? null,
      added_by:           body.added_by           ?? 'manual',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ candidate: data }, { status: 201 })
}
