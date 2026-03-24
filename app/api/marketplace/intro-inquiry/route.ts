import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { patent_id, sender_name, sender_email, message } = await req.json()
    if (!patent_id || !sender_name?.trim() || !sender_email?.trim()) {
      return NextResponse.json({ error: 'patent_id, sender_name, and sender_email are required.' }, { status: 400 })
    }

    const { data: patent } = await supabaseService
      .from('patents')
      .select('id, title, owner_id, marketplace_inquiries')
      .eq('id', patent_id)
      .single()
    if (!patent) return NextResponse.json({ error: 'Patent not found.' }, { status: 404 })

    await supabaseService.from('marketplace_inquiries_log').insert({
      patent_id,
      sender_name: sender_name.trim(),
      sender_email: sender_email.trim().toLowerCase(),
      message: message?.trim() ?? null,
    })

    await supabaseService.from('patents').update({
      marketplace_inquiries: (patent.marketplace_inquiries ?? 0) + 1
    }).eq('id', patent_id)

    const { data: { users } } = await supabaseService.auth.admin.listUsers()
    const owner = users?.find((u: { id: string; email?: string }) => u.id === patent.owner_id)
    const ownerEmail = owner?.email

    if (ownerEmail && process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'PatentPending <notifications@hotdeck.com>',
          to: ownerEmail,
          subject: `Someone is interested in "${patent.title}"`,
          reply_to: sender_email.trim(),
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px"><h2 style="color:#1a1f36">New marketplace inquiry</h2><p><strong>${sender_name}</strong> (${sender_email}) submitted an introduction request for your patent:</p><div style="background:#f3f4f6;padding:12px 16px;border-radius:8px;margin:16px 0"><strong>${patent.title}</strong></div>${message?.trim() ? `<p><strong>Their message:</strong></p><blockquote style="border-left:3px solid #e5e7eb;margin:0;padding:8px 16px;color:#374151">${message.trim()}</blockquote>` : ''}<p style="margin-top:24px"><a href="https://patentpending.app/dashboard" style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">View in Dashboard →</a></p><p style="font-size:12px;color:#9ca3af;margin-top:24px">PatentPending.app</p></div>`,
        }),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[intro-inquiry]', err)
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
