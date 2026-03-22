import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'

export const dynamic = 'force-dynamic'

const PLATFORM_FEE_PCT = 0.20  // 20% platform cut

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}
function getServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

/**
 * POST /api/patents/[id]/revenue-events
 * Owner-only. Reports a revenue event and calculates investor distributions.
 * Platform takes 20% off the top before investor distributions.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()

  // Verify ownership
  const { data: patent } = await supabase
    .from('patents')
    .select('id, title, owner_id')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  let body: { event_type?: string; gross_amount_cents?: number; description?: string; confirmed?: boolean } = {}
  try { body = await req.json() } catch { /* empty */ }

  const validTypes = ['license','sale','settlement','royalty','other']
  if (!body.event_type || !validTypes.includes(body.event_type)) {
    return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
  }
  if (!body.gross_amount_cents || body.gross_amount_cents < 100) {
    return NextResponse.json({ error: 'gross_amount_cents must be >= 100' }, { status: 400 })
  }
  if (!body.confirmed) {
    return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
  }

  const grossCents = Math.round(body.gross_amount_cents)

  // ── Insert revenue event ──────────────────────────────────────────────────
  const { data: revenueEvent, error: revErr } = await supabase
    .from('patent_revenue_events')
    .insert({
      patent_id:       patentId,
      reported_by:     user.id,
      event_type:      body.event_type,
      gross_amount_usd: grossCents,
      description:     body.description ?? null,
    })
    .select('id')
    .single()

  if (revErr || !revenueEvent) {
    return NextResponse.json({ error: 'Failed to save revenue event' }, { status: 500 })
  }

  // ── Fetch confirmed investors ─────────────────────────────────────────────
  const { data: investments } = await supabase
    .from('patent_investments')
    .select('id, investor_user_id, rev_share_pct, amount_usd')
    .eq('patent_id', patentId)
    .eq('status', 'confirmed')

  if (!investments?.length) {
    return NextResponse.json({ success: true, revenue_event_id: revenueEvent.id, distributions: [] })
  }

  // ── Calculate distributions (after 20% platform fee) ─────────────────────
  const netAfterFee = Math.floor(grossCents * (1 - PLATFORM_FEE_PCT))
  const platformFee = grossCents - netAfterFee

  const distributions = investments.map(inv => ({
    revenue_event_id:  revenueEvent.id,
    patent_id:         patentId,
    investor_user_id:  inv.investor_user_id,
    amount_usd:        Math.floor(netAfterFee * (Number(inv.rev_share_pct) / 100)),
    status:            'pending' as const,
  }))

  const { error: distErr } = await supabase
    .from('patent_distributions')
    .insert(distributions)

  if (distErr) {
    console.error('[revenue-events] distribution insert failed:', distErr)
  }

  // ── Email each investor ───────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  for (const dist of distributions) {
    try {
      // Get investor email
      const { data: profile } = await supabase
        .from('patent_profiles')
        .select('email, full_name')
        .eq('id', dist.investor_user_id)
        .single()

      if (!profile?.email) continue

      const firstName = profile.full_name?.split(' ')[0] ?? 'Investor'
      const amtDisplay = `$${(dist.amount_usd / 100).toFixed(2)}`
      const grossDisplay = `$${(grossCents / 100).toLocaleString()}`

      await sendEmail(buildEmail({
        to: profile.email,
        from: FROM_DEFAULT,
        subject: `💰 Revenue reported on ${patent.title}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2>Revenue Update — ${patent.title}</h2>
  <p>Hi ${firstName},</p>
  <p>The patent owner has reported a new revenue event:</p>
  <ul>
    <li><strong>Event:</strong> ${body.event_type}</li>
    <li><strong>Gross amount:</strong> ${grossDisplay}</li>
    ${body.description ? `<li><strong>Details:</strong> ${body.description}</li>` : ''}
  </ul>
  <p>After the platform fee (20%), your share is: <strong>${amtDisplay}</strong></p>
  <p style="color:#6b7280;font-size:14px">Distribution status: <strong>Pending</strong>. You'll receive another email when payment is processed.</p>
  <a href="${appUrl}/dashboard/investments" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px">View your portfolio →</a>
</div>`,
      }))
    } catch (e) {
      console.error('[revenue-events] investor email failed (non-fatal):', e)
    }
  }

  return NextResponse.json({
    success:          true,
    revenue_event_id: revenueEvent.id,
    gross_cents:      grossCents,
    platform_fee_cents: platformFee,
    net_to_investors: netAfterFee,
    distributions:    distributions.length,
  })
}
