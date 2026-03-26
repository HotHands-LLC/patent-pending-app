import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

/** GET /api/admin/claw-queue/list — full queue state for real-time polling */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const svc = getSvc()
  const { data: items } = await svc
    .from('claw_prompt_queue')
    .select('id, prompt_label, status, priority, started_at, completed_at, duration_seconds, claw_summary, completion_integrity')
    .in('status', ['queued', 'in_progress', 'complete', 'skipped'])
    .order('status', { ascending: false }) // in_progress first
    .order('priority', { ascending: true })
    .order('completed_at', { ascending: false })
    .limit(100)

  const all = items ?? []
  const active = all.find(i => i.status === 'in_progress') ?? null
  const queued = all.filter(i => i.status === 'queued')
  const complete = all.filter(i => i.status === 'complete').slice(0, 10)
  const skipped = all.filter(i => i.status === 'skipped')

  // Compute elapsed for active
  let elapsedSeconds = 0
  if (active?.started_at) {
    elapsedSeconds = Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000)
  }

  return NextResponse.json({
    active: active ? { ...active, elapsed_seconds: elapsedSeconds } : null,
    queued,
    complete,
    skipped,
    counts: {
      queued: queued.length,
      complete: complete.length + skipped.length,
      total: all.length,
    },
    polled_at: new Date().toISOString(),
  })
}
