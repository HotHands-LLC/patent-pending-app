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
 * POST /api/partner/record-referral
 * Called after email confirmation (auth callback) or immediate signup.
 * Idempotent — safe to call multiple times.
 * Body: { referral_code: string }
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { referral_code, utm_params } = body
  if (!referral_code || typeof referral_code !== 'string') {
    return NextResponse.json({ error: 'referral_code required' }, { status: 400 })
  }

  const code = referral_code.toUpperCase().trim()

  // 1. Check if already recorded
  const { data: profile } = await supabaseService
    .from('patent_profiles')
    .select('referred_by_code, referred_by_partner_id')
    .eq('id', user.id)
    .single()

  if (profile?.referred_by_code) {
    // Already recorded — idempotent success
    return NextResponse.json({ ok: true, already_recorded: true })
  }

  // 2. Look up partner_profiles by code (active partners only)
  const { data: pp } = await supabaseService
    .from('partner_profiles')
    .select('id, partner_code, status, counsel_partner_id')
    .eq('partner_code', code)
    .in('status', ['active', 'pending'])  // allow pending so early referrals are captured
    .single()

  // 3. Write referral to patent_profiles
  await supabaseService
    .from('patent_profiles')
    .update({
      referred_by_code: code,
      ...(pp ? { referred_by_partner_id: pp.counsel_partner_id ?? pp.id } : {}),
    })
    .eq('id', user.id)

  // 4. Create/ensure partner_referrals record (with UTM data if present)
  if (pp?.counsel_partner_id) {
    const utmData = utm_params && typeof utm_params === 'object' ? utm_params : null
    // Also check user_metadata for UTM (survives email confirmation)
    const metaUtm = (user as { user_metadata?: Record<string, unknown> }).user_metadata?.utm_params
    const resolvedUtm = utmData ?? (metaUtm && typeof metaUtm === 'object' ? metaUtm : null)

    await supabaseService
      .from('partner_referrals')
      .upsert(
        {
          partner_id:        pp.counsel_partner_id,
          referred_user_id:  user.id,
          referral_code:     code,
          status:            'pending',
          ...(pp.id && { partner_profile_id: pp.id }),
          ...(resolvedUtm ? { utm_data: resolvedUtm } : {}),
        },
        { onConflict: 'partner_id,referred_user_id', ignoreDuplicates: true }
      )
  }

  console.log(`[referral] recorded: user=${user.id} code=${code} partner=${pp?.counsel_partner_id ?? 'unknown'}`)
  return NextResponse.json({ ok: true, partner_found: !!pp })
}
