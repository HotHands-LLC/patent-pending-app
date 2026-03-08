import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/partner/validate-code?code=SARAH-X7K2
 * Public endpoint — validates a referral code and returns partner info for trust badge.
 * Returns 404 if code not found or partner not active.
 */
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')?.toUpperCase().trim()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const { data } = await supabase
    .from('patent_counsel_partners')
    .select('id, firm_name, status, referral_code')
    .eq('referral_code', code)
    .in('status', ['pending', 'approved'])  // allow pending so signup works during review
    .single()

  if (!data) return NextResponse.json({ valid: false }, { status: 404 })

  return NextResponse.json({
    valid: true,
    partner_id: data.id,
    display_name: data.firm_name || 'a PatentPending Partner',
    referral_code: data.referral_code,
  })
}
