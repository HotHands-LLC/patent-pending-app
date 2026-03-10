import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, FROM_DEFAULT, sendEmail } from '@/lib/email'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/**
 * POST /api/patents/[id]/resend-invite
 * Body: { collaborator_id }
 * Owner-only. Invalidates old token, generates new one, re-sends email.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: patentId } = await params

    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const authToken = authHeader.slice(7)
    const { data: { user } } = await getUserClient(authToken).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify patent ownership
    const { data: patent } = await supabaseService
      .from('patents')
      .select('id, title, owner_id')
      .eq('id', patentId)
      .single()
    if (!patent || patent.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { collaborator_id } = body
    if (!collaborator_id) {
      return NextResponse.json({ error: 'collaborator_id required' }, { status: 400 })
    }

    // Fetch collaborator
    const { data: collab } = await supabaseService
      .from('patent_collaborators')
      .select('id, invited_email, role, ownership_pct, accepted_at, user_id')
      .eq('id', collaborator_id)
      .eq('patent_id', patentId)
      .single()

    if (!collab) return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 })

    // Ghost check: accepted but user has never signed in → allow resend
    if (collab.accepted_at) {
      let isGhost = false
      if (collab.user_id) {
        const { data: authData } = await supabaseService.auth.admin.getUserById(collab.user_id)
        // Ghost = accepted + auth account exists but never signed in
        isGhost = !authData?.user || !authData.user.last_sign_in_at
      } else {
        isGhost = true // accepted but no user_id at all
      }
      if (!isGhost) {
        return NextResponse.json({ error: 'This collaborator has already accepted and signed in' }, { status: 409 })
      }
      // Ghost: clear accepted state so they can re-onboard properly
      console.log(`[resend-invite] Ghost detected for ${collab.invited_email} — clearing accepted state`)
    }

    // Regenerate token + reset created_at (so 24h window restarts from now)
    const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    await supabaseService
      .from('patent_collaborators')
      .update({
        invite_token: newToken,
        accepted_at: null,  // clear ghost/stale accept state so invite can be re-consumed
        user_id: null,       // unlink ghost user so fresh accept links properly
        created_at: new Date().toISOString(), // reset expiry window
        updated_at: new Date().toISOString(),
      })
      .eq('id', collaborator_id)

    // Fetch inviter name
    const { data: inviterProfile } = await supabaseService
      .from('patent_profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()
    const inviterName = inviterProfile?.full_name ?? inviterProfile?.email ?? 'the patent owner'

    // Send fresh email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
    const inviteUrl = `${appUrl}/invite/${newToken}`

    const roleLabel: Record<string, string> = {
      co_inventor: 'Co-Inventor',
      counsel: 'Legal Counsel',
      attorney: 'Attorney',
      viewer: 'Viewer',
    }
    const isLegal = collab.role === 'counsel' || collab.role === 'attorney'
    const ownershipLine = collab.ownership_pct > 0
      ? `<p style="color:#374151;">Your ownership stake: <strong>${collab.ownership_pct}%</strong></p>`
      : ''

    const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h1 style="font-size:22px;color:#111827;">${inviterName} re-sent your invite</h1>
      <p style="color:#374151;">You've been granted <strong>${roleLabel[collab.role] ?? collab.role}</strong> access to:</p>
      <blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:16px 0;color:#1f2937;font-weight:600;">
        ${patent.title}
      </blockquote>
      ${ownershipLine}
      <p style="color:#374151;">Click the button below to accept and access the patent:</p>
      <a href="${inviteUrl}"
         style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0;">
        ${isLegal ? 'Access Patent Documents →' : 'Accept Invite →'}
      </a>
      <p style="color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:14px;margin-top:16px;">
        ⏰ <strong>This invitation link expires in 24 hours.</strong><br/>
        If it expires again, contact ${inviterName} for a new link.
      </p>
      <p style="color:#6b7280;font-size:14px;margin-top:20px;">
        <strong>Don't have an account?</strong> The link above will guide you through creating a free account automatically.
      </p>
    </div>`

    await sendEmail(buildEmail({
      to: collab.invited_email,
      from: FROM_DEFAULT,
      subject: `${inviterName} re-sent your invite — ${patent.title}`,
      html,
    }))

    console.log(`[resend-invite] Resent to ${collab.invited_email} for patent ${patentId}`)
    return NextResponse.json({ message: 'Invite resent', email: collab.invited_email })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('[resend-invite] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
