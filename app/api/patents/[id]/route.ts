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

  // Upsert referral → rewarded
  const ref = { partner_id: partnerId, referred_user_id: ownerId,
    referral_code: ownerProfile.referred_by_code ?? '',
    status: 'rewarded' as const, patent_id: patentId,
    filing_completed_at: now, reward_type: 'pro_months',
    reward_months: rewardMonths, reward_granted_at: now,
    ...(pp?.id && { partner_profile_id: pp.id }) }

  if (existing?.id) {
    await supabaseService.from('partner_referrals').update(ref).eq('id', existing.id)
  } else {
    await supabaseService.from('partner_referrals').insert(ref)
  }

  // Update partner_profiles reward balance
  if (pp?.id) {
    await supabaseService.from('partner_profiles').update({
      reward_months_balance: (pp.reward_months_balance ?? 0) + rewardMonths,
      reward_months_lifetime: (pp.reward_months_lifetime ?? 0) + rewardMonths,
      updated_at: now,
    }).eq('id', pp.id)
  }

  // Extend partner's Pro subscription if they have a user account
  if (pp?.user_id) {
    const partnerUserProfile = await supabaseService
      .from('patent_profiles')
      .select('subscription_status, subscription_period_end')
      .eq('id', pp.user_id)
      .single()
      .then(r => r.data)

    if (partnerUserProfile?.subscription_status !== 'complimentary') {
      const base = partnerUserProfile?.subscription_period_end
        ? new Date(partnerUserProfile.subscription_period_end)
        : new Date()
      if (base < new Date()) base.setTime(Date.now())
      base.setMonth(base.getMonth() + rewardMonths)
      await supabaseService.from('patent_profiles').update({
        subscription_status: 'pro',
        subscription_period_end: base.toISOString(),
        updated_at: now,
      }).eq('id', pp.user_id)
    }
  }

  // Email partner (via patent_counsel_partners which has the contact email)
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
      subject: `You earned ${rewardMonths} months Pro — ${clientName} filed`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2>Referral qualified 🎉</h2>
  <p>Hi ${partnerCounsel.full_name?.split(' ')[0] ?? 'there'},</p>
  <p><strong>${clientName}</strong> completed a patent filing through your referral link.</p>
  <p><strong>${rewardMonths} months of Pro</strong> have been added to your account.</p>
  <p><a href="${appUrl}/dashboard/partners" style="display:inline-block;background:#1a1f36;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Partner Dashboard →</a></p>
</div>`,
    })).catch(console.error)
  }

  console.log(`[referral] ✅ rewarded: partner=\${partnerId} user=\${ownerId} months=\${rewardMonths}`)
}
