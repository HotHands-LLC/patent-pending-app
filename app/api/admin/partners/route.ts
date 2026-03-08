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

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService
    .from('patent_profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Chad at PatentPending <notifications@patentpending.app>',
      to: [to],
      subject,
      html,
    }),
  })
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

function buildWelcomeEmail(partnerName: string, referralCode: string, firmName: string | null): string {
  const firstName = partnerName.split(' ')[0]
  const link = `${APP_URL}/signup?ref=${referralCode}`
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6">
  <h2 style="color:#1a1f36;margin-bottom:4px">Welcome to the PatentPending Partner Program, ${firstName}</h2>
  <p style="color:#6b7280;margin-top:0;margin-bottom:24px;font-size:14px">We're glad to have you.</p>

  <p>Your application has been approved. Here's everything you need to get started.</p>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin:24px 0">
    <p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280">Your Partner Details</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 0;color:#6b7280;width:140px">Referral Code</td>
          <td><code style="background:#1a1f36;color:#f5a623;padding:3px 8px;border-radius:4px;font-size:13px">${referralCode}</code></td></tr>
      ${firmName ? `<tr><td style="padding:4px 0;color:#6b7280">Firm</td><td style="font-weight:500">${firmName}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:#6b7280">Reward</td>
          <td style="font-weight:500">3 months Pro per completed client filing</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280">Referral Link</td>
          <td><a href="${link}" style="color:#4f46e5;word-break:break-all;font-size:13px">${link}</a></td></tr>
    </table>
  </div>

  <h3 style="color:#1a1f36">How it works</h3>
  <ol style="padding-left:20px;font-size:14px">
    <li style="margin-bottom:8px"><strong>Share your link</strong> — Send ${link} to clients who need a patent filed. They sign up, you get credit automatically.</li>
    <li style="margin-bottom:8px"><strong>They file, you earn</strong> — When a referred client completes a paid filing (confirmation number received), you earn 3 months of PatentPending Pro.</li>
    <li style="margin-bottom:8px"><strong>Track everything</strong> — Your partner dashboard shows referral status, patent progress, and earnings in real time.</li>
  </ol>

  <div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:16px;margin:24px 0">
    <p style="margin:0;font-size:14px">
      <strong>🚀 Arc 3 Revenue Share — Coming Soon</strong><br>
      Every patent filed through your referral link participates in the PatentPending licensing marketplace.
      Partner revenue share on licensing deals is on the way. You're in early.
    </p>
  </div>

  <p style="font-size:14px">Your partnership does not create any attorney-client relationship between your firm and PatentPending.app. Each client you refer remains their own account holder and engages separately with counsel of their choosing.</p>

  <div style="margin:32px 0">
    <a href="${APP_URL}/dashboard/partners" style="display:inline-block;background:#1a1f36;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Open Partner Dashboard →</a>
  </div>

  <p style="font-size:13px;color:#6b7280">Questions? Reply to this email or write directly to <a href="mailto:support@hotdeck.com" style="color:#4f46e5">support@hotdeck.com</a>.<br>
  — Chad Bostwick, Hot Hands LLC / PatentPending.app</p>

  <p style="font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:12px;margin-top:24px">
    PatentPending.app is not a law firm. Referral partnership does not constitute legal practice or create an attorney-client relationship between partners and PatentPending or its users.
  </p>
</div>`
}

/** GET /api/admin/partners — list all applications with partner_profile data */
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined

  let query = supabaseService
    .from('patent_counsel_partners')
    .select(`
      *,
      partner_profile:partner_profiles!partner_profiles_counsel_partner_id_fkey (
        id, status, partner_code, reward_months_balance, reward_months_lifetime,
        pro_months_per_referral, bar_verified, welcome_email_sent, notes
      )
    `)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status as string)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get referral counts per partner
  const { data: refCounts } = await supabaseService
    .from('partner_referrals')
    .select('partner_id, status')

  const countsByPartner: Record<string, { total: number; qualified: number; rewarded: number }> = {}
  for (const r of refCounts ?? []) {
    if (!countsByPartner[r.partner_id]) countsByPartner[r.partner_id] = { total: 0, qualified: 0, rewarded: 0 }
    countsByPartner[r.partner_id].total++
    if (r.status === 'qualified') countsByPartner[r.partner_id].qualified++
    if (r.status === 'rewarded') countsByPartner[r.partner_id].rewarded++
  }

  const enriched = (data ?? []).map(p => ({
    ...p,
    referral_counts: countsByPartner[p.id] ?? { total: 0, qualified: 0, rewarded: 0 },
  }))

  return NextResponse.json({ partners: enriched })
}

