import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}
function getServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

/**
 * GET /api/patents/[id]/observer-logs
 * Admin-only. Returns claw_observer_logs for the claw_patent linked to this patent_id.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const supabase = getServiceClient()

  // Get claw_patents id for this patent
  const { data: clawRow } = await supabase
    .from('claw_patents')
    .select('id')
    .eq('patent_id', patentId)
    .limit(1)
    .single()

  if (!clawRow) return NextResponse.json({ logs: [] })

  const { data: logs } = await supabase
    .from('claw_observer_logs')
    .select('id, step, severity, description, status, created_at')
    .eq('patent_id', clawRow.id)
    .order('severity', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ logs: logs ?? [] })
}
