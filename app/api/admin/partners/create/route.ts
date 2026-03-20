import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

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

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const supabase = createServiceClient()
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('patent_profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

/**
 * POST /api/admin/partners/create
 *
 * Admin-only. Creates a new attorney_partners record and sends a welcome email.
 *
 * Body: { email, firm_name?, referral_code, payout_email? }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { email, firm_name, referral_code, payout_email } = body as {
    email?: string
    firm_name?: string
    referral_code?: string
    payout_email?: string
  }

  if (!email || !referral_code) {
    return NextResponse.json({ error: 'email and referral_code are required' }, { status: 400 })
  }

  // Validate referral_code format
  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(referral_code)) {
    return NextResponse.json(
      { error: 'referral_code must be 2-30 alphanumeric characters (underscores and hyphens allowed)' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // Look up user by email in auth.users (service role)
  const { data: { users }, error: userListError } = await supabase.auth.admin.listUsers()
  if (userListError) {
    return NextResponse.json({ error: `Failed to look up users: ${userListError.message}` }, { status: 500 })
  }

  const targetUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  const userId = targetUser?.id ?? null

  // Check if referral_code is already taken
  const { data: existing } = await supabase
    .from('attorney_partners')
    .select('id')
    .eq('referral_code', referral_code)
    .single()

  if (existing) {
    return NextResponse.json({ error: `Referral code "${referral_code}" is already in use` }, { status: 409 })
  }

  // Insert the partner record
  const { data: partner, error: insertError } = await supabase
    .from('attorney_partners')
    .insert({
      user_id: userId,
      firm_name: firm_name ?? null,
      referral_code: referral_code.toUpperCase(),
      payout_email: payout_email ?? null,
      status: 'active',
      revenue_share_pct: 20.00,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: `Failed to create partner: ${insertError.message}` }, { status: 500 })
  }

  // Send welcome email via Resend (instantiated inside handler)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'
  const referralUrl = `https://patentpending.app/?ref=${referral_code.toUpperCase()}`

  try {
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: "You're now a patentpending.app partner — here's your referral link",
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6">
<p>Welcome to the patentpending.app Partner Program!</p>
<p>Your unique referral link: <strong><a href="${referralUrl}">${referralUrl}</a></strong></p>
<p>Share this link with inventor clients. When they upgrade to Pro ($39/month or $390/year), you earn 20% of their first year's subscription. Marketplace transaction commissions coming soon.</p>
<p>View your dashboard: <a href="https://patentpending.app/dashboard/partner">patentpending.app/dashboard/partner</a></p>
<p>Commissions are paid monthly. Minimum payout: $50. Reply to this email to set up your payout method.</p>
<p>— The patentpending.app team</p>
</div>`,
      })
      console.log(`[admin/partners/create] welcome email sent to ${email}`)
    } else {
      console.warn('[admin/partners/create] RESEND_API_KEY not set — skipping welcome email')
    }
  } catch (emailErr) {
    // Non-fatal — partner is created, just email failed
    console.error('[admin/partners/create] welcome email failed (non-fatal):', emailErr)
  }

  return NextResponse.json({
    ok: true,
    partner,
    user_found: !!userId,
    email_sent: !!process.env.RESEND_API_KEY,
  })
}