/** PATCH /api/admin/partners — approve/suspend/update partner */
export async function PATCH(req: NextRequest) {
  const adminUser = await requireAdmin(req)
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    id,              // patent_counsel_partners.id
    action,          // 'approve' | 'suspend' | 'reject' | 'update'
    notes,
    bar_verified,
    pro_months_per_referral,
    send_welcome,
  } = body

  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 })

  const { data: partner } = await supabaseService
    .from('patent_counsel_partners')
    .select('*, partner_profile:partner_profiles!partner_profiles_counsel_partner_id_fkey(*)')
    .eq('id', id)
    .single()

  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  const now = new Date().toISOString()

  if (action === 'approve') {
    // Update counsel_partners status
    await supabaseService.from('patent_counsel_partners')
      .update({ status: 'approved', is_active: true, notes: notes ?? partner.notes })
      .eq('id', id)

    // Update or create partner_profile
    const ppId = (partner.partner_profile as any)?.id
    const ppUpdate = {
      status: 'active',
      approved_by: adminUser.id,
      approved_at: now,
      updated_at: now,
      ...(bar_verified !== undefined && { bar_verified }),
      ...(bar_verified && { bar_verified_at: now }),
      ...(pro_months_per_referral && { pro_months_per_referral }),
      ...(notes && { notes }),
    }

    if (ppId) {
      await supabaseService.from('partner_profiles').update(ppUpdate).eq('id', ppId)
    } else {
      await supabaseService.from('partner_profiles').insert({
        counsel_partner_id: id,
        partner_code: partner.referral_code,
        firm_name: partner.firm_name,
        bar_id: partner.bar_number,
        bar_state: partner.state,
        practice_areas: ['trademark', 'IP'],
        ...ppUpdate,
      })
    }

    // Send welcome email if not yet sent
    const alreadySent = (partner.partner_profile as any)?.welcome_email_sent
    if ((!alreadySent || send_welcome) && partner.email) {
      const html = buildWelcomeEmail(partner.full_name, partner.referral_code, partner.firm_name)
      await sendEmail(partner.email,
        'Welcome to the PatentPending Partner Program',
        html
      )
      const ppId2 = (partner.partner_profile as any)?.id
      if (ppId2) {
        await supabaseService.from('partner_profiles')
          .update({ welcome_email_sent: true }).eq('id', ppId2)
      }
    }

    return NextResponse.json({ ok: true, action: 'approved', welcome_sent: !alreadySent || send_welcome })
  }

  if (action === 'suspend') {
    await supabaseService.from('patent_counsel_partners')
      .update({ status: 'suspended', is_active: false, notes: notes ?? partner.notes }).eq('id', id)
    const ppId = (partner.partner_profile as any)?.id
    if (ppId) await supabaseService.from('partner_profiles')
      .update({ status: 'suspended', updated_at: now }).eq('id', ppId)
    return NextResponse.json({ ok: true, action: 'suspended' })
  }

  if (action === 'reject') {
    await supabaseService.from('patent_counsel_partners')
      .update({ status: 'rejected', is_active: false, notes: notes ?? partner.notes }).eq('id', id)
    return NextResponse.json({ ok: true, action: 'rejected' })
  }

  if (action === 'update') {
    const ppUpdate: Record<string, unknown> = { updated_at: now }
    if (notes !== undefined) ppUpdate.notes = notes
    if (bar_verified !== undefined) { ppUpdate.bar_verified = bar_verified; if (bar_verified) ppUpdate.bar_verified_at = now }
    if (pro_months_per_referral !== undefined) ppUpdate.pro_months_per_referral = pro_months_per_referral

    const ppId = (partner.partner_profile as any)?.id
    if (ppId) await supabaseService.from('partner_profiles').update(ppUpdate).eq('id', ppId)
    return NextResponse.json({ ok: true, action: 'updated' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
