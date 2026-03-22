import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CHAD_UUID        = '8c11a80b-2a67-4e52-a151-a524ffca145e' // support@hotdeck.com
const CHAD_NAME        = 'Chad Len Bostwick'
const CHAD_CUSTOMER_NO = '214633'
const CHAD_ASSIGNEE    = 'Hot Hands IP, LLC'

function getServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

/**
 * POST /api/admin/claw-patents/[id]/claim
 * Admin-only. Transfers a Claw-drafted patent to Chad's account.
 *
 * [id] = claw_patents.id (UUID)
 *
 * Actions:
 *   1. Fetch claw_patents row → get patent_id
 *   2. Update patents: owner_id=chad, is_claw_draft=false, inventors, assignee
 *   3. Update claw_patents: status='claimed'
 *   4. Return success + patent link
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clawId } = await params

  // ── Auth — must be Chad (support@hotdeck.com) ──────────────────────────────
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id !== CHAD_UUID) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const svc = getServiceClient()

  // ── Fetch claw_patents row ─────────────────────────────────────────────────
  const { data: clawRow, error: clawErr } = await svc
    .from('claw_patents')
    .select('id, patent_id, status, title')
    .eq('id', clawId)
    .single()

  if (clawErr || !clawRow) {
    return NextResponse.json({ error: 'Claw patent not found' }, { status: 404 })
  }
  if (clawRow.status === 'claimed') {
    return NextResponse.json({ error: 'Already claimed' }, { status: 409 })
  }
  if (!clawRow.patent_id) {
    return NextResponse.json({ error: 'No linked patent row' }, { status: 422 })
  }

  // ── Update patents row ─────────────────────────────────────────────────────
  const { error: patentErr } = await svc
    .from('patents')
    .update({
      owner_id:       CHAD_UUID,
      is_claw_draft:  false,
      inventors:      [CHAD_NAME],
      uspto_customer_number: CHAD_CUSTOMER_NO,
      // Note: assignee column doesn't exist yet — store in tags for now
      tags:           ['claw-invented', 'claimed', CHAD_ASSIGNEE.toLowerCase().replace(/[^a-z0-9]/g, '-')],
    })
    .eq('id', clawRow.patent_id)

  if (patentErr) {
    console.error('[claim] patent update failed:', patentErr)
    return NextResponse.json({ error: 'Failed to transfer patent' }, { status: 500 })
  }

  // ── Update claw_patents status ─────────────────────────────────────────────
  await svc.from('claw_patents').update({ status: 'claimed' }).eq('id', clawId)

  return NextResponse.json({
    success:    true,
    patent_id:  clawRow.patent_id,
    title:      clawRow.title,
    message:    `Patent claimed — it's now in your account. Ready to review and file.`,
    dashboard:  `/dashboard/patents/${clawRow.patent_id}`,
  })
}
