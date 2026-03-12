/**
 * PATCH /api/admin/marketplace/leads/[id]
 * Admin-only: approve or reject a marketplace lead.
 * On approve: calls sendMarketplaceIntroduction to send dual intro emails + marks introduced.
 * On reject: sets status = 'rejected'.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMarketplaceIntroduction } from '@/lib/emails/marketplace-introduction'
import { waitUntil } from '@vercel/functions'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Admin gate ─────────────────────────────────────────────────────────────
  const { data: profile } = await supabaseService
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { action?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  // ── Fetch lead to verify it exists ─────────────────────────────────────────
  const { data: lead } = await supabaseService
    .from('marketplace_leads')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  if (body.action === 'approve') {
    // Mark approved + owner_notified_at immediately
    const { error } = await supabaseService
      .from('marketplace_leads')
      .update({
        status: 'approved',
        owner_notified_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send dual intro emails + mark introduced (non-blocking, fire-and-forget)
    waitUntil(sendMarketplaceIntroduction(id))

    return NextResponse.json({ success: true, action: 'approve' })
  }

  // Reject
  const { error: rejectErr } = await supabaseService
    .from('marketplace_leads')
    .update({ status: 'rejected' })
    .eq('id', id)

  if (rejectErr) {
    return NextResponse.json({ error: rejectErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, action: 'reject' })
}
