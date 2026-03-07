import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

function genReferralCode(name: string): string {
  const prefix = name.split(' ')[0].toUpperCase().slice(0, 6).replace(/[^A-Z]/g, '')
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `${prefix}-${suffix}`
}

/**
 * GET /api/partners — public directory of approved partners (for /find-counsel)
 * Auth optional — authed Pro users see contact info
 */
export async function GET(req: NextRequest) {
  const { data, error } = await supabaseService
    .from('patent_counsel_partners')
    .select('id, full_name, firm_name, state, specialty, email, referral_code')
    .eq('is_active', true)
    .eq('status', 'approved')
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ partners: data ?? [] })
}

/**
 * POST /api/partners — submit application (public, no auth required)
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { full_name, firm_name, bar_number, state, specialty, email } = body

  if (!full_name || !firm_name || !bar_number || !state || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const referral_code = genReferralCode(full_name)

  const { data, error } = await supabaseService
    .from('patent_counsel_partners')
    .insert({ full_name, firm_name, bar_number, state, specialty, email, referral_code, status: 'pending' })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Application already submitted for this email' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notify admin
  if (process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'PatentPending <notifications@patentpending.app>',
        to: ['support@hotdeck.com'],
        subject: `New Counsel Partner Application: ${full_name} — ${firm_name}`,
        html: `<p><strong>New partner application submitted.</strong></p>
<ul>
<li>Name: ${full_name}</li>
<li>Firm: ${firm_name}</li>
<li>Bar #: ${bar_number}</li>
<li>State: ${state}</li>
<li>Specialty: ${specialty ?? 'Not specified'}</li>
<li>Email: ${email}</li>
<li>Referral code reserved: ${referral_code}</li>
</ul>
<p><a href="https://patentpending.app/admin">Review in Admin → Partners</a></p>`,
      }),
    })
  }

  return NextResponse.json({ ok: true, referral_code, message: 'Application submitted. We\'ll review and be in touch within 1-2 business days.' })
}
