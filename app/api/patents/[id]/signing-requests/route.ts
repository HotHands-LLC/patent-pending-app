import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const DOCUMENT_DESCRIPTIONS: Record<string, string> = {
  aia_01:
    "This is your inventor declaration — a formal statement that you're one of the original inventors of this patent. The USPTO requires this before examining the application. You're confirming the invention is genuinely yours.",
  sb0015a:
    'This certifies that you qualify as a micro entity, which reduces your USPTO filing fees by 80%. You\'re confirming you haven\'t filed more than 4 patents before and your income is below the threshold.',
  assignment:
    'This document transfers ownership or licensing rights for this patent. Review carefully before signing.',
  aia_08:
    'This is your oath or declaration under 37 CFR 1.63. You are confirming the truthfulness of the application contents.',
  other: 'This document requires your signature as part of the patent application process.',
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'
  )
}

// GET /api/patents/[id]/signing-requests — patent owner only
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userClient = getUserClient(auth.slice(7))
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()

  // Verify ownership
  const { data: patent } = await supabase
    .from('patents')
    .select('id, owner_id, title')
    .eq('id', id)
    .single()
  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('patent_signing_requests')
    .select('*')
    .eq('patent_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/patents/[id]/signing-requests — create signing requests
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userClient = getUserClient(auth.slice(7))
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()

  // Verify ownership
  const { data: patent } = await supabase
    .from('patents')
    .select('id, owner_id, title, application_number')
    .eq('id', id)
    .single()
  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: {
    requests: Array<{
      signer_email: string
      signer_name: string
      document_type: string
      document_label: string
    }>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.requests) || body.requests.length === 0) {
    return NextResponse.json({ error: 'requests array required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const rows = body.requests.map((r) => ({
    patent_id: id,
    requested_by: user.id,
    signer_email: r.signer_email,
    signer_name: r.signer_name,
    document_type: r.document_type,
    document_label: r.document_label,
    prefill_data: {
      application_number: patent.application_number ?? undefined,
      patent_title: patent.title,
    },
    status: 'pending',
    notification_sent_at: now,
  }))

  const { data: created, error: insertErr } = await supabase
    .from('patent_signing_requests')
    .insert(rows)
    .select()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Send invitation emails
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

  if (resendKey && created) {
    const { Resend } = await import('resend')
    const resend = new Resend(resendKey)

    for (const request of created) {
      const docDescription = DOCUMENT_DESCRIPTIONS[request.document_type] ?? DOCUMENT_DESCRIPTIONS.other
      const signUrl = `${appUrl}/sign/${request.id}`

      await resend.emails.send({
        from: fromEmail,
        to: request.signer_email,
        subject: `Action required: Please sign your ${request.document_label} for "${patent.title}"`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2 style="color:#1a1f36">Signature Required</h2>
  <p>Hi ${request.signer_name},</p>
  <p>You've been asked to sign the following document for the patent application <strong>"${patent.title}"</strong>:</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0">
    <p style="margin:0;font-weight:bold">${request.document_label}</p>
    <p style="margin:8px 0 0;color:#6b7280;font-size:14px">${docDescription}</p>
  </div>
  <p>No printing or scanning required — you can sign securely online in seconds.</p>
  <p style="margin:24px 0">
    <a href="${signUrl}" style="display:inline-block;background:#1a1f36;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Sign Document →</a>
  </p>
  <p style="color:#6b7280;font-size:13px">This link is unique to you. Please do not forward it.</p>
  <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
    PatentPending · <a href="${appUrl}" style="color:#6366f1">patentpending.app</a>
  </p>
</div>`,
      }).catch((err: unknown) => console.error('[signing] email error', err))
    }
  }

  return NextResponse.json(created, { status: 201 })
}
