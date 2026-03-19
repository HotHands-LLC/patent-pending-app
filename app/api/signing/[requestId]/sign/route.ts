import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateSignedPdf } from '@/lib/signing/generate-signed-pdf'

export const dynamic = 'force-dynamic'

const S_SIG_REGEX = /^\/[a-zA-Z\s\-'.]+\/$/

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'
  )
}

// POST /api/signing/[requestId]/sign — PUBLIC, no auth
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params
  const supabase = getServiceClient()

  let body: { s_signature: string; signed_date: string; attested: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate inputs
  if (!body.s_signature || !S_SIG_REGEX.test(body.s_signature)) {
    return NextResponse.json(
      { error: 'Invalid S-signature format. Must be /First Last/' },
      { status: 400 }
    )
  }
  if (!body.attested) {
    return NextResponse.json({ error: 'Attestation required' }, { status: 400 })
  }
  if (!body.signed_date) {
    return NextResponse.json({ error: 'signed_date required' }, { status: 400 })
  }

  // Fetch signing request
  const { data: sigReq, error: fetchErr } = await supabase
    .from('patent_signing_requests')
    .select(
      `id, patent_id, signer_name, signer_email, document_type, document_label,
       prefill_data, status, requested_by,
       patents ( id, title, application_number, owner_id ),
       requested_by_profile:patent_profiles!patent_signing_requests_requested_by_fkey ( name_first, name_last, email )`
    )
    .eq('id', requestId)
    .single()

  if (fetchErr || !sigReq) {
    return NextResponse.json({ error: 'Signing request not found' }, { status: 404 })
  }

  if (!['pending', 'viewed'].includes(sigReq.status)) {
    return NextResponse.json(
      { error: `Cannot sign — current status is '${sigReq.status}'` },
      { status: 409 }
    )
  }

  const patent = (sigReq.patents as unknown) as { id: string; title: string; application_number: string | null; owner_id: string } | null
  if (!patent) {
    return NextResponse.json({ error: 'Associated patent not found' }, { status: 404 })
  }

  // Generate PDF
  const pdfBytes = await generateSignedPdf(
    {
      document_type: sigReq.document_type,
      document_label: sigReq.document_label,
      signer_name: sigReq.signer_name,
      s_signature: body.s_signature,
      signed_date: body.signed_date,
      prefill_data: (sigReq.prefill_data as Record<string, string>) ?? {},
    },
    patent.title
  )

  // Upload PDF to Supabase Storage
  const fileName = `patents/${patent.id}/signed/${requestId}-${Date.now()}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('patent-documents')
    .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: false })

  // If storage upload fails, continue without attachment path
  const storagePath = uploadErr ? null : fileName

  // Save correspondence record
  const now = new Date().toISOString()
  const { data: correspondence, error: corrErr } = await supabase
    .from('patent_correspondence')
    .insert({
      patent_id: patent.id,
      owner_id: patent.owner_id,
      title: `Signed: ${sigReq.document_label} — ${sigReq.signer_name}`,
      type: 'filing',
      content: `Document signed electronically on ${body.signed_date}.\n\nS-Signature: ${body.s_signature}\nSigner: ${sigReq.signer_name} <${sigReq.signer_email}>\nDocument: ${sigReq.document_label}\n\nSigned pursuant to 37 CFR 1.4(d)(2).`,
      from_party: sigReq.signer_name,
      to_party: 'Patent Record',
      correspondence_date: body.signed_date,
      tags: ['signed_document', sigReq.document_type],
      attachments: storagePath
        ? [
            {
              name: `${sigReq.document_label}.pdf`,
              storage_path: storagePath,
              uploaded_at: now,
              type: 'application/pdf',
            },
          ]
        : [],
    })
    .select('id')
    .single()

  if (corrErr) {
    console.error('[signing] correspondence insert error', corrErr)
    return NextResponse.json({ error: 'Failed to save correspondence' }, { status: 500 })
  }

  // Update signing request
  const { error: updateErr } = await supabase
    .from('patent_signing_requests')
    .update({
      status: 'signed',
      signed_at: now,
      s_signature: body.s_signature,
      signed_date: body.signed_date,
      correspondence_id: correspondence.id,
    })
    .eq('id', requestId)

  if (updateErr) {
    console.error('[signing] update error', updateErr)
    return NextResponse.json({ error: 'Failed to update signing request' }, { status: 500 })
  }

  // Send completion notification to patent owner
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

  if (resendKey) {
    // Get owner email
    const { data: ownerProfile } = await supabase
      .from('patent_profiles')
      .select('email, name_first')
      .eq('id', patent.owner_id)
      .single()

    if (ownerProfile?.email) {
      const { Resend } = await import('resend')
      const resend = new Resend(resendKey)
      const patentUrl = `${appUrl}/dashboard/patents/${patent.id}`

      await resend.emails.send({
        from: fromEmail,
        to: ownerProfile.email,
        subject: `✓ ${sigReq.signer_name} has signed the ${sigReq.document_label}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2 style="color:#059669">✓ Document Signed</h2>
  <p>Hi ${ownerProfile.name_first ?? 'there'},</p>
  <p><strong>${sigReq.signer_name}</strong> has signed the <strong>${sigReq.document_label}</strong> on <strong>${body.signed_date}</strong>.</p>
  <p>The signed document has been saved to the Correspondence tab of your patent record.</p>
  <p style="margin:24px 0">
    <a href="${patentUrl}" style="display:inline-block;background:#1a1f36;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Patent Dashboard →</a>
  </p>
  <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
    PatentPending · <a href="${appUrl}" style="color:#6366f1">patentpending.app</a>
  </p>
</div>`,
      }).catch((err: unknown) => console.error('[signing] owner notification error', err))
    }
  }

  return NextResponse.json({ success: true, correspondence_id: correspondence.id })
}
