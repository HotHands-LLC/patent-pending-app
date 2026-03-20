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

/**
 * POST /api/partner/record-attorney-referral
 *
 * Called from the auth callback page after a user signs up via a ?ref= link.
 * Reads the httpOnly `ppa_ref` cookie (set by middleware) and creates an
 * attorney_partners referral_attribution row.
 *
 * Idempotent — safe to call multiple times due to UNIQUE constraint.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Read the httpOnly referral cookie
  const refCode = req.cookies.get('ppa_ref')?.value
  if (!refCode) {
    // No cookie — nothing to do
    return NextResponse.json({ ok: true, no_ref: true })
  }

  const supabase = createServiceClient()

  // Look up active attorney partner by referral_code
  const { data: partner } = await supabase
    .from('attorney_partners')
    .select('id')
    .eq('referral_code', refCode)
    .eq('status', 'active')
    .single()

  if (!partner) {
    console.log('[record-attorney-referral] no active partner found for code:', refCode)
    return NextResponse.json({ ok: true, partner_found: false })
  }

  // Upsert attribution — unique constraint on (partner_id, referred_user_id)
  const { error } = await supabase
    .from('referral_attributions')
    .upsert(
      {
        partner_id: partner.id,
        referred_user_id: user.id,
        referral_code: refCode,
        converted_at: new Date().toISOString(),
      },
      { onConflict: 'partner_id,referred_user_id' }
    )

  if (error) {
    console.error('[record-attorney-referral] upsert error:', error.message)
    // Non-fatal — don't block auth flow
  } else {
    console.log(`[record-attorney-referral] attribution recorded: user=${user.id} partner=${partner.id} code=${refCode}`)
  }

  // Build response that clears the cookie
  const res = NextResponse.json({ ok: true, partner_found: true })
  res.cookies.set('ppa_ref', '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  return res
}
