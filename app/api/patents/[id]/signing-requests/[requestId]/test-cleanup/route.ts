/**
 * DELETE /api/patents/[id]/signing-requests/[requestId]/test-cleanup
 * Patent owner only. Deletes a signing request ONLY if it is a test request.
 * Safety guard: document_label must include 'test' (case-insensitive).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
)

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: patentId, requestId } = await params

  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify patent ownership
  const { data: patent } = await supabaseService
    .from('patents')
    .select('owner_id')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Load signing request
  const { data: sigReq } = await supabaseService
    .from('signing_requests')
    .select('id, document_label, correspondence_id')
    .eq('id', requestId)
    .eq('patent_id', patentId)
    .single()

  if (!sigReq) return NextResponse.json({ error: 'Signing request not found' }, { status: 404 })

  // Safety guard — must be a test request
  const isTest = sigReq.document_label?.toLowerCase().includes('test')
  if (!isTest) {
    return NextResponse.json({ error: 'Not a test request' }, { status: 403 })
  }

  // Delete correspondence if linked
  if (sigReq.correspondence_id) {
    await supabaseService
      .from('patent_correspondence')
      .delete()
      .eq('id', sigReq.correspondence_id)
  }

  // Delete signing request
  const { error } = await supabaseService
    .from('signing_requests')
    .delete()
    .eq('id', requestId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
