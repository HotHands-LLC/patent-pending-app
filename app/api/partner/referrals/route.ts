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
async function requireUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  return user ?? null
}

/**
 * GET /api/partner/referrals
 * Returns referrals for the current partner with referred user info + patent info
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get partner's counsel_partner_id via partner_profiles
  const { data: pp } = await supabaseService
    .from('partner_profiles')
    .select('id, counsel_partner_id, pro_months_per_referral')
    .eq('user_id', user.id)
    .single()

  if (!pp?.counsel_partner_id) {
    return NextResponse.json({ referrals: [], partner_profile: null })
  }

  // Get referrals with referred user info
  const { data: referrals, error } = await supabaseService
    .from('partner_referrals')
    .select(`
      id, referral_code, status, patent_id, filing_completed_at,
      reward_type, reward_months, reward_granted_at, created_at, utm_data,
      referred_user:referred_user_id (
        id, email, full_name, name_first, name_last, created_at
      ),
      patent:patent_id (
        id, title, status, filing_status, figures_uploaded,
        cover_sheet_acknowledged
      )
    `)
    .eq('partner_id', pp.counsel_partner_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For each referred user, get their patent count + current step
  const enriched = await Promise.all((referrals ?? []).map(async (r) => {
    const userId = (r.referred_user as any)?.[0]?.id ?? null
    if (!userId) return { ...r, referred_user: (r.referred_user as any)?.[0] ?? null, patent_count: 0, user_patents: [] }
    const { data: patents } = await supabaseService
      .from('patents')
      .select('id, title, filing_status, status, cover_sheet_acknowledged, figures_uploaded, claims_draft')
      .eq('owner_id', userId)
    return { ...r, referred_user: (r.referred_user as any)?.[0] ?? null, patent_count: patents?.length ?? 0, user_patents: patents ?? [] }
  }))

  return NextResponse.json({ referrals: enriched, partner_profile: pp })
}
