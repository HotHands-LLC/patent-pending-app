/**
 * POST /api/admin/users/[userId]/force-confirm
 *
 * Admin-only: force-confirm an unverified user account.
 *
 * 1. Verifies caller is an admin (is_admin = true in patent_profiles)
 * 2. Calls supabase.auth.admin.updateUserById({ email_confirm: true })
 * 3. Upserts a patent_profiles row so the user appears in the app immediately
 * 4. Returns the updated user record so the client can refresh the row inline
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const serviceClient = createClient(
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: targetUserId } = await params

    // Auth check
    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user: caller } } = await getUserClient(token).auth.getUser()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Admin gate
    const { data: callerProfile } = await serviceClient
      .from('patent_profiles')
      .select('is_admin')
      .eq('id', caller.id)
      .single()

    if (!callerProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    if (!targetUserId || targetUserId === 'no-account') {
      return NextResponse.json({ error: 'Valid user ID required' }, { status: 400 })
    }

    // Fetch target user to get email + current state
    const { data: { user: targetUser }, error: fetchErr } = await serviceClient.auth.admin.getUserById(targetUserId)
    if (fetchErr || !targetUser) {
      return NextResponse.json({ error: fetchErr?.message ?? 'User not found' }, { status: 404 })
    }

    if (targetUser.email_confirmed_at) {
      return NextResponse.json({
        ok: true,
        already_confirmed: true,
        message: `${targetUser.email} is already confirmed`,
      })
    }

    // Step 1: Confirm email
    const { error: confirmErr } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      email_confirm: true,
    })
    if (confirmErr) {
      return NextResponse.json({ error: `Confirm failed: ${confirmErr.message}` }, { status: 500 })
    }

    // Step 2: Upsert patent_profiles so user appears in app immediately
    const { error: profileErr } = await serviceClient
      .from('patent_profiles')
      .upsert({
        id:         targetUserId,
        email:      targetUser.email ?? '',
        name_first: targetUser.user_metadata?.full_name?.split(' ')[0] ?? null,
        name_last:  targetUser.user_metadata?.full_name?.split(' ').slice(1).join(' ') ?? null,
        is_admin:   false,
      }, { onConflict: 'id' })

    if (profileErr) {
      // Non-fatal — confirm succeeded, profile upsert failure is secondary
      console.warn('[force-confirm] patent_profiles upsert failed:', profileErr.message)
    }

    // Log admin action
    await serviceClient
      .from('admin_action_log')
      .insert({
        actor_id:    caller.id,
        target_email: targetUser.email,
        target_user_id: targetUserId,
        action:      'force_confirm',
        result:      'success',
      })
      .then(() => {}) // fire-and-forget — table may not exist, ignore error

    return NextResponse.json({
      ok: true,
      message: `${targetUser.email} confirmed and profile ensured`,
      user: {
        id:                 targetUserId,
        email:              targetUser.email,
        email_confirmed_at: new Date().toISOString(),
        auth_status:        'confirmed',
      },
    })

  } catch (err) {
    console.error('[force-confirm] error:', err)
    return NextResponse.json({
      error: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }
}
