/**
 * lib/emails/marketplace-introduction.ts
 * Sends dual introduction emails when a marketplace lead is approved.
 * Email A → inquirer: authorized to contact the patent holder
 * Email B → patent owner: someone will reach out
 */

import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'


const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

export async function sendMarketplaceIntroduction(leadId: string): Promise<void> {
  // ── 1. Fetch lead ──────────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await supabaseService
    .from('marketplace_leads')
    .select('id, patent_id, full_name, email, company, phone, interest_type, why_statement, status')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    console.error('[marketplace-introduction] lead not found:', leadId, leadErr?.message)
    return
  }

  // ── 2. Fetch patent ────────────────────────────────────────────────────────
  const { data: patent, error: patentErr } = await supabaseService
    .from('patents')
    .select('id, title, inventors, owner_id, marketplace_slug')
    .eq('id', lead.patent_id)
    .single()

  if (patentErr || !patent) {
    console.error('[marketplace-introduction] patent not found:', lead.patent_id, patentErr?.message)
    return
  }

  const inventorNames = Array.isArray(patent.inventors) && patent.inventors.length
    ? (patent.inventors as string[]).join(', ')
    : 'the inventor'

  // ── 3. Fetch owner email ───────────────────────────────────────────────────
  let ownerEmail: string | null = null
  try {
    // Try profiles table first
    const { data: profile } = await supabaseService
      .from('profiles')
      .select('email')
      .eq('id', patent.owner_id)
      .single()
    if (profile?.email) {
      ownerEmail = profile.email
    } else {
      // Fall back to auth.users via admin API
      const { data: authUser } = await supabaseService.auth.admin.getUserById(patent.owner_id)
      ownerEmail = authUser?.user?.email ?? null
    }
  } catch (e) {
    console.error('[marketplace-introduction] owner email lookup failed:', e)
  }

  if (!ownerEmail) {
    console.error('[marketplace-introduction] could not resolve owner email for patent', patent.id)
    // Continue — still send the inquirer email; owner notification goes to support
  }

  const firstName = lead.full_name.split(' ')[0]
  const companyStr = lead.company ? ` (${lead.company})` : ''
  const dealUrl = patent.marketplace_slug
    ? `${APP_URL}/marketplace/${patent.marketplace_slug}`
    : `${APP_URL}/marketplace`

  // ── 4A. Email to inquirer ──────────────────────────────────────────────────
  try {
    await sendEmail(buildEmail({
      to: lead.email,
      subject: `Your inquiry has been approved — ${patent.title}`,
      from: FROM_DEFAULT,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a1f36;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">✅ Inquiry Approved</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">
      Your inquiry for <strong>${patent.title}</strong> has been reviewed and approved.
      You are now authorized to contact the patent holder directly.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px">Contact Information</p>
      <p style="margin:0 0 4px;font-size:15px;color:#374151;"><strong>Inventor:</strong> ${inventorNames}</p>
      ${ownerEmail ? `<p style="margin:0;font-size:15px;color:#374151;"><strong>Email:</strong> <a href="mailto:${ownerEmail}" style="color:#4f46e5">${ownerEmail}</a></p>` : '<p style="margin:0;font-size:13px;color:#6b7280">Contact information will be shared by the inventor directly.</p>'}
    </div>
    <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">
      <strong>Reference Inquiry ID:</strong> <span style="font-family:monospace">${leadId}</span>
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#9ca3af;">
      Please note: any agreement, terms, or transaction is between you and the patent holder directly.
      PatentPending is not a party to any deal and provides no warranty or representation.
    </p>
    <a href="${dealUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
      View Patent →
    </a>
  </div>
</div>`,
    }))
    console.log('[marketplace-introduction] inquirer email sent to', lead.email)
  } catch (e) {
    console.error('[marketplace-introduction] inquirer email failed (non-blocking):', e)
  }

  // ── 4B. Email to patent owner ──────────────────────────────────────────────
  const ownerTo = ownerEmail ?? 'support@hotdeck.com'
  try {
    await sendEmail(buildEmail({
      to: ownerTo,
      subject: `New approved inquiry for ${patent.title}`,
      from: FROM_DEFAULT,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a1f36;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">🤝 New Approved Inquiry</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">
      Someone is interested in your patent <strong>${patent.title}</strong> and has been approved to contact you.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px">
      <tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600;white-space:nowrap">Name</td><td style="padding:5px 0"><strong>${lead.full_name}</strong></td></tr>
      ${lead.company ? `<tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600">Company</td><td style="padding:5px 0">${lead.company}</td></tr>` : ''}
      ${lead.phone ? `<tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600">Phone</td><td style="padding:5px 0">${lead.phone}</td></tr>` : ''}
      <tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600">Email</td><td style="padding:5px 0"><a href="mailto:${lead.email}" style="color:#4f46e5">${lead.email}</a></td></tr>
      <tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600">Interest</td><td style="padding:5px 0"><span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:700;text-transform:capitalize">${lead.interest_type}</span></td></tr>
    </table>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Why They're Interested</div>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">${lead.why_statement.replace(/\n/g, '<br>')}</p>
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">
      They will reach out to you directly. You may also contact them at the email above.
    </p>
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Inquiry ID: <span style="font-family:monospace">${leadId}</span>
    </p>
  </div>
</div>`,
    }))
    console.log('[marketplace-introduction] owner email sent to', ownerTo)
  } catch (e) {
    console.error('[marketplace-introduction] owner email failed (non-blocking):', e)
  }

  // ── 5. Mark lead as introduced ─────────────────────────────────────────────
  try {
    await supabaseService
      .from('marketplace_leads')
      .update({
        status: 'introduced',
        introduced_at: new Date().toISOString(),
      })
      .eq('id', leadId)
  } catch (e) {
    console.error('[marketplace-introduction] lead status update failed:', e)
  }
}
