import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'
  )
}

// GET /api/signing/[requestId] — PUBLIC, no auth required
// Returns signing request details and updates status to 'viewed'
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params
  const supabase = getServiceClient()

  // Note: requested_by FK points to auth.users, not patent_profiles — join separately
  const { data: sigReq, error } = await supabase
    .from('patent_signing_requests')
    .select(
      `id, patent_id, signer_name, signer_email, document_type, document_label,
       prefill_data, status, signed_at, signed_date, created_at, requested_by,
       patents ( id, title, application_number, owner_id )`
    )
    .eq('id', requestId)
    .single()

  if (error || !sigReq) {
    console.error('[signing/GET] error:', error?.message, '| requestId:', requestId)
    return NextResponse.json({ error: 'Signing request not found' }, { status: 404 })
  }

  // Look up requester name from patent_profiles using requested_by as user_id
  let requestedByName = 'Patent Owner'
  if (sigReq.requested_by) {
    const { data: profile } = await supabase
      .from('patent_profiles')
      .select('name_first, name_last')
      .eq('user_id', sigReq.requested_by)
      .single()
    if (profile) {
      const name = [profile.name_first, profile.name_last].filter(Boolean).join(' ')
      if (name) requestedByName = name
    }
  }

  // Update status to 'viewed' if still 'pending'
  if (sigReq.status === 'pending') {
    await supabase
      .from('patent_signing_requests')
      .update({ status: 'viewed' })
      .eq('id', requestId)
  }

  return NextResponse.json({
    id: sigReq.id,
    patent_id: sigReq.patent_id,
    patent_title: (sigReq.patents as { title?: string } | null)?.title ?? '',
    application_number: (sigReq.patents as { application_number?: string | null } | null)?.application_number ?? null,
    document_type: sigReq.document_type,
    document_label: sigReq.document_label,
    signer_name: sigReq.signer_name,
    signer_email: sigReq.signer_email,
    prefill_data: sigReq.prefill_data ?? {},
    status: sigReq.status === 'pending' ? 'viewed' : sigReq.status,
    signed_at: sigReq.signed_at,
    signed_date: sigReq.signed_date,
    created_at: sigReq.created_at,
    requested_by_name: requestedByName,
  })
}
