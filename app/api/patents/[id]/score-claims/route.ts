/**
 * POST /api/patents/[id]/score-claims
 * Scores all claims in claims_draft via Gemini Flash and stores
 * the result in patents.claims_scores (JSONB).
 *
 * Auth: Bearer token required; must be patent owner or admin
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreClaimsBatch } from '@/lib/claim-scorer'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = auth.slice(7)

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch patent
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, claims_draft')
    .eq('id', id)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!patent.claims_draft) {
    return NextResponse.json({ error: 'No claims draft to score' }, { status: 400 })
  }

  const result = await scoreClaimsBatch(id, patent.claims_draft)

  // Persist to DB
  const { error: updateError } = await supabaseService
    .from('patents')
    .update({
      claims_scores: result,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(result)
}
