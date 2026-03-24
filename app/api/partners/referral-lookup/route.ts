import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/partners/referral-lookup?code=SARAH-X7K2
 * Public endpoint — validates a referral code and returns safe display info.
 * Used at signup to show trust badge and capture referral.
 */
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ valid: false })

  const { data } = await supabaseService
    .from('patent_counsel_partners')
    .select('id, firm_name, full_name, referral_code, status')
    .eq('referral_code', code.toUpperCase())
    .single()

  if (!data || data.status === 'rejected') {
    return NextResponse.json({ valid: false })
  }

  return NextResponse.json({
    valid: true,
    partner_id: data.id,
    referral_code: data.referral_code,
    // Only expose firm_name (not attorney name) per privacy
    display_name: data.firm_name ?? 'a PatentPending Partner',
  })
}
