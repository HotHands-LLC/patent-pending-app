import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}
function getServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

/**
 * GET /api/patents/[id]/investors
 * Owner-only. Returns investor list for the Investors tab.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()

  // Verify ownership
  const { data: patent } = await supabase
    .from('patents').select('owner_id').eq('id', patentId).single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  }

  const { data: investments, error } = await supabase
    .from('patent_investments')
    .select('id, investor_user_id, amount_usd, rev_share_pct, stage_at_investment, status, created_at')
    .eq('patent_id', patentId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to fetch investors' }, { status: 500 })

  return NextResponse.json({ investments: investments ?? [] })
}
