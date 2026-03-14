/**
 * POST /api/marketplace/inquire — Gated Marketplace Inquiry (Prompt 7E)
 *
 * Public, no auth required.
 * Accepts structured lead data, inserts into marketplace_leads (primary record)
 * and logs a correspondence entry (for owner's Correspondence tab).
 * Sends notification email to support@hotdeck.com. Email is non-blocking.
 * Rate-limited: 5/hour per IP.
 *
 * Privacy bridge: owner PII never exposed to inquirer.
 * Lead data (email, phone, why_statement) never shown on public deal page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail } from '@/lib/email'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

const VALID_INTEREST_TYPES = ['license', 'acquire', 'partner', 'invest', 'other'] as const

// ── Rate limiting (per-IP, 5/hour) ───────────────────────────────────────────
const rateMap = new Map<string, number[]>()
const RATE_LIMIT  = 5
const RATE_WINDOW = 60 * 60 * 1000

function isRateLimited(ip: string): boolean {
  const now  = Date.now()
  const hits = (rateMap.get(ip) ?? []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) return true
  hits.push(now)
  rateMap.set(ip, hits)
  return false
}

export async function POST(req: NextRequest) {
  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests — please try again later.' },
      { status: 429 }
    )
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    slug,            // preferred — matches marketplace_slug
    marketplace_slug: _fallbackSlug,
    full_name,
    email,
    company,
    phone,
    interest_type,
    why_statement,
  } = body as Record<string, unknown>

  const resolvedSlug = (slug ?? _fallbackSlug) as string | undefined

  // ── Validate ───────────────────────────────────────────────────────────────
  if (!resolvedSlug || typeof resolvedSlug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  }
  if (!interest_type || typeof interest_type !== 'string') {
    return NextResponse.json({ error: 'Interest type is required' }, { status: 400 })
  }
  const cleanInterest = interest_type.trim().toLowerCase()
  if (!VALID_INTEREST_TYPES.includes(cleanInterest as typeof VALID_INTEREST_TYPES[number])) {
    return NextResponse.json(
      { error: `interest_type must be one of: ${VALID_INTEREST_TYPES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!why_statement || typeof why_statement !== 'string' || why_statement.trim().length < 50) {
    return NextResponse.json(
      { error: 'Please explain your interest (minimum 50 characters)' },
      { status: 400 }
    )
  }

  const cleanName      = full_name.trim().slice(0, 200)
  const cleanEmail     = email.trim().toLowerCase()
  const cleanCompany   = company  ? String(company).trim().slice(0, 200) : null
  const cleanPhone     = phone    ? String(phone).trim().slice(0, 40)   : null
  const cleanWhy       = why_statement.trim().slice(0, 3000)
  const firstName      = cleanName.split(' ')[0]

  // ── Resolve patent ─────────────────────────────────────────────────────────
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, title, owner_id, marketplace_enabled')
    .eq('marketplace_slug', resolvedSlug)
    .single()

  if (!patent || !patent.marketplace_enabled) {
    return NextResponse.json(
      { error: 'Patent listing not found or not available.' },
      { status: 404 }
    )
  }

  // ── Resolve owner display name for to_party (Bug fix: was hardcoded 'Hot Hands IP, LLC') ──
  let ownerDisplayName = 'Patent Owner'
  try {
    const { data: ownerProfile } = await supabaseService
      .from('patent_profiles')
      .select('full_name, name_first, name_last, default_assignee_name')
      .eq('id', patent.owner_id)
      .single()
    if (ownerProfile) {
      ownerDisplayName =
        ownerProfile.default_assignee_name ||
        ownerProfile.full_name ||
        [ownerProfile.name_first, ownerProfile.name_last].filter(Boolean).join(' ') ||
        'Patent Owner'
    }
  } catch { /* non-blocking — use default */ }

  // ── Per-email-per-patent rate limit (3 max) ──────────────────────────────
  const { count: existingCount } = await supabaseService
    .from('marketplace_leads')
    .select('id', { count: 'exact', head: true })
    .eq('patent_id', patent.id)
    .eq('email', cleanEmail)

  if ((existingCount ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'You have already submitted the maximum number of inquiries for this patent.' },
      { status: 429 }
    )
  }

  // ── Insert into marketplace_leads ─────────────────────────────────────────
  const { data: lead, error: leadError } = await supabaseService
    .from('marketplace_leads')
    .insert({
      patent_id:        patent.id,
      full_name:        cleanName,
      email:            cleanEmail,
      company:          cleanCompany,
      phone:            cleanPhone,
      interest_type:    cleanInterest,
      why_statement:    cleanWhy,
      status:           'pending',
      owner_notified_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (leadError || !lead) {
    console.error('[marketplace/inquire] lead insert error:', leadError?.message)
    return NextResponse.json(
      { error: 'Failed to submit inquiry — please try again.' },
      { status: 500 }
    )
  }

  // ── Log to patent_correspondence (for owner Correspondence tab) ────────────
  try {
    const companyStr = cleanCompany ? ` (${cleanCompany})` : ''
    await supabaseService.from('patent_correspondence').insert({
      patent_id:           patent.id,
      owner_id:            patent.owner_id,
      title:               `Marketplace Inquiry — ${cleanInterest} from ${cleanName}${companyStr}`,
      content:             `Why interested: ${cleanWhy}${cleanPhone ? `\nPhone: ${cleanPhone}` : ''}`,
      type:                'marketplace_inquiry',
      from_party:          `${cleanName}${companyStr}`,
      to_party:            ownerDisplayName,
      correspondence_date: new Date().toISOString(),
      tags:                ['marketplace', 'inquiry', cleanInterest, 'pending'],
    })
  } catch (corrErr) {
    console.error('[marketplace/inquire] correspondence log failed (non-blocking):', corrErr)
  }

  // ── Notify owner (non-blocking) ────────────────────────────────────────────
  try {
    const leadsUrl = `${APP_URL}/dashboard/patents/${patent.id}?tab=leads`

    await sendEmail(buildEmail({
      to:      'support@hotdeck.com',
      subject: `New Marketplace Lead — ${patent.title}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a1f36;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">New Marketplace Lead 🎯</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">
      Someone is interested in licensing <strong>${patent.title}</strong>.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px">
      <tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600;white-space:nowrap">Name</td><td style="padding:5px 0"><strong>${cleanName}</strong></td></tr>
      <tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600">Email</td><td style="padding:5px 0"><a href="mailto:${cleanEmail}" style="color:#4f46e5">${cleanEmail}</a></td></tr>
      ${cleanCompany ? `<tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600">Company</td><td style="padding:5px 0">${cleanCompany}</td></tr>` : ''}
      ${cleanPhone ? `<tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600">Phone</td><td style="padding:5px 0">${cleanPhone}</td></tr>` : ''}
      <tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-weight:600">Interest</td><td style="padding:5px 0"><span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:700;text-transform:capitalize">${cleanInterest}</span></td></tr>
    </table>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Why they're interested</div>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">${cleanWhy.replace(/\n/g, '<br>')}</p>
    </div>
    <a href="${leadsUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
      Review Lead →
    </a>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
      Lead ID: ${lead.id} · Status: pending · pp.app is intermediary — contact info not shared with inventor until you approve.
    </p>
  </div>
</div>`,
    }))
  } catch (emailErr) {
    console.error('[marketplace/inquire] notification email failed (non-blocking):', emailErr)
  }

  return NextResponse.json({
    ok: true,
    firstName,
    message: `Your inquiry has been received. We'll be in touch within 2 business days.`,
  })
}
