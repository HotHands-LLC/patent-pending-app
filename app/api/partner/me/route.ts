import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)
function getUserClient(t: string) {
  return createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'), (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${t}` } } })
}

async function requireUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  return user ?? null
}

/**
 * GET /api/partner/me — current user's partner profile + dashboard data
 * Returns: partner record, referrals list, earnings summary
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabaseService
    .from('patent_counsel_partners')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!partner) return NextResponse.json({ partner: null }, { status: 200 })

  // Load referrals with client info
  const { data: referrals } = await supabaseService
    .from('partner_referrals')
    .select(`
      id, status, referral_code, patent_id, filing_completed_at,
      reward_type, reward_months, reward_granted_at, created_at,
      referred_user_id
    `)
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })

  // Load referred user profiles
  const userIds = (referrals ?? [])
    .map(r => r.referred_user_id)
    .filter(Boolean) as string[]

  let clientProfiles: Record<string, { name_first: string | null; name_last: string | null; email: string; created_at: string }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseService
      .from('patent_profiles')
      .select('id, name_first, name_last, email, created_at')
      .in('id', userIds)
    for (const p of profiles ?? []) {
      clientProfiles[p.id] = p
    }
  }

  // Load patent counts per client
  let patentCounts: Record<string, number> = {}
  if (userIds.length > 0) {
    const { data: patentRows } = await supabaseService
      .from('patents')
      .select('owner_id')
      .in('owner_id', userIds)
    for (const row of patentRows ?? []) {
      patentCounts[row.owner_id] = (patentCounts[row.owner_id] ?? 0) + 1
    }
  }

  // Load qualifying patent titles
  const patentIds = (referrals ?? [])
    .map(r => r.patent_id)
    .filter(Boolean) as string[]

  let patentTitles: Record<string, string> = {}
  if (patentIds.length > 0) {
    const { data: pts } = await supabaseService
      .from('patents')
      .select('id, title, filing_status, status')
      .in('id', patentIds)
    for (const p of pts ?? []) {
      patentTitles[p.id] = p.title
    }
  }

  const enrichedReferrals = (referrals ?? []).map(r => ({
    ...r,
    client: r.referred_user_id ? clientProfiles[r.referred_user_id] ?? null : null,
    client_patent_count: r.referred_user_id ? (patentCounts[r.referred_user_id] ?? 0) : 0,
    qualifying_patent_title: r.patent_id ? patentTitles[r.patent_id] ?? null : null,
  }))

  // Earnings summary
  const totalReferrals = enrichedReferrals.length
  const qualifiedReferrals = enrichedReferrals.filter(r => ['qualified', 'rewarded'].includes(r.status)).length
  const earningsHistory = enrichedReferrals
    .filter(r => r.status === 'rewarded' && r.reward_granted_at)
    .map(r => ({
      date: r.reward_granted_at!,
      event: `Referral qualified — ${r.client ? [r.client.name_first, r.client.name_last].filter(Boolean).join(' ') : 'unknown client'}`,
      reward: `${r.reward_months ?? partner.pro_months_per_referral} months Pro`,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return NextResponse.json({
    partner,
    referrals: enrichedReferrals,
    stats: {
      total_referrals: totalReferrals,
      qualified_referrals: qualifiedReferrals,
      pro_months_earned: partner.reward_months_lifetime,
      pro_months_balance: partner.reward_months_balance,
    },
    earnings_history: earningsHistory,
  })
}

/**
 * PATCH /api/partner/me — update own partner profile fields (firm, bar, practice areas)
 */
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowed = ['firm_name', 'bar_number', 'state', 'specialty', 'practice_areas']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) updates[k] = body[k]
  }

  const { data, error } = await supabaseService
    .from('patent_counsel_partners')
    .update(updates)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, partner: data })
}
