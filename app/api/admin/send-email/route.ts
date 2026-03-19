import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  return new Resend(process.env.RESEND_API_KEY ?? 'placeholder-resend-key')
}

async function getAdminUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const userClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

/**
 * POST /api/admin/send-email
 * Compose or reply to an email from Mission Control.
 * Body: { to, subject, body, inbox_item_id? (to mark as replied) }
 */
export async function POST(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { to, subject, body: emailBody, inbox_item_id } = body

  if (!to || !subject || !emailBody) {
    return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
  }

  // Basic safety check — only allow sending to whitelisted domain for now
  const toAddr = to.toLowerCase().trim()
  if (!toAddr.endsWith('@hotdeck.com') && !toAddr.includes('hotdeck.com') && !toAddr.includes('gmail.com')) {
    return NextResponse.json({ error: 'Recipient must be a known address' }, { status: 400 })
  }

  try {
    const resend = getResend()
    const result = await resend.emails.send({
      from: 'PatentClaw <notifications@hotdeck.com>',
      to: [to],
      subject,
      text: emailBody,
      html: `<div style="font-family:sans-serif;max-width:600px;white-space:pre-wrap;">${emailBody.replace(/\n/g, '<br>')}</div>`,
    })

    // Mark inbox item as replied
    if (inbox_item_id) {
      await supabaseService
        .from('inbox_items')
        .update({ sent_reply: true, is_reviewed: true, updated_at: new Date().toISOString() })
        .eq('id', inbox_item_id)
    }

    return NextResponse.json({ ok: true, id: result.data?.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Send failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
