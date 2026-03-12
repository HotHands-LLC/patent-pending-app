/**
 * POST /api/marketplace/inquire
 * Public, no auth required.
 * Validates inquiry, logs to patent_correspondence with type='marketplace_inquiry',
 * and sends notification email to support@hotdeck.com.
 * Rate-limited: 5/hour per IP.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail } from '@/lib/email'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

// ── Rate limiting (per-IP, 5/hour) ───────────────────────────────────────────
const rateMap = new Map<string, number[]>()
const RATE_LIMIT    = 5
const RATE_WINDOW   = 60 * 60 * 1000

function isRateLimited(ip: string): boolean {
  const now  = Date.now()
  const hits = (rateMap.get(ip) ?? []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) return true
  hits.push(now)
  rateMap.set(ip, hits)
  return false
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests — please try again later.' }, { status: 429 })
  }

  // Parse body
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { marketplace_slug, name, email, company, interest_type, message } =
    body as Record<string, unknown>

  // ── Validate required fields ────────────────────────────────────────────────
  if (!marketplace_slug || typeof marketplace_slug !== 'string') {
    return NextResponse.json({ error: 'marketplace_slug is required' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  }
  if (!interest_type || typeof interest_type !== 'string' || !interest_type.trim()) {
    return NextResponse.json({ error: 'Interest type is required' }, { status: 400 })
  }

  const cleanName         = name.trim().slice(0, 200)
  const cleanEmail        = email.trim().toLowerCase()
  const cleanCompany      = company ? String(company).trim().slice(0, 200) : null
  const cleanInterestType = interest_type.trim()
  const cleanMessage      = message ? String(message).trim().slice(0, 2000) : null

  // ── Look up patent by marketplace_slug ─────────────────────────────────────
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, title, owner_id, marketplace_enabled')
    .eq('marketplace_slug', marketplace_slug)
    .single()

  if (!patent || !patent.marketplace_enabled) {
    return NextResponse.json({ error: 'Patent listing not found or not available.' }, { status: 404 })
  }

  // ── Insert into patent_correspondence ──────────────────────────────────────
  const companyStr = cleanCompany ? ` (${cleanCompany})` : ''
  const corr = {
    patent_id:           patent.id,
    owner_id:            patent.owner_id,
    title:               `Marketplace Inquiry — ${cleanInterestType} from ${cleanName}${companyStr}`,
    content:             cleanMessage ?? 'No message provided.',
    type:                'marketplace_inquiry' as const,
    from_party:          `${cleanName}${companyStr} — ${cleanEmail}`,
    to_party:            'Hot Hands IP, LLC',
    correspondence_date: new Date().toISOString(),
    tags:                ['marketplace', 'inquiry', cleanInterestType.toLowerCase()],
  }

  const { error: insertError } = await supabaseService
    .from('patent_correspondence')
    .insert(corr)

  if (insertError) {
    console.error('[marketplace/inquire] insert error:', insertError.message)
    return NextResponse.json({ error: 'Failed to submit inquiry — please try again.' }, { status: 500 })
  }

  // ── Notification email to owner (non-blocking) ─────────────────────────────
  try {
    const dashboardUrl = `${APP_URL}/dashboard/patents/${patent.id}?tab=correspondence`

    await sendEmail(buildEmail({
      to:      'support@hotdeck.com',
      subject: `New Marketplace Inquiry — ${patent.title}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a1f36;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#ffffff;margin:0;font-size:18px">New Marketplace Inquiry 📬</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px;color:#374151;font-size:14px;">
      Someone is interested in <strong>${patent.title}</strong>.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:16px">
      <tr><td style="padding:6px 16px 6px 0;color:#6b7280;white-space:nowrap;font-weight:600">Name</td><td style="padding:6px 0"><strong>${cleanName}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-weight:600">Email</td><td style="padding:6px 0"><a href="mailto:${cleanEmail}" style="color:#4f46e5">${cleanEmail}</a></td></tr>
      ${cleanCompany ? `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-weight:600">Company</td><td style="padding:6px 0">${cleanCompany}</td></tr>` : ''}
      <tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-weight:600">Interest</td><td style="padding:6px 0"><span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:700">${cleanInterestType}</span></td></tr>
      ${cleanMessage ? `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-weight:600;vertical-align:top">Message</td><td style="padding:6px 0;color:#374151">${cleanMessage.replace(/\n/g, '<br>')}</td></tr>` : ''}
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
      View in Correspondence Tab →
    </a>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
      This inquiry is logged under the patent's Correspondence tab with a purple "Marketplace" badge.
    </p>
  </div>
</div>`,
    }))
  } catch (emailErr) {
    console.error('[marketplace/inquire] notification email failed (non-blocking):', emailErr)
  }

  return NextResponse.json({
    ok: true,
    message: "Your inquiry has been received. We'll be in touch within 2 business days.",
  })
}
