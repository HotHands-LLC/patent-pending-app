import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'


const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

/**
 * Called when a patent transitions to filed status.
 * Checks if the patent owner was referred, and if so qualifies + rewards the referral.
 * Uses service role — call from server only.
 */
export async function maybeQualifyReferral(
  patentId: string,
  ownerId: string,
  filedAt: string
): Promise<void> {
  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )

  // Check if owner was referred
  const { data: ownerProfile } = await supabase
    .from('patent_profiles')
    .select('referred_by_code, referred_by_partner_id, email, full_name, name_first, name_last')
    .eq('id', ownerId)
    .single()

  if (!ownerProfile?.referred_by_partner_id) return

  const partnerId = ownerProfile.referred_by_partner_id
  const referralCode = ownerProfile.referred_by_code

  // 48-hour buffer from filing date
  const filedDate = new Date(filedAt)
  const qualifyAfter = new Date(filedDate.getTime() + 48 * 60 * 60 * 1000)
  if (new Date() < qualifyAfter) {
    console.log(`[referral] Partner referral pending 48hr buffer. Will qualify after ${qualifyAfter.toISOString()}`)
    // In production: schedule a background job. For now, qualify immediately if filing confirmed.
    // TODO: add a cron job to check pending referrals after 48hr
  }

  // Check if referral already exists / was already rewarded
  const { data: existing } = await supabase
    .from('partner_referrals')
    .select('id, status')
    .eq('partner_id', partnerId)
    .eq('referred_user_id', ownerId)
    .single()

  if (existing?.status === 'rewarded' || existing?.status === 'qualified') return

  const now = new Date().toISOString()

  // Get partner's pro_months_per_referral
  const { data: pp } = await supabase
    .from('partner_profiles')
    .select('id, pro_months_per_referral, reward_months_balance, reward_months_lifetime, status')
    .eq('counsel_partner_id', partnerId)
    .single()

  const rewardMonths = pp?.pro_months_per_referral ?? 3

  // Create or update referral record → qualified + rewarded
  if (existing?.id) {
    await supabase.from('partner_referrals').update({
      status: 'rewarded',
      patent_id: patentId,
      filing_completed_at: filedAt,
      reward_type: 'pro_months',
      reward_months: rewardMonths,
      reward_granted_at: now,
    }).eq('id', existing.id)
  } else {
    await supabase.from('partner_referrals').insert({
      partner_id: partnerId,
      partner_profile_id: pp?.id ?? null,
      referred_user_id: ownerId,
      referral_code: referralCode ?? '',
      status: 'rewarded',
      patent_id: patentId,
      filing_completed_at: filedAt,
      reward_type: 'pro_months',
      reward_months: rewardMonths,
      reward_granted_at: now,
    })
  }

  // Update partner_profile reward balances
  if (pp?.id) {
    const newBalance  = (pp.reward_months_balance ?? 0) + rewardMonths
    const newLifetime = (pp.reward_months_lifetime ?? 0) + rewardMonths
    await supabase.from('partner_profiles').update({
      reward_months_balance: newBalance,
      reward_months_lifetime: newLifetime,
      updated_at: now,
    }).eq('id', pp.id)
  }

  // Extend partner's Pro subscription
  const { data: partnerCounsel } = await supabase
    .from('patent_counsel_partners')
    .select('email, full_name, firm_name')
    .eq('id', partnerId)
    .single()

  // Find partner's user account (if linked)
  const { data: partnerUser } = await supabase
    .from('partner_profiles')
    .select('user_id')
    .eq('id', pp?.id ?? '')
    .single()

  if (partnerUser?.user_id) {
    const { data: userProfile } = await supabase
      .from('patent_profiles')
      .select('subscription_status, subscription_period_end')
      .eq('id', partnerUser.user_id)
      .single()

    if (userProfile?.subscription_status !== 'complimentary') {
      const base = userProfile?.subscription_period_end
        ? new Date(userProfile.subscription_period_end)
        : new Date()
      if (base < new Date()) base.setTime(new Date().getTime())
      base.setMonth(base.getMonth() + rewardMonths)
      await supabase.from('patent_profiles').update({
        subscription_status: 'pro',
        subscription_period_end: base.toISOString(),
        updated_at: now,
      }).eq('id', partnerUser.user_id)
    }
  }

  // Notify partner by email
  if (partnerCounsel?.email) {
    const clientName = [ownerProfile.name_first, ownerProfile.name_last]
      .filter(Boolean).join(' ') || ownerProfile.email || 'your referred client'
    const partnerFirst = (partnerCounsel.full_name ?? '').split(' ')[0] || 'there'
    await sendEmail(buildEmail({
      to: partnerCounsel.email,
      from: FROM_DEFAULT,
      subject: `Referral qualified — you earned ${rewardMonths} months Pro`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#1a1f36">A referral has qualified 🎉</h2>
  <p>Hi ${partnerFirst},</p>
  <p><strong>${clientName}</strong> completed their patent filing through your referral link.</p>
  <p>As a result, <strong>${rewardMonths} months of PatentPending Pro</strong> have been added to your account.</p>
  <p><a href="${APP_URL}/dashboard/partners" style="display:inline-block;background:#1a1f36;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Partner Dashboard →</a></p>
  <p style="font-size:13px;color:#6b7280;margin-top:24px">Questions? Reply to this email or contact <a href="mailto:support@hotdeck.com">support@hotdeck.com</a>.</p>
</div>`,
    })).catch(e => console.error('[referral] notification email failed:', e))
  }

  console.log(`[referral] ✅ Qualified: partner=${partnerId} user=${ownerId} patent=${patentId} reward=${rewardMonths}mo`)
}
