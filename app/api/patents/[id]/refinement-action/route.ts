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

/**
 * POST /api/patents/[id]/refinement-action
 * Body: { action: 'accept' | 'revert' | 'dismiss' }
 *
 * accept  — Keep refined claims_draft, clear pre_refine backup,
 *           set claims_status='complete', keep filing_status='approved'
 * revert  — Restore claims_draft from pre_refine, clear pre_refine,
 *           set claims_status='complete', set filing_status='draft'
 * dismiss — Keep refined claims_draft, clear pre_refine (same as accept
 *           but used from the intercept modal "Approve Anyway" path — also
 *           sets filing_status='approved')
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = (await req.json()) as { action: 'accept' | 'revert' | 'dismiss' }
  if (!['accept', 'revert', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'action must be accept | revert | dismiss' }, { status: 400 })
  }

  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, claims_draft, claims_draft_pre_refine, filing_status, claims_status')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date().toISOString()

  if (action === 'accept' || action === 'dismiss') {
    // Keep refined draft, clear backup, re-approve
    const { data: updated, error } = await supabaseService
      .from('patents')
      .update({
        claims_draft_pre_refine: null,
        claims_status: 'complete',
        filing_status: 'approved',
        updated_at: now,
      })
      .eq('id', patentId)
      .select('claims_status, filing_status, claims_draft_pre_refine')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, ...updated })
  }

  if (action === 'revert') {
    if (!patent.claims_draft_pre_refine) {
      return NextResponse.json({ error: 'No pre-refinement backup to restore' }, { status: 400 })
    }
    const { data: updated, error } = await supabaseService
      .from('patents')
      .update({
        claims_draft: patent.claims_draft_pre_refine,
        claims_draft_pre_refine: null,
        claims_status: 'complete',
        filing_status: 'draft',
        updated_at: now,
      })
      .eq('id', patentId)
      .select('claims_status, filing_status, claims_draft, claims_draft_pre_refine')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action, ...updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
