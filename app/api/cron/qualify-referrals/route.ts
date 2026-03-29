import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/cron/qualify-referrals
 * Runs every 6 hours via Vercel cron.
 * Finds referrals in 'qualified' status where filing_completed_at < now() - 48 hours.
 * Grants reward: adds pro months to partner balance, extends subscription, marks 'rewarded'.
 * Sends "reward granted" email to partner.
 */
export async function GET(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  // Find qualified referrals older than 48 hours
  const { data: referrals, error } = await supabaseService
    .from('partner_referrals')
    .select(`
      id, partner_id, referred_user_id, referral_code, reward_months, patent_id,
      filing_completed_at,
      partner_profile:partner_profiles!partner_referrals_partner_profile_id_fkey (
        id, user_id, reward_months_balance, reward_months_lifetime, pro_months_per_referral
      )
    `)
    .eq('status', 'qualified')
    .lt('filing_completed_at', cutoff)
    .order('filing_completed_at', { ascending: true })
    .limit(50)  // batch safety

  if (error) {
    console.error('[cron/qualify-referrals] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!referrals || referrals.length === 0) {
    console.log('[cron/qualify-referrals] No referrals to process')
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let processed = 0
  let failed = 0
  const results: Array<{ id: string; partner_id: string; months: number; status: 'ok' | 'error' }> = []

  for (const ref of referrals) {
    try {
      const rewardMonths = ref.reward_months ?? (ref.partner_profile as any)?.pro_months_per_referral ?? 3
      const pp = ref.partner_profile as any
      const now = new Date().toISOString()

      // 1. Mark as rewarded
      await supabaseService
        .from('partner_referrals')
        .update({ status: 'rewarded', reward_granted_at: now })
        .eq('id', ref.id)

      // 2. Update partner_profiles reward balance
      if (pp?.id) {
        await supabaseService
          .from('partner_profiles')
          .update({
            reward_months_balance:  (pp.reward_months_balance  ?? 0) + rewardMonths,
            reward_months_lifetime: (pp.reward_months_lifetime ?? 0) + rewardMonths,
            updated_at: now,
          })
          .eq('id', pp.id)
      }

      // 3. Extend partner's Pro subscription (if they have a user account)
      if (pp?.user_id) {
        const { data: partnerProfile } = await supabaseService
          .from('patent_profiles')
          .select('subscription_status, subscription_period_end')
          .eq('id', pp.user_id)
          .single()

        if (partnerProfile?.subscription_status !== 'complimentary') {
          const base = partnerProfile?.subscription_period_end
            ? new Date(partnerProfile.subscription_period_end)
            : new Date()
          if (base < new Date()) base.setTime(Date.now())
          base.setMonth(base.getMonth() + rewardMonths)
          await supabaseService
            .from('patent_profiles')
            .update({
              subscription_status:    'pro',
              subscription_period_end: base.toISOString(),
              updated_at:             now,
            })
            .eq('id', pp.user_id)
        }
      }

      // 4. Get client name for email
      const { data: referredUser } = await supabaseService
        .from('patent_profiles')
        .select('name_first, name_last, email')
        .eq('id', ref.referred_user_id)
        .single()
      const clientName = [referredUser?.name_first, referredUser?.name_last].filter(Boolean).join(' ') || 'Your referred client'

      // 5. Email partner: reward confirmed
      const { data: partnerCounsel } = await supabaseService
        .from('patent_counsel_partners')
        .select('email, full_name, firm_name')
        .eq('id', ref.partner_id)
        .single()

      if (partnerCounsel?.email) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
        await sendEmail(buildEmail({
          to:      partnerCounsel.email,
          from:    FROM_DEFAULT,
          subject: `Reward credited — ${rewardMonths} months Pro for ${clientName}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2>Reward credited 🎉</h2>
  <p>Hi ${partnerCounsel.full_name?.split(' ')[0] ?? 'there'},</p>
  <p>The 48-hour review window has closed for <strong>${clientName}</strong>'s filing.</p>
  <p><strong>${rewardMonths} months of PatentPending Pro</strong> have been added to your account.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
    <tr><td style="padding:4px 0;color:#6b7280;width:140px">Referral</td><td>${clientName}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280">Reward</td><td style="font-weight:bold">+${rewardMonths} months Pro</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280">Balance</td><td>${(pp?.reward_months_balance ?? 0) + rewardMonths} months remaining</td></tr>
  </table>
  <p><a href="${appUrl}/dashboard/partners" style="display:inline-block;background:#1a1f36;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Partner Dashboard →</a></p>
</div>`,
        })).catch(e => console.error(`[cron] email error for ${ref.partner_id}:`, e))
      }

      processed++
      results.push({ id: ref.id, partner_id: ref.partner_id, months: rewardMonths, status: 'ok' })
      console.log(`[cron/qualify-referrals] ✅ rewarded: ref=${ref.id} partner=${ref.partner_id} months=${rewardMonths}`)
    } catch (e) {
      failed++
      results.push({ id: ref.id, partner_id: ref.partner_id, months: 0, status: 'error' })
      console.error(`[cron/qualify-referrals] ❌ failed ref=${ref.id}:`, e)
    }
  }

  return NextResponse.json({ ok: true, processed, failed, results })
}
