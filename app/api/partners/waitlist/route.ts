/**
 * POST /api/partners/waitlist
 * Public (no auth). Accepts attorney partner waitlist signups.
 * Inserts to partner_waitlist table, sends confirmation + internal notification emails.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const FOCUS_AREA_VALUES = ['patent', 'trademark', 'ip_litigation', 'other'] as const
type FocusArea = typeof FOCUS_AREA_VALUES[number]

function isFocusArea(val: unknown): val is FocusArea {
  return typeof val === 'string' && FOCUS_AREA_VALUES.includes(val as FocusArea)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    name?: string
    email?: string
    firm?: string
    focus_area?: string
  }

  const { name, email, firm, focus_area } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const cleanName = name.trim()
  const cleanEmail = email.trim().toLowerCase()
  const cleanFirm = typeof firm === 'string' ? firm.trim() || null : null
  const cleanFocusArea = isFocusArea(focus_area) ? focus_area : null

  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )

  // Insert — handle duplicate email gracefully
  const { error: insertError } = await supabase.from('partner_waitlist').insert({
    name: cleanName,
    email: cleanEmail,
    firm: cleanFirm,
    focus_area: cleanFocusArea,
    status: 'pending',
  })

  if (insertError) {
    // Unique violation = duplicate email; treat as success to avoid leaking list membership
    if (insertError.code === '23505') {
      return NextResponse.json({ success: true, existing: true })
    }
    console.error('[partners/waitlist] insert error:', insertError)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  // Send emails (non-blocking for response — but we await for reliability)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'
  const resend = new Resend(process.env.RESEND_API_KEY)

  const focusAreaLabel: Record<FocusArea, string> = {
    patent: 'Patent',
    trademark: 'Trademark',
    ip_litigation: 'IP Litigation',
    other: 'Other',
  }

  await Promise.allSettled([
    // Confirmation to submitter
    resend.emails.send({
      from: fromEmail,
      to: cleanEmail,
      subject: "You're on the patentpending.app partner waitlist",
      text: `Thanks ${cleanName} — we've added you to the early access list for the patentpending.app attorney partner program. We'll reach out within 48 hours to discuss how the platform might work for your practice. — The patentpending.app team`,
    }),

    // Internal notification
    resend.emails.send({
      from: fromEmail,
      to: 'notifications@patentpending.app',
      subject: `New partner waitlist signup: ${cleanName}${cleanFirm ? ` — ${cleanFirm}` : ''}`,
      text: [
        `Name: ${cleanName}`,
        `Email: ${cleanEmail}`,
        `Firm: ${cleanFirm ?? '(not provided)'}`,
        `Focus area: ${cleanFocusArea ? focusAreaLabel[cleanFocusArea] : '(not provided)'}`,
      ].join('\n'),
    }),
  ])

  return NextResponse.json({ success: true })
}
