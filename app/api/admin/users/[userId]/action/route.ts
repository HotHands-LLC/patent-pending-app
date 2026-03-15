import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { FROM_ADMIN, withFooter, htmlToText } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/users/[userId]/action
 *
 * Admin-only user management actions.
 * Body: { action: 'resend_invite' | 'resend_confirmation' | 'reset_password' | 'manual_confirm', email?: string }
 *
 * All actions:
 *  1. Require is_admin = true on calling user
 *  2. Log to admin_actions table
 *  3. Return { ok: true, message: string }
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

function getClients(token: string) {
  const anonClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const serviceClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
  return { anonClient, serviceClient }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logAction(
  serviceClient: any,
  adminUserId: string,
  targetEmail: string,
  targetUserId: string | null,
  action: string,
  result: string
) {
  await serviceClient.from('admin_actions').insert({
    admin_user_id: adminUserId,
    target_email: targetEmail,
    target_user_id: targetUserId,
    action,
    result,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { anonClient, serviceClient } = getClients(token)

  const { data: { user: adminUser } } = await anonClient.auth.getUser()
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Admin gate ─────────────────────────────────────────────────────────────
  const { data: adminProfile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', adminUser.id)
    .single()
  if (!adminProfile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parse body ─────────────────────────────────────────────────────────────
  const body = await req.json()
  const { action, email: bodyEmail } = body as {
    action: 'resend_invite' | 'resend_confirmation' | 'reset_password' | 'manual_confirm'
    email?: string
  }

  const { userId: targetUserId } = await params // may be 'no-account' for invite-only users
  const resend = new Resend((process.env.RESEND_API_KEY ?? 'placeholder-resend-key'))

  // ── Resolve email ──────────────────────────────────────────────────────────
  let targetEmail = bodyEmail ?? ''
  if (!targetEmail && targetUserId !== 'no-account') {
    // Look up from auth.users via service client admin API
    const { data: userData } = await serviceClient.auth.admin.getUserById(targetUserId)
    targetEmail = userData?.user?.email ?? ''
  }
  if (!targetEmail) {
    return NextResponse.json({ error: 'Could not resolve user email' }, { status: 400 })
  }

  // ── Execute action ─────────────────────────────────────────────────────────
  try {
    switch (action) {

      // ── resend_invite: re-send the patent_collaborators invite email ──────
      case 'resend_invite': {
        const { data: inviteRow } = await serviceClient
          .from('patent_collaborators')
          .select('invite_token, patent_id, patents(title)')
          .eq('invited_email', targetEmail)
          .is('accepted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!inviteRow?.invite_token) {
          await logAction(serviceClient, adminUser.id, targetEmail, null, action, 'no_pending_invite')
          return NextResponse.json({ error: 'No pending invite found for this email' }, { status: 404 })
        }

        const inviteUrl = `${APP_URL}/invite/${inviteRow.invite_token}`
        const patentTitle = (inviteRow.patents as { title?: string } | null)?.title ?? 'a patent'
        const html = withFooter(`
          <div style="font-family:Arial,sans-serif;max-width:560px;">
            <h2 style="color:#1a1f36;">You've been invited to collaborate on a patent</h2>
            <p>You were invited to collaborate on <strong>${patentTitle}</strong> on PatentPending.</p>
            <p>Click the button below to accept and create your account:</p>
            <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#1a1f36;color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">
              Accept Invitation →
            </a>
            <p style="color:#6b7280;font-size:14px;">Or paste this link: <a href="${inviteUrl}">${inviteUrl}</a></p>
          </div>`)
        const { error: emailErr } = await resend.emails.send({
          from: FROM_ADMIN,
          to: targetEmail,
          subject: `Invitation to collaborate on patent: ${patentTitle}`,
          html,
          text: htmlToText(html),
        })
        if (emailErr) {
          await logAction(serviceClient, adminUser.id, targetEmail, null, action, `email_failed: ${emailErr.message}`)
          return NextResponse.json({ error: 'Failed to send invite email' }, { status: 500 })
        }
        await logAction(serviceClient, adminUser.id, targetEmail, null, action, 'invite_resent')
        return NextResponse.json({ ok: true, message: `Invite resent to ${targetEmail}` })
      }

      // ── resend_confirmation: resend signup confirmation / invite email ──────
      case 'resend_confirmation': {
        // inviteUserByEmail re-sends a confirmation/invite email for existing unconfirmed accounts
        const { error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(targetEmail)
        if (inviteErr) {
          await logAction(serviceClient, adminUser.id, targetEmail, targetUserId, action, `failed: ${inviteErr.message}`)
          return NextResponse.json({ error: inviteErr.message }, { status: 500 })
        }
        await logAction(serviceClient, adminUser.id, targetEmail, targetUserId, action, 'confirmation_resent')
        return NextResponse.json({ ok: true, message: `Confirmation email resent to ${targetEmail}` })
      }

      // ── reset_password: generate recovery link + send via Resend ─────────
      case 'reset_password': {
        const { data: linkData, error: linkErr } = await serviceClient.auth.admin.generateLink({
          type: 'recovery',
          email: targetEmail,
        })
        if (linkErr || !linkData?.properties?.action_link) {
          await logAction(serviceClient, adminUser.id, targetEmail, targetUserId, action, `link_failed: ${linkErr?.message}`)
          return NextResponse.json({ error: linkErr?.message ?? 'Failed to generate reset link' }, { status: 500 })
        }
        const resetUrl = linkData.properties.action_link
        const html = withFooter(`
          <div style="font-family:Arial,sans-serif;max-width:560px;">
            <h2 style="color:#1a1f36;">Reset your PatentPending password</h2>
            <p>An admin has sent you a password reset link for your PatentPending account.</p>
            <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1a1f36;color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">
              Reset Password →
            </a>
            <p style="color:#6b7280;font-size:14px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
          </div>`)
        await resend.emails.send({
          from: FROM_ADMIN,
          to: targetEmail,
          subject: 'Reset your PatentPending password',
          html,
          text: htmlToText(html),
        })
        await logAction(serviceClient, adminUser.id, targetEmail, targetUserId, action, 'reset_sent')
        return NextResponse.json({ ok: true, message: `Password reset email sent to ${targetEmail}` })
      }

      // ── manual_confirm: mark email as confirmed without user action ───────
      case 'manual_confirm': {
        if (!targetUserId || targetUserId === 'no-account') {
          return NextResponse.json({ error: 'User ID required for manual confirm' }, { status: 400 })
        }
        const { error: confirmErr } = await serviceClient.auth.admin.updateUserById(targetUserId, {
          email_confirm: true,
        })
        if (confirmErr) {
          await logAction(serviceClient, adminUser.id, targetEmail, targetUserId, action, `failed: ${confirmErr.message}`)
          return NextResponse.json({ error: confirmErr.message }, { status: 500 })
        }
        await logAction(serviceClient, adminUser.id, targetEmail, targetUserId, action, 'manually_confirmed')
        return NextResponse.json({ ok: true, message: `${targetEmail} manually confirmed` })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    console.error('[admin/users/action] error:', err)
    await logAction(serviceClient, adminUser.id, targetEmail, targetUserId === 'no-account' ? null : targetUserId, action, `exception: ${String(err)}`)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
