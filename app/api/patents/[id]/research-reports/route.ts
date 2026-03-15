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

/** GET /api/patents/[id]/research-reports — list reports for a patent */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: patent } = await supabaseService
    .from('patents').select('owner_id').eq('id', patentId).single()
  if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: reports, error } = await supabaseService
    .from('patent_research_reports')
    .select('id, report_month, generated_at, raw_report, status, created_at')
    .eq('patent_id', patentId)
    .order('report_month', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reports: reports ?? [] })
}

/** PATCH /api/patents/[id]/research-reports — update report status (reviewed/dismissed) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: patent } = await supabaseService
    .from('patents').select('owner_id').eq('id', patentId).single()
  if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { report_id?: string; status?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { report_id, status } = body
  if (!report_id) return NextResponse.json({ error: 'report_id required' }, { status: 400 })
  if (!['reviewed', 'dismissed', 'pending_review'].includes(status ?? '')) {
    return NextResponse.json({ error: 'status must be reviewed, dismissed, or pending_review' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabaseService
    .from('patent_research_reports')
    .update({ status })
    .eq('id', report_id)
    .eq('patent_id', patentId)  // extra safety: scope to this patent
    .select('id, status')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ ok: true, report: updated })
}
