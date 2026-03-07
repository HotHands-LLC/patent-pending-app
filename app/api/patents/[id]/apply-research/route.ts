import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

/**
 * POST /api/patents/[id]/apply-research
 * Promotes claims_draft_research_pending → claims_draft.
 * Saves original claims_draft → claims_draft_pre_refine as backup.
 * Clears staging field after apply.
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

  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, claims_draft, claims_draft_research_pending')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!patent.claims_draft_research_pending) {
    return NextResponse.json({ error: 'No staged research result to apply' }, { status: 400 })
  }

  const { error } = await supabaseService
    .from('patents')
    .update({
      // Backup original
      claims_draft_pre_refine: patent.claims_draft,
      // Promote staged result
      claims_draft: patent.claims_draft_research_pending,
      // Clear staging
      claims_draft_research_pending: null,
      research_completed_at: null,
      claims_status: 'complete',
      updated_at: new Date().toISOString(),
    })
    .eq('id', patentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, message: 'Research applied. Original claims saved as backup.' })
}
