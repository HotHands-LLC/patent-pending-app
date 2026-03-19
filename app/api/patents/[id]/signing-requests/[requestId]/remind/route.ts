import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const DOCUMENT_DESCRIPTIONS: Record<string, string> = {
  aia_01:
    "This is your inventor declaration — a formal statement that you're one of the original inventors of this patent. The USPTO requires this before examining the application. You're confirming the invention is genuinely yours.",
  sb0015a:
    "This certifies that you qualify as a micro entity, which reduces your USPTO filing fees by 80%. You're confirming you haven't filed more than 4 patents before and your income is below the threshold.",
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

// POST /api/patents/[id]/signing-requests/[requestId]/remind
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id, requestId } = await params
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

  // Fetch signing request
  const { data: sigReq } = await supabase
    .from('patent_signing_requests')
    .select('*')
    .eq('id', requestId)
    .eq('patent_id', id)
    .single()

  if (!sigReq) return NextResponse.json({ error: 'Signing request not found' }, { status: 404 })

  // Increment reminder count
  await supabase
    .from('patent_signing_requests')
    .update({
      reminder_count: (sigReq.reminder_count ?? 0) + 1,
      notification_sent_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  // Send reminder email
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

  if (resendKey) {
    const { Resend } = await import('resend')
    const resend = new Resend(resendKey)
    const docDescription = DOCUMENT_DESCRIPTIONS[sigReq.document_type] ?? DOCUMENT_DESCRIPTIONS.other
    const signUrl = `${appUrl}/sign/${sigReq.id}`

    await resend.emails.send({
      from: fromEmail,
      to: sigReq.signer_email,
      subject: `Reminder: Please sign your ${sigReq.document_label} for "${patent.title}"`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2 style="color:#1a1f36">Reminder: Signature Required</h2>
  <p>Hi ${sigReq.signer_name},</p>
  <p>This is a reminder that your signature is still needed for the patent application <strong>"${patent.title}"</strong>:</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0">
    <p style="margin:0;font-weight:bold">${sigReq.document_label}</p>
    <p style="margin:8px 0 0;color:#6b7280;font-size:14px">${docDescription}</p>
  </div>
  <p style="margin:24px 0">
    <a href="${signUrl}" style="display:inline-block;background:#1a1f36;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Sign Document →</a>
  </p>
  <p style="color:#6b7280;font-size:13px">This link is unique to you. Please do not forward it.</p>
  <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
    PatentPending · <a href="${appUrl}" style="color:#6366f1">patentpending.app</a>
  </p>
</div>`,
    }).catch((err: unknown) => console.error('[signing] reminder email error', err))
  }

  return NextResponse.json({ sent: true })
}
