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
    if (!['co_inventor', 'attorney', 'viewer'].includes(role)) {
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
      // Re-send invite (update token to refresh)
      const { data: updated } = await supabaseService
        .from('patent_collaborators')
        .update({
          role,
          ownership_pct,
          invite_token: null, // will regenerate via DEFAULT
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('invite_token')
        .single()

      // Actually need to manually regenerate since DEFAULT only fires on INSERT
      const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      await supabaseService
        .from('patent_collaborators')
        .update({ invite_token: newToken, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      await sendInviteEmail(invited_email, patent.title, newToken, role, ownership_pct)
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

    await sendInviteEmail(invited_email, patent.title, inviteToken, role, ownership_pct)

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
    .select('id, invited_email, role, ownership_pct, accepted_at, created_at')
    .eq('patent_id', patentId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ collaborators: collaborators ?? [] })
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
  ownershipPct: number
) {
  const resend = getResend()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  const inviteUrl = `${appUrl}/invite/${token}`

  const roleLabel = {
    co_inventor: 'Co-Inventor',
    attorney: 'Attorney',
    viewer: 'Viewer',
  }[role] ?? role

  const ownershipLine = ownershipPct > 0
    ? `<p style="color:#374151;">Your ownership stake: <strong>${ownershipPct}%</strong></p>`
    : ''

  await resend.emails.send({
    from: 'PatentPending <notifications@patentpending.app>',
    to: toEmail,
    subject: `You've been invited to collaborate on a patent — ${patentTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h1 style="font-size:22px;color:#111827;">Patent Collaboration Invite</h1>
        <p style="color:#374151;">You've been invited as a <strong>${roleLabel}</strong> on:</p>
        <blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:16px 0;color:#1f2937;font-weight:600;">
          ${patentTitle}
        </blockquote>
        ${ownershipLine}
        <p style="color:#374151;">Click below to accept and view your patent details:</p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0;">
          Accept Invite →
        </a>
        <p style="color:#9ca3af;font-size:13px;margin-top:24px;">
          This link expires after use. If you have questions, reply to this email.
        </p>
      </div>
    `,
  })
}
