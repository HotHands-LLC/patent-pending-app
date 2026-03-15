import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

/** GET /api/partner/validate-code?code=SARAH-X7K2 */
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ valid: false })

  const { data } = await supabaseService
    .from('patent_counsel_partners')
    .select('id, firm_name, full_name, referral_code, status')
    .eq('referral_code', code.toUpperCase())
    .single()

  if (!data || data.status === 'rejected') return NextResponse.json({ valid: false })

  return NextResponse.json({
    valid: true,
    partner_id: data.id,
    referral_code: data.referral_code,
    display_name: data.firm_name ?? 'a PatentPending Partner',
  })
}
