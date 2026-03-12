import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_FILING_STATUSES = ['draft', 'approved', 'filed'] as const

// Fields user is allowed to update via PATCH
const ALLOWED_UPDATE_FIELDS = [
  'filing_status',
  'title',
  'description',
  'provisional_number',
  'application_number',
  'filing_date',
  'provisional_deadline',
  'non_provisional_deadline',
  'inventors',
  'tags',
  'status',
  'asking_price',
  'is_listed',
  'cover_sheet_acknowledged',  // set by client after printing/saving cover sheet
  'spec_draft',               // AI-generated or manually entered spec draft text
  'abstract_draft',          // 150-word abstract — required for non-provisional
  'is_locked',               // patent lock — read-only for everyone when true
] as const

type AllowedField = typeof ALLOWED_UPDATE_FIELDS[number]

// PATCH /api/patents/[id] — update allowed fields
// Auth: Bearer token required; must be patent owner
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = auth.slice(7)

  // Verify user via anon client
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate filing_status if present
  if (body.filing_status !== undefined) {
    if (!ALLOWED_FILING_STATUSES.includes(body.filing_status as typeof ALLOWED_FILING_STATUSES[number])) {
      return NextResponse.json(
        { error: `filing_status must be one of: ${ALLOWED_FILING_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }
  }

  // Build update payload — only allowed fields
  const updates: Partial<Record<AllowedField, unknown>> = {}
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in body) updates[field] = body[field]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Verify ownership
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id')
    .eq('id', id)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await supabaseService
    .from('patents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Task 3: Referral qualifying event ──────────────────────────────────────
  // Fire when filing_status transitions to 'filed' (Step 8/9 — USPTO confirmation)
  if (body.filing_status === 'filed' && patent) {
    waitUntil(checkAndQualifyReferral(id, user.id))
    // GA4 Measurement Protocol — server-side filing_completed event
    waitUntil(trackFilingCompleted(user.id, id))
  }

  return NextResponse.json(updated)
}

// ── Referral qualifying event (async, non-blocking) ────────────────────────
import { waitUntil } from '@vercel/functions'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'

/** GA4 Measurement Protocol — server-side filing_completed event */
async function trackFilingCompleted(userId: string, patentId: string) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  const apiSecret = process.env.GA_API_SECRET
  if (!gaId || !apiSecret) return
  try {
    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${gaId}&api_secret=${apiSecret}`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: userId,
        events: [{ name: 'filing_completed', params: { patent_id: patentId, engagement_time_msec: 1 } }],
      }),
    })
  } catch { /* non-fatal */ }
}

async function checkAndQualifyReferral(patentId: string, ownerId: string) {
  const ownerProfile = await supabaseService
    .from('patent_profiles')
    .select('referred_by_partner_id, referred_by_code, email, name_first, name_last')
    .eq('id', ownerId)
    .single()
    .then(r => r.data)

  if (!ownerProfile?.referred_by_partner_id) return

  const partnerId = ownerProfile.referred_by_partner_id
  const now = new Date().toISOString()

  // Prevent duplicate rewards
  const existing = await supabaseService
    .from('partner_referrals')
    .select('id, status')
    .eq('partner_id', partnerId)
    .eq('referred_user_id', ownerId)
    .single()
    .then(r => r.data)

  if (existing?.status === 'rewarded') return

  // Get partner reward config from partner_profiles
  const pp = await supabaseService
    .from('partner_profiles')
    .select('id, pro_months_per_referral, reward_months_balance, reward_months_lifetime, user_id')
    .eq('counsel_partner_id', partnerId)
    .single()
    .then(r => r.data)

  const rewardMonths = pp?.pro_months_per_referral ?? 3

  // Upsert referral → qualified (NOT rewarded yet — 48hr buffer enforced by cron)
  const ref = {
    partner_id: partnerId, referred_user_id: ownerId,
    referral_code: ownerProfile.referred_by_code ?? '',
    status: 'qualified' as const, patent_id: patentId,
    filing_completed_at: now, reward_type: 'pro_months',
    reward_months: rewardMonths,
    // reward_granted_at intentionally null — cron sets it after 48hr window
    ...(pp?.id && { partner_profile_id: pp.id }),
  }

  if (existing?.id) {
    await supabaseService.from('partner_referrals').update(ref).eq('id', existing.id)
  } else {
    await supabaseService.from('partner_referrals').insert(ref)
  }

  // Email partner: "referral qualified — reward pending 48hr review window"
  const partnerCounsel = await supabaseService
    .from('patent_counsel_partners')
    .select('email, full_name, firm_name')
    .eq('id', partnerId)
    .single()
    .then(r => r.data)

  if (partnerCounsel?.email) {
    const clientName = [ownerProfile.name_first, ownerProfile.name_last].filter(Boolean).join(' ') || 'Your referred client'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
    await sendEmail(buildEmail({
      to: partnerCounsel.email,
      from: FROM_DEFAULT,
      subject: `Referral qualified — ${clientName} filed`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2>Referral qualified ✅</h2>
  <p>Hi ${partnerCounsel.full_name?.split(' ')[0] ?? 'there'},</p>
  <p><strong>${clientName}</strong> completed a patent filing through your referral link.</p>
  <p>Your reward of <strong>${rewardMonths} months Pro</strong> will be credited to your account within 48 hours once the refund window closes.</p>
  <p style="color:#6b7280;font-size:13px">You'll receive a second email confirming the credit once it's applied.</p>
  <p><a href="${appUrl}/dashboard/partners" style="display:inline-block;background:#1a1f36;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Partner Dashboard →</a></p>
</div>`,
    })).catch(console.error)
  }

  console.log(`[referral] ✅ qualified (pending 48hr): partner=${partnerId} user=${ownerId} months=${rewardMonths}`)
}
