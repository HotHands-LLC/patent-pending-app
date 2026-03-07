import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'

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
  const { data: profile } = await supabaseService.from('patent_profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

/** GET /api/admin/accounts — list all users with subscription info */
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseService
    .from('patent_profiles')
    .select('id, email, full_name, company, role, subscription_status, subscription_period_end, comp_reason, comp_granted_by, comp_granted_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

/** PATCH /api/admin/accounts — update tier for a user */
export async function PATCH(req: NextRequest) {
  const adminUser = await requireAdmin(req)
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { user_id, tier, reason, send_notification } = body as {
    user_id: string
    tier: 'free' | 'pro' | 'complimentary'
    reason?: string
    send_notification?: boolean
  }

  if (!user_id || !tier) return NextResponse.json({ error: 'user_id and tier required' }, { status: 400 })
  if (!['free', 'pro', 'complimentary'].includes(tier)) {
    return NextResponse.json({ error: 'tier must be free | pro | complimentary' }, { status: 400 })
  }
  if (tier === 'complimentary' && !reason?.trim()) {
    return NextResponse.json({ error: 'reason required for complimentary tier' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    subscription_status: tier,
    updated_at: now,
  }
  if (tier === 'complimentary') {
    update.comp_reason = reason?.trim()
    update.comp_granted_by = adminUser.email ?? 'admin'
    update.comp_granted_at = now
    update.subscription_period_end = null
  } else if (tier === 'free') {
    update.subscription_period_end = null
    update.comp_reason = null
    update.comp_granted_by = null
    update.comp_granted_at = null
  }

  const { data: profile, error } = await supabaseService
    .from('patent_profiles')
    .update(update)
    .eq('id', user_id)
    .select('email, full_name')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send notification email if requested and upgrading
  if (send_notification && profile?.email && tier !== 'free') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
    const firstName = profile.full_name?.split(' ')[0] ?? 'there'
    try {
      await sendEmail(buildEmail({
        to: profile.email,
        from: FROM_DEFAULT,
        subject: 'Your PatentPending account has been upgraded',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">Your account has been upgraded 🎉</h2>
  <p>Hi ${firstName},</p>
  <p>Your PatentPending account has been upgraded to Pro — compliments of the PatentPending team.</p>
  <ul>
    <li><strong>Deep Research Pass</strong> — prior art analysis to strengthen your claims</li>
    <li><strong>Claude Refinement Pass</strong> — USPTO-precision language polish</li>
    <li><strong>Unlimited revision rounds</strong></li>
    <li><strong>AI Figure Generation</strong> — USPTO-style technical drawings</li>
  </ul>
  <p><a href="${appUrl}/dashboard/patents" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Go to my patents →</a></p>
</div>`,
      }))
    } catch (emailErr) {
      console.error('[admin/accounts] notification email failed:', emailErr)
    }
  }

  return NextResponse.json({ ok: true, user_id, tier, email: profile?.email })
}
