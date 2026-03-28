/**
 * POST /api/contact
 * - Accepts: name, email, message
 * - Sends auto-reply to sender via Resend (from pattie@patentpending.app)
 * - Forwards inquiry to agent@hotdeck.com
 * - Logs to Supabase contacts table
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, buildEmail, htmlToText } from '@/lib/email'

export const dynamic = 'force-dynamic'

const FROM_PATTIE = 'Pattie <pattie@patentpending.app>'
const FORWARD_TO = 'agent@hotdeck.com'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars not set')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, message } = body as { name?: string; email?: string; message?: string }

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'name, email, and message are required' }, { status: 400 })
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // 1 — Log to Supabase
    const supabase = getSupabase()
    const { error: dbError } = await supabase
      .from('contacts')
      .insert({ name, email, message })

    if (dbError) {
      console.error('[contact] Supabase insert error:', dbError.message)
      // Non-fatal — continue with email
    }

    // 2 — Auto-reply to sender
    const autoReplyHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">Hi ${name} 👋</h2>
  <p>Thanks for reaching out!</p>
  <p>Pattie will review your message and respond within 24 hours.</p>
  <p>In the meantime, you can explore <a href="https://patentpending.app" style="color:#4f46e5">PatentPending.app</a> or check out our <a href="https://patentpending.app/pricing" style="color:#4f46e5">pricing page</a>.</p>
  <p style="color:#6b7280;font-size:14px;">— Pattie, PatentPending.app</p>
</div>`

    await sendEmail(buildEmail({
      to: email,
      from: FROM_PATTIE,
      replyTo: 'pattie@patentpending.app',
      subject: 'We got your message — PatentPending.app',
      html: autoReplyHtml,
    }))

    // 3 — Forward to agent@hotdeck.com
    const forwardHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">New contact inquiry</h2>
  <p><strong>Name:</strong> ${name}</p>
  <p><strong>Email:</strong> <a href="mailto:${email}" style="color:#4f46e5">${email}</a></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
  <p><strong>Message:</strong></p>
  <blockquote style="border-left:3px solid #4f46e5;margin:0;padding:0 16px;color:#374151">${message.replace(/\n/g, '<br/>')}</blockquote>
</div>`

    await sendEmail(buildEmail({
      to: FORWARD_TO,
      from: FROM_PATTIE,
      replyTo: email,
      subject: `New contact inquiry from ${name}`,
      html: forwardHtml,
    }))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contact] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
