import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/**
 * PATCH /api/patents/[id]/access-requests/[requestId]
 * Body: { action: 'approve' | 'deny' }
 * Owner-only. Approve creates a patent_collaborators row + emails requester.
 * Deny updates status + emails requester.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: patentId, requestId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const action: 'approve' | 'deny' = body.action
  if (!['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve or deny' }, { status: 400 })
  }

  // Verify ownership
  const { data: patent } = await supabaseService
    .from('patents')
    .select('owner_id, title')
    .eq('id', patentId)
    .single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get access request
  const { data: request } = await supabaseService
    .from('patent_access_requests')
    .select('*')
    .eq('id', requestId)
    .eq('patent_id', patentId)
    .eq('status', 'pending')
    .single()
  if (!request) return NextResponse.json({ error: 'Request not found or already resolved' }, { status: 404 })

  const now = new Date().toISOString()

  if (action === 'approve') {
    // Create collaborator row
    const { error: collabError } = await supabaseService
      .from('patent_collaborators')
      .insert({
        patent_id: patentId,
        owner_id: user.id,
        user_id: request.requester_id,
        invited_email: '',  // will be filled below
        role: request.requested_role,
        ownership_pct: 0,
        accepted_at: now,   // pre-accepted (owner approved directly)
        can_edit: false,
      })

    if (collabError) {
      console.error('[access-requests] collab insert error:', collabError.message)
      return NextResponse.json({ error: 'Failed to create collaborator record' }, { status: 500 })
    }

    // Update request status
    await supabaseService
      .from('patent_access_requests')
      .update({ status: 'approved', resolved_at: now, resolved_by: user.id })
      .eq('id', requestId)

    // Get requester email to fill collab row + send notification
    const requesterAuth = await supabaseService.auth.admin.getUserById(request.requester_id)
    const requesterEmail = requesterAuth.data.user?.email
    if (requesterEmail) {
      // Backfill email on collab row (inserted without it above)
      await supabaseService
        .from('patent_collaborators')
        .update({ invited_email: requesterEmail })
        .eq('patent_id', patentId)
        .eq('user_id', request.requester_id)
        .eq('accepted_at', now)

      const patentUrl = `${APP_URL}/dashboard/patents/${patentId}`
      await sendEmail(buildEmail({
        to: requesterEmail,
        subject: `Access approved: "${patent.title}"`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#10b981">Access approved ✅</h2>
  <p>Your request for access to the patent <strong>"${patent.title}"</strong> has been approved.</p>
  <p>You've been added as a <strong>${request.requested_role.replace('_', ' ')}</strong>.</p>
  <p><a href="${patentUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Patent →</a></p>
</div>`,
      })).catch(() => {})
    }

    return NextResponse.json({ action: 'approved', patent_id: patentId })
  }

  // action === 'deny'
  await supabaseService
    .from('patent_access_requests')
    .update({ status: 'denied', resolved_at: now, resolved_by: user.id })
    .eq('id', requestId)

  // Notify requester
  try {
    const requesterAuth = await supabaseService.auth.admin.getUserById(request.requester_id)
    const requesterEmail = requesterAuth.data.user?.email
    if (requesterEmail) {
      await sendEmail(buildEmail({
        to: requesterEmail,
        subject: `Access request declined: "${patent.title}"`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#6b7280">Access request declined</h2>
  <p>Your request for access to the patent <strong>"${patent.title}"</strong> was not approved at this time.</p>
  <p>If you believe this is an error, please contact the patent owner directly.</p>
</div>`,
      }))
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ action: 'denied' })
}
