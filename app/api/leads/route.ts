import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * POST /api/leads
 * Public — no auth required.
 * Body: { patent_id, name, email, company, message }
 * Creates lead record and emails notifications@patentpending.app.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { patent_id, name, email, company, message } = body

    if (!patent_id || !name || !email || !message) {
      return NextResponse.json({ error: 'patent_id, name, email, message required' }, { status: 400 })
    }
    if (!email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // Verify the patent has arc3_active and exists
    const { data: patent } = await supabaseService
      .from('patents')
      .select('id, title, arc3_active, slug')
      .eq('id', patent_id)
      .single()

    if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
    if (!patent.arc3_active) return NextResponse.json({ error: 'Patent not available for licensing' }, { status: 403 })

    // Create lead
    const { data: lead, error: leadErr } = await supabaseService
      .from('patent_leads')
      .insert({
        patent_id,
        name: name.slice(0, 200),
        email: email.toLowerCase().trim(),
        company: (company ?? '').slice(0, 200),
        message: message.slice(0, 5000),
        status: 'new',
      })
      .select('id')
      .single()

    if (leadErr) {
      console.error('[leads] insert error:', JSON.stringify(leadErr))
      return NextResponse.json({ error: 'Failed to submit inquiry' }, { status: 500 })
    }

    // Send notification email
    try {
      const resend = getResend()
      await resend.emails.send({
        from: 'PatentPending Agency <notifications@patentpending.app>',
        to: ['support@hotdeck.com'],
        subject: `🎯 New Licensing Inquiry — ${patent.title}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;">
            <h2 style="color:#1a1f36;">New Licensing Inquiry</h2>
            <p><strong>Patent:</strong> ${patent.title}</p>
            <hr/>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Company:</strong> ${company || '(not provided)'}</p>
            <p><strong>Message:</strong></p>
            <blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;color:#374151;">${message}</blockquote>
            <hr/>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/admin" style="color:#6366f1;">View in Mission Control →</a></p>
          </div>
        `,
      })
    } catch (emailErr) {
      // Non-fatal — lead is saved, just email failed
      console.error('[leads] email notification failed:', emailErr)
    }

    return NextResponse.json({ ok: true, lead_id: lead?.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
