import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService.from('patent_profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

const WELCOME_EMAIL_HTML = (name: string, code: string, appUrl: string) => `
<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1a2e;line-height:1.7">
  <div style="border-bottom:2px solid #4f46e5;padding-bottom:16px;margin-bottom:28px">
    <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">PatentPending Partner Program</div>
    <div style="font-size:22px;font-weight:700;color:#1a1a2e">Welcome, ${name.split(' ')[0]}.</div>
  </div>

  <p>Your application to the PatentPending Partner Program has been approved. We're glad to have you.</p>

  <p>Here's what you need to know to get started:</p>

  <div style="background:#f8f8ff;border-left:3px solid #4f46e5;padding:16px 20px;margin:20px 0;border-radius:0 8px 8px 0">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px">Your Referral Link</div>
    <div style="font-family:monospace;font-size:14px;color:#4f46e5;word-break:break-all">${appUrl}/signup?ref=${code}</div>
    <div style="margin-top:8px;font-size:13px;color:#374151">Share this link with prospects, put it in your email signature, or mention it to clients who are filing provisionals.</div>
  </div>

  <div style="margin:24px 0">
    <div style="font-weight:700;margin-bottom:8px">How earnings work</div>
    <p style="font-size:14px;color:#374151">When a client you refer completes a paid patent filing, you earn <strong>3 months of PatentPending Pro</strong> — automatically, no invoicing required. Pro access unlocks our AI claims tools, deep research passes, and figure generation. Right now Pro runs at $149/month, so 3 months is real money.</p>
  </div>

  <div style="margin:24px 0">
    <div style="font-weight:700;margin-bottom:8px">What your clients get</div>
    <ul style="font-size:14px;color:#374151;padding-left:20px">
      <li>AI-assisted provisional patent preparation</li>
      <li>Claims drafting, prior art research, USPTO figure generation</li>
      <li>Full filing checklist and cover sheet tools</li>
      <li>Direct line to patent counsel (you) for anything needing an attorney</li>
    </ul>
  </div>

  <div style="background:#fffbeb;border:1px solid #d97706;border-radius:8px;padding:16px;margin:24px 0">
    <div style="font-weight:700;color:#92400e;font-size:13px;margin-bottom:4px">⚡ Arc 3 Revenue Share — Coming Soon</div>
    <p style="font-size:13px;color:#78350f;margin:0">Every patent filed through your referral link participates in our licensing marketplace. Revenue share for partners on licensing deals is in development — partners who are active before launch will be first in line.</p>
  </div>

  <div style="margin:28px 0">
    <a href="${appUrl}/dashboard/partners" style="display:inline-block;background:#4f46e5;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Open Partner Dashboard →</a>
  </div>

  <p>If you have questions — about a specific client situation, a referral that isn't tracking, or anything else — just reply to this email. You'll reach me directly.</p>

  <p style="margin-top:32px">Chad Bostwick<br>
  <span style="color:#6b7280;font-size:13px">PatentPending.app · Hot Hands LLC</span></p>

  <div style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:16px;font-size:11px;color:#9ca3af">
    PatentPending.app is not a law firm and does not provide legal advice. Partner referrals are earned on completed paid filings after a 48-hour refund window. Pro months have no cash value.
  </div>
</div>`

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const status = new URL(req.url).searchParams.get('status') ?? undefined
  let query = supabaseService.from('patent_counsel_partners').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ partners: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const adminUser = await requireAdmin(req)
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, action, notes, pro_months_per_referral, bar_verified } = body
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  const now = new Date().toISOString()
  let update: Record<string, unknown> = { updated_at: now }

  if (action === 'approve') {
    update = { ...update, status: 'approved', is_active: true, approved_by: adminUser.email, approved_at: now }
    // Send welcome email (idempotent — check welcome_email_sent first)
    const { data: partner } = await supabaseService.from('patent_counsel_partners')
      .select('email, full_name, referral_code, welcome_email_sent').eq('id', id).single()
    if (partner && !partner.welcome_email_sent) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Chad at PatentPending <notifications@patentpending.app>',
          to: [partner.email],
          subject: 'Welcome to the PatentPending Partner Program',
          html: WELCOME_EMAIL_HTML(partner.full_name, partner.referral_code, appUrl),
        }),
      }).catch(e => console.error('[admin/partners] welcome email failed:', e))
      update.welcome_email_sent = true
    }
  } else if (action === 'reject') {
    update = { ...update, status: 'rejected', is_active: false, notes: notes ?? null }
  } else if (action === 'extend_pro') {
    const { data: curr } = await supabaseService.from('patent_counsel_partners')
      .select('pro_expiry').eq('id', id).single()
    const base = curr?.pro_expiry ? new Date(curr.pro_expiry) : new Date()
    if (base < new Date()) base.setTime(new Date().getTime())
    base.setMonth(base.getMonth() + 1)
    update.pro_expiry = base.toISOString()
  } else if (action === 'edit') {
    if (pro_months_per_referral !== undefined) update.pro_months_per_referral = pro_months_per_referral
    if (bar_verified !== undefined) {
      update.bar_verified = bar_verified
      if (bar_verified) update.bar_verified_at = now
    }
    if (notes !== undefined) update.notes = notes
  }

  const { data, error } = await supabaseService.from('patent_counsel_partners')
    .update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, partner: data })
}
