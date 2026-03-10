import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildEmail, FROM_DEFAULT, sendEmail } from '@/lib/email'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  return new Resend(process.env.RESEND_API_KEY)
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/**
 * POST /api/patents/[id]/invite
 * Body: { invited_email, role, ownership_pct }
 * Owner-only. Sends invite email via Resend.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: patentId } = await params

    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    const { data: { user } } = await getUserClient(token).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { invited_email, role = 'co_inventor', ownership_pct = 0 } = body

    if (!invited_email || !invited_email.includes('@')) {
      return NextResponse.json({ error: 'Valid invited_email required' }, { status: 400 })
    }
    if (!['co_inventor', 'legal_counsel', 'agency', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Verify patent ownership
    const { data: patent, error: patentErr } = await supabaseService
      .from('patents')
      .select('id, title, owner_id')
      .eq('id', patentId)
      .single()

    if (patentErr || !patent) {
      return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
    }
    if (patent.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden — only the patent owner can invite collaborators' }, { status: 403 })
    }

    // Fetch inviter name for email personalisation
    const { data: inviterProfile } = await supabaseService
      .from('patent_profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()
    const inviterName = inviterProfile?.full_name ?? inviterProfile?.email ?? 'the patent owner'

    // Check for existing invite
    const { data: existing } = await supabaseService
      .from('patent_collaborators')
      .select('id, accepted_at')
      .eq('patent_id', patentId)
      .eq('invited_email', invited_email.toLowerCase().trim())
      .single()

    if (existing) {
      if (existing.accepted_at) {
        return NextResponse.json({ error: 'This person has already accepted an invite for this patent' }, { status: 409 })
      }
      // Re-send invite — regenerate token (DEFAULT only fires on INSERT, must do manually)
      const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      await supabaseService
        .from('patent_collaborators')
        .update({ role, ownership_pct, invite_token: newToken, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      await sendInviteEmail(invited_email, patent.title, newToken, role, ownership_pct, inviterName)
      return NextResponse.json({ message: 'Invite resent', id: existing.id })
    }

    // Generate token
    const inviteToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    // Create collaborator record
    const { data: collab, error: collabErr } = await supabaseService
      .from('patent_collaborators')
      .insert({
        patent_id: patentId,
        owner_id: user.id,
        invited_email: invited_email.toLowerCase().trim(),
        role,
        ownership_pct,
        invite_token: inviteToken,
      })
      .select('id')
      .single()

    if (collabErr || !collab) {
      console.error('[invite] insert error:', JSON.stringify(collabErr))
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    await sendInviteEmail(invited_email, patent.title, inviteToken, role, ownership_pct, inviterName)

    return NextResponse.json({ message: 'Invite sent', id: collab.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('[invite] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * GET /api/patents/[id]/invite (collaborators list — owner only)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify owner
  const { data: patent } = await supabaseService
    .from('patents')
    .select('owner_id')
    .eq('id', patentId)
    .single()

  if (patent?.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: collaborators } = await supabaseService
    .from('patent_collaborators')
    .select('id, invited_email, role, ownership_pct, accepted_at, created_at, user_id')
    .eq('patent_id', patentId)
    .order('created_at', { ascending: false })

  // Ghost detection: for each accepted row, check if user has ever signed in via admin API
  const enriched = await Promise.all(
    (collaborators ?? []).map(async (c) => {
      let is_ghost = false
      if (c.accepted_at && c.user_id) {
        const { data: authData } = await supabaseService.auth.admin.getUserById(c.user_id)
        is_ghost = !authData?.user || !authData.user.last_sign_in_at
      } else if (c.accepted_at && !c.user_id) {
        is_ghost = true
      }
      return { ...c, is_ghost }
    })
  )

  return NextResponse.json({ collaborators: enriched })
}

/**
 * DELETE /api/patents/[id]/invite?collaborator_id=xxx
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const collaboratorId = new URL(req.url).searchParams.get('collaborator_id')
  if (!collaboratorId) return NextResponse.json({ error: 'collaborator_id required' }, { status: 400 })

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: patent } = await supabaseService
    .from('patents')
    .select('owner_id')
    .eq('id', patentId)
    .single()

  if (patent?.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await supabaseService
    .from('patent_collaborators')
    .delete()
    .eq('id', collaboratorId)
    .eq('patent_id', patentId)

  return NextResponse.json({ message: 'Collaborator removed' })
}

async function sendInviteEmail(
  toEmail: string,
  patentTitle: string,
  token: string,
  role: string,
  ownershipPct: number,
  inviterName = 'the patent owner'
) {
  void getResend() // validates RESEND_API_KEY is set before proceeding
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  const inviteUrl = `${appUrl}/invite/${token}`

  const roleLabel = {
    co_inventor: 'Co-Inventor',
    legal_counsel: 'Legal Counsel',
    agency: 'Agency',
    viewer: 'Viewer',
  }[role] ?? role

  const counselNote = role === 'legal_counsel'
    ? `<p style="color:#374151;background:#f3f4f6;padding:12px;border-radius:8px;font-size:14px;">
        You have legal counsel view access to this patent. You can view and download all documents
        including the specification, claims, and figures.
       </p>`
    : ''

  const ownershipLine = ownershipPct > 0
    ? `<p style="color:#374151;">Your ownership stake: <strong>${ownershipPct}%</strong></p>`
    : ''

  const isLegal = role === 'legal_counsel'
  const subjectLine = isLegal
    ? `Legal access granted — ${patentTitle}`
    : `${inviterName} invited you to collaborate on a patent`

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h1 style="font-size:22px;color:#111827;">${isLegal ? 'Patent Document Access' : `${inviterName} invited you`}</h1>
      <p style="color:#374151;">You've been granted <strong>${roleLabel}</strong> access to:</p>
      <blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:16px 0;color:#1f2937;font-weight:600;">
        ${patentTitle}
      </blockquote>
      ${ownershipLine}
      ${counselNote}
      <p style="color:#374151;">Click the button below to accept and access the patent:</p>
      <a href="${inviteUrl}"
         style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0;">
        ${isLegal ? 'Access Patent Documents →' : 'Accept Invite →'}
      </a>
      <p style="color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:14px;margin-top:16px;">
        ⏰ <strong>This invitation link expires in 24 hours.</strong><br/>
        If it has expired, contact ${inviterName} to send a new one.
      </p>
      <p style="color:#6b7280;font-size:14px;margin-top:20px;">
        <strong>Don't have an account?</strong> That's fine — the link above will guide you through creating a free account and accepting your invite automatically.
      </p>
      <p style="color:#9ca3af;font-size:13px;margin-top:8px;">
        This link is single-use. If you have questions, reply to this email.
      </p>
    </div>`

  await sendEmail(buildEmail({
    to: toEmail,
    from: FROM_DEFAULT,
    subject: subjectLine,
    html,
  }))
}
