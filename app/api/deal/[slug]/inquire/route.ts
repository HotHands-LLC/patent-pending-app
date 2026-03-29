import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail } from '@/lib/email'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

// ── In-memory rate limiting (per-IP, 3/hour) ────────────────────────────────
// Vercel serverless: each instance has its own map — good enough for abuse deterrent
const rateMap = new Map<string, number[]>()
const RATE_LIMIT = 3
const RATE_WINDOW_MS = 60 * 60 * 1000  // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_LIMIT) return true
  hits.push(now)
  rateMap.set(ip, hits)
  return false
}

/**
 * POST /api/deal/[slug]/inquire — public, no auth required
 * Body: { name, email, company?, deal_type_interest?, message? }
 * Rate-limited: 3/hour per IP
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests — please try again later.' },
      { status: 429 }
    )
  }

  // Resolve patent by slug
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, title, owner_id, arc3_active')
    .eq('slug', slug)
    .single()

  if (!patent || !patent.arc3_active) {
    return NextResponse.json({ error: 'Patent not found or not available.' }, { status: 404 })
  }

  // Parse body
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, email, company, deal_type_interest, message } = body as Record<string, unknown>
  if (!name || typeof name !== 'string' || !email || typeof email !== 'string') {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // Insert inquiry
  const { data: inquiry, error: insertError } = await supabaseService
    .from('deal_inquiries')
    .insert({
      patent_id: patent.id,
      inquirer_name: name.toString().trim().slice(0, 200),
      inquirer_email: email.toString().trim().toLowerCase(),
      inquirer_company: company ? String(company).trim().slice(0, 200) : null,
      deal_type_interest: Array.isArray(deal_type_interest) ? deal_type_interest : null,
      message: message ? String(message).trim().slice(0, 2000) : null,
    })
    .select('id')
    .single()

  if (insertError || !inquiry) {
    console.error('[inquire] insert error:', insertError?.message)
    return NextResponse.json({ error: 'Failed to submit inquiry — please try again.' }, { status: 500 })
  }

  // Notify Chad
  try {
    const dealUrl = `${APP_URL}/dashboard/patents/${patent.id}?tab=leads`
    const dealTypes = Array.isArray(deal_type_interest) && deal_type_interest.length
      ? deal_type_interest.join(', ')
      : 'Not specified'

    await sendEmail(buildEmail({
      to: 'support@hotdeck.com',
      subject: `New licensing inquiry: "${patent.title}"`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">New Licensing Inquiry 📬</h2>
  <p>Someone is interested in <strong>${patent.title}</strong>.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap">Name</td><td style="padding:6px 0"><strong>${name}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Email</td><td style="padding:6px 0"><a href="mailto:${email}">${email}</a></td></tr>
    ${company ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280">Company</td><td style="padding:6px 0">${company}</td></tr>` : ''}
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Deal types</td><td style="padding:6px 0">${dealTypes}</td></tr>
    ${message ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Message</td><td style="padding:6px 0">${message}</td></tr>` : ''}
  </table>
  <p style="margin-top:24px">
    <a href="${dealUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
      Review in Leads Tab →
    </a>
  </p>
</div>`,
    }))
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    message: "Thank you — we'll be in touch within 48 hours.",
  })
}
