import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

/** GET /api/admin/crons — returns run log for all crons */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const svc = getServiceClient()

  // Last run per cron (for status table)
  const { data: lastRuns } = await svc
    .from('cron_run_log')
    .select('cron_name, started_at, completed_at, duration_seconds, status, output')
    .order('started_at', { ascending: false })
    .limit(100)

  // Most recent per cron_name
  type CronRunRow = { cron_name: string; started_at: string; completed_at: string | null; duration_seconds: number | null; status: string | null; output: string | null }
  const latestByCron: Record<string, CronRunRow> = {}
  for (const row of (lastRuns ?? []) as CronRunRow[]) {
    if (!latestByCron[row.cron_name]) latestByCron[row.cron_name] = row
  }

  // Last 20 runs for log section
  const { data: recentRuns } = await svc
    .from('cron_run_log')
    .select('id, cron_name, started_at, completed_at, duration_seconds, status, output')
    .order('started_at', { ascending: false })
    .limit(20)

  // Claw nightly limit setting
  const { data: settings } = await svc
    .from('app_settings')
    .select('value')
    .eq('key', 'claw_nightly_new_patent_limit')
    .single()

  const nightlyLimit = settings?.value != null ? Number(settings.value) : 2

  return NextResponse.json({
    latestByCron,
    recentRuns: recentRuns ?? [],
    nightlyLimit,
  })
}

/** PATCH /api/admin/crons — update nightly limit setting */
export async function PATCH(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json()
  const { nightlyLimit } = body

  if (typeof nightlyLimit !== 'number' || nightlyLimit < 0 || nightlyLimit > 20) {
    return NextResponse.json({ error: 'nightlyLimit must be 0-20' }, { status: 400 })
  }

  const svc = getServiceClient()
  const { error } = await svc
    .from('app_settings')
    .upsert({ key: 'claw_nightly_new_patent_limit', value: nightlyLimit }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, nightlyLimit })
}
