/**
 * DELETE /api/patents/[id]/correspondence/[corrId]
 * Deletes a patent_correspondence record.
 * Authorization: patent owner OR admin (is_internal = true or admin email)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = ['support@hotdeck.com', 'chad@totaltea.com', 'agent@hotdeck.com']

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; corrId: string }> }
) {
  const { id, corrId } = await params

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

  // Check correspondence record exists and belongs to this patent
  const { data: corrRecord, error: corrErr } = await supabase
    .from('patent_correspondence')
    .select('id, patent_id')
    .eq('id', corrId)
    .eq('patent_id', id)
    .single()

  if (corrErr || !corrRecord) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check authorization: patent owner OR admin
  const { data: patent } = await supabase
    .from('patents')
    .select('owner_id')
    .eq('id', id)
    .single()

  const isOwner = patent?.owner_id === user.id

  let isAdmin = false
  if (!isOwner) {
    const { data: profile } = await supabase
      .from('patent_profiles')
      .select('is_internal, email, role')
      .eq('id', user.id)
      .single()

    isAdmin =
      profile?.is_internal === true ||
      profile?.role === 'admin' ||
      (profile?.email != null && ADMIN_EMAILS.includes(profile.email))
  }

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Nullify any signing_requests that reference this correspondence
  await supabase
    .from('patent_signing_requests')
    .update({ correspondence_id: null })
    .eq('correspondence_id', corrId)

  // Delete the correspondence record
  const { error: deleteErr } = await supabase
    .from('patent_correspondence')
    .delete()
    .eq('id', corrId)

  if (deleteErr) {
    console.error('[correspondence/delete] delete error:', deleteErr)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
