import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function createServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

function obfuscateEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***@***.***'
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}***@${domain}`
}

/**
 * GET /api/dashboard/partner/referred-users
 * Returns pre-obfuscated referred user data for the authenticated partner.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userClient = getUserClient(auth.slice(7))
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  // Get the partner record
  const { data: partner } = await supabase
    .from('attorney_partners')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!partner) {
    return NextResponse.json({ error: 'Not a partner' }, { status: 403 })
  }

  // Get all attributions for this partner
  const { data: attributions, error } = await supabase
    .from('referral_attributions')
    .select('id, referred_user_id, referral_code, converted_at, first_paid_at, created_at')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch emails for all referred users (service role can access auth.users via admin API)
  const userIds = (attributions ?? [])
    .map(a => a.referred_user_id)
    .filter(Boolean) as string[]

  const emailMap: Record<string, string> = {}
  if (userIds.length > 0) {
    // Use patent_profiles which stores email
    const { data: profiles } = await supabase
      .from('patent_profiles')
      .select('id, email')
      .in('id', userIds)

    for (const p of profiles ?? []) {
      if (p.email) emailMap[p.id] = p.email
    }
  }

  const result = (attributions ?? []).map(a => ({
    id: a.id,
    obfuscated_email: a.referred_user_id && emailMap[a.referred_user_id]
      ? obfuscateEmail(emailMap[a.referred_user_id])
      : 'user@***',
    signup_date: a.converted_at ?? a.created_at,
    is_paid: !!a.first_paid_at,
    first_paid_at: a.first_paid_at,
  }))

  return NextResponse.json({ users: result })
}
