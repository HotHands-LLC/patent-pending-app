/**
 * POST /api/email/send — Send transactional email via Resend
 * Internal only — called by nurture cron + notification flows
 * Body: { to, subject, html, text, from? }
 */
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })

  const { to, subject, html, text, from: fromAddr } = await req.json()
  if (!to || !subject || !html) return NextResponse.json({ error: 'to, subject, html required' }, { status: 400 })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddr ?? 'Pattie <pattie@patentpending.app>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text ?? '',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err.slice(0, 300) }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json({ ok: true, id: data.id })
}
