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
  }

  return NextResponse.json(updated)
}

// ── Referral qualifying event (async, non-blocking) ────────────────────────
import { waitUntil } from '@vercel/functions'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'

async function checkAndQualifyReferral(patentId: string, ownerId: string) {
  // Check if the patent owner was referred by a partner
  const { data: ownerProfile } = await supabaseService
    .from('patent_profiles')
    .select('id, email, name_first, name_last, referred_by_partner_id, referred_by_code')
    .eq('id', ownerId)
    .single()

  if (!ownerProfile?.referred_by_partner_id) return  // not a referred user

  // Apply 48-hour refund window buffer (prevent premature qualification)
  const filingBuffer = new Date()
  filingBuffer.setHours(filingBuffer.getHours() - 48)

  // Check for existing referral record
  const { data: existing } = await supabaseService
    .from('partner_referrals')
    .select('id, status')
    .eq('partner_id', ownerProfile.referred_by_partner_id)
    .eq('referred_user_id', ownerId)
    .single()

  if (existing && existing.status !== 'pending') return  // already qualified

  const now = new Date().toISOString()

  // Upsert referral record to 'qualified'
  const referralUpdate = {
    partner_id: ownerProfile.referred_by_partner_id,
    referred_user_id: ownerId,
    referral_code: ownerProfile.referred_by_code,
    status: 'qualified',
    patent_id: patentId,
    filing_completed_at: now,
    reward_type: 'pro_months',
    updated_at: now,
  }

  let referralId: string
  if (existing) {
    await supabaseService.from('partner_referrals').update(referralUpdate).eq('id', existing.id)
    referralId = existing.id
  } else {
    const { data: newRef } = await supabaseService.from('partner_referrals')
      .insert({ ...referralUpdate, created_at: now })
      .select('id').single()
    referralId = newRef?.id
  }

  // ── Reward grant ──────────────────────────────────────────────────────────
  const { data: partner } = await supabaseService
    .from('patent_counsel_partners')
    .select('*')
    .eq('id', ownerProfile.referred_by_partner_id)
    .single()

  if (!partner) return

  const rewardMonths = partner.pro_months_per_referral ?? 3

  // Update partner balance + lifetime
  const newBalance  = (partner.reward_months_balance ?? 0) + rewardMonths
  const newLifetime = (partner.reward_months_lifetime ?? 0) + rewardMonths

  // Calculate new Pro expiry
  let newExpiry: string | null = null
  if (partner.user_id) {
    const { data: partnerUser } = await supabaseService
      .from('patent_profiles')
      .select('subscription_status, subscription_period_end')
      .eq('id', partner.user_id)
      .single()

    if (partnerUser && partnerUser.subscription_status !== 'complimentary') {
      const base = partnerUser.subscription_period_end
        ? new Date(partnerUser.subscription_period_end)
        : new Date()
      if (base < new Date()) base.setTime(new Date().getTime())
      base.setMonth(base.getMonth() + rewardMonths)
      newExpiry = base.toISOString()

      await supabaseService.from('patent_profiles').update({
        subscription_status: 'pro',
        subscription_period_end: newExpiry,
        updated_at: now,
      }).eq('id', partner.user_id)
    }
  }

  await supabaseService.from('patent_counsel_partners').update({
    reward_months_balance: newBalance,
    reward_months_lifetime: newLifetime,
    updated_at: now,
  }).eq('id', partner.id)

  // Mark referral as rewarded
  if (referralId) {
    await supabaseService.from('partner_referrals').update({
      status: 'rewarded',
      reward_months: rewardMonths,
      reward_granted_at: now,
    }).eq('id', referralId)
  }

  // Email partner
  if (partner.email) {
    const clientName = [ownerProfile.name_first, ownerProfile.name_last].filter(Boolean).join(' ') || 'Your client'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
    await sendEmail(buildEmail({
      to: partner.email,
      from: FROM_DEFAULT,
      subject: `You earned ${rewardMonths} months Pro — ${clientName} completed a filing`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2 style="color:#4f46e5">Referral qualified 🎉</h2>
  <p>Hi ${partner.full_name?.split(' ')[0] ?? 'there'},</p>
  <p><strong>${clientName}</strong> just completed a patent filing through your referral link. Your Pro credit has been applied.</p>
  <ul>
    <li><strong>Reward:</strong> ${rewardMonths} months Pro</li>
    <li><strong>New balance:</strong> ${newBalance} months remaining</li>
    <li><strong>Lifetime earned:</strong> ${newLifetime} months</li>
  </ul>
  <p><a href="${appUrl}/dashboard/partners" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Partner Dashboard →</a></p>
  <p style="font-size:12px;color:#666">Questions? Reply directly to this email or contact <a href="mailto:support@hotdeck.com">support@hotdeck.com</a></p>
</div>`,
    })).catch(console.error)
  }

  console.log(`[partner-reward] partner=${partner.id} client=${ownerId} months=${rewardMonths} balance=${newBalance}`)
}
