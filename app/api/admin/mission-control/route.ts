import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getUserClient(jwt: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null
}

// GET /api/admin/mission-control — all dashboard data in one call
export async function GET(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = getServiceClient()

  // Verify admin
  const { data: profile } = await svc
    .from('patent_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const twentyOneDaysFromNow = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    patentsRes,
    queueInProgressRes,
    queueQueuedRes,
    queueLastCompletedRes,
    cronLogRes,
    radarRes,
    radarLastRunRes,
    clawErrorsHourRes,
    clawErrorsDayRes,
    appSettingsRes,
    communityRadarPendingRes,
  ] = await Promise.all([
    // Patent deadlines
    svc.from('patents')
      .select('id, title, application_number, non_provisional_deadline, provisional_deadline, filing_status, status')
      .not('filing_status', 'eq', 'filed')
      .order('non_provisional_deadline', { ascending: true })
      .limit(50),

    // Queue: in-progress
    svc.from('claw_prompt_queue')
      .select('id, prompt_label, started_at')
      .eq('status', 'in_progress')
      .limit(5),

    // Queue: queued count
    svc.from('claw_prompt_queue')
      .select('id, prompt_label, priority, created_at')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(20),

    // Queue: last completed
    svc.from('claw_prompt_queue')
      .select('id, prompt_label, completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1),

    // Cron run log (may not exist)
    svc.from('cron_run_log')
      .select('id, cron_name, status, ran_at, notes')
      .gte('ran_at', oneDayAgo)
      .order('ran_at', { ascending: false })
      .limit(50),

    // Community radar pending count (draft or pending reply_status)
    svc.from('community_radar')
      .select('id', { count: 'exact', head: true })
      .in('reply_status', ['draft', 'pending']),

    // Radar last run from app_settings
    svc.from('app_settings')
      .select('value')
      .eq('key', 'radar_last_run')
      .single(),

    // Claw errors: last hour (Pattie health)
    svc.from('claw_errors')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo),

    // Claw errors: last 24h (Supabase health)
    svc.from('claw_errors')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo),

    // App settings: last_deploy_sha, chad_action_* keys, queue_auto_run_enabled
    svc.from('app_settings')
      .select('key, value')
      .in('key', [
        'last_deploy_sha',
        'chad_action_steve_mccain',
        'chad_action_improvmx',
        'chad_action_vercel',
        'queue_auto_run_enabled',
      ]),

    // Community radar pending (for health strip)
    svc.from('community_radar')
      .select('id', { count: 'exact', head: true })
      .in('reply_status', ['draft', 'pending']),
  ])

  // ── Patents ──────────────────────────────────────────────────────────────────

  // Hardcoded fallback patents (shown if not in DB)
  const FALLBACK_PATENTS = [
    { id: 'fallback-readi', title: 'READI', application_number: null, np_deadline: '2026-04-18', status: 'provisional', is_fallback: true },
    { id: 'fallback-qrplus', title: 'QR+', application_number: null, np_deadline: '2026-04-18', status: 'provisional', is_fallback: true },
    { id: 'fallback-traffic', title: 'Traffic Stop', application_number: null, np_deadline: '2026-09-30', status: 'provisional', is_fallback: true },
  ]

  const dbPatents = (patentsRes.data ?? []).map(p => ({
    id: p.id,
    title: p.title,
    application_number: p.application_number ?? null,
    np_deadline: p.non_provisional_deadline ?? p.provisional_deadline ?? null,
    status: p.filing_status ?? p.status ?? null,
    is_fallback: false,
  })).filter(p => p.np_deadline !== null)

  // Fill in fallback patents not already in DB by title match
  const dbTitlesLower = dbPatents.map(p => p.title?.toLowerCase() ?? '')
  const missingFallbacks = FALLBACK_PATENTS.filter(f => !dbTitlesLower.some(t => t.includes(f.title.toLowerCase())))
  const patents = [...dbPatents, ...missingFallbacks]
    .sort((a, b) => {
      if (!a.np_deadline) return 1
      if (!b.np_deadline) return -1
      return a.np_deadline.localeCompare(b.np_deadline)
    })

  // Patents within 21 days for action items
  const urgentPatents = patents.filter(p => {
    if (!p.np_deadline) return false
    const days = Math.ceil((new Date(p.np_deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return days <= 21 && p.status !== 'filed'
  })

  // ── Queue ─────────────────────────────────────────────────────────────────

  const inProgress = queueInProgressRes.data ?? []
  const queued = queueQueuedRes.data ?? []
  const lastCompleted = queueLastCompletedRes.data?.[0] ?? null

  const autoRunEnabled = (() => {
    const settings = (appSettingsRes.data ?? [])
    const val = settings.find(s => s.key === 'queue_auto_run_enabled')?.value
    return val !== 'false' && val !== false && val !== '0' && val !== 0
  })()

  let queueStatus: 'running' | 'idle' | 'paused'
  if (!autoRunEnabled) queueStatus = 'paused'
  else if (inProgress.length > 0) queueStatus = 'running'
  else queueStatus = 'idle'

  const currentTask = inProgress[0] ?? null
  const elapsedMs = currentTask?.started_at
    ? now.getTime() - new Date(currentTask.started_at).getTime()
    : 0
  const elapsedMin = Math.floor(elapsedMs / 60000)

  // ── Cron Health ───────────────────────────────────────────────────────────

  const cronLogError = cronLogRes.error
  let cronHealth: Array<{ cron_name: string; status: string; ran_at: string; notes: string | null }> | null = null
  if (!cronLogError && cronLogRes.data) {
    // De-dupe by cron_name keeping most recent
    const seen = new Map<string, (typeof cronLogRes.data)[0]>()
    for (const row of cronLogRes.data) {
      if (!seen.has(row.cron_name)) seen.set(row.cron_name, row)
    }
    cronHealth = Array.from(seen.values()).map(r => ({
      cron_name: r.cron_name,
      status: r.status,
      ran_at: r.ran_at,
      notes: r.notes ?? null,
    }))
  }

  // ── Community Radar ────────────────────────────────────────────────────────

  const radarPendingCount = radarRes.count ?? 0
  const radarLastRun = radarLastRunRes.data?.value ?? null

  // ── Platform Health ────────────────────────────────────────────────────────

  const pattieErrors = clawErrorsHourRes.count ?? 0
  const supabaseErrors = clawErrorsDayRes.count ?? 0

  const settingsMap = (appSettingsRes.data ?? []).reduce<Record<string, string | null>>((acc, s) => {
    acc[s.key] = s.value as string | null
    return acc
  }, {})

  const lastDeploySha = settingsMap['last_deploy_sha'] ?? null

  const health = {
    pattie: {
      status: pattieErrors === 0 ? 'green' : pattieErrors <= 3 ? 'yellow' : 'red',
      errors_last_hour: pattieErrors,
    },
    supabase: {
      status: supabaseErrors === 0 ? 'green' : supabaseErrors <= 10 ? 'yellow' : 'red',
      errors_last_24h: supabaseErrors,
    },
    vercel: {
      status: 'green',
      last_deploy_sha: lastDeploySha,
    },
    queue: {
      status: queueStatus,
      queued_count: queued.length,
      current_task: currentTask?.prompt_label ?? null,
    },
    radar: {
      status: radarPendingCount === 0 ? 'green' : radarPendingCount <= 5 ? 'yellow' : 'red',
      pending_count: radarPendingCount,
    },
  }

  // ── Chad Action Items ──────────────────────────────────────────────────────

  // Ensure chad_action_steve_mccain exists (create if not)
  let steveMccainValue = settingsMap['chad_action_steve_mccain'] ?? null
  if (steveMccainValue === null) {
    const defaultVal = '⏳ Awaiting Steve: AIA/01 + sb0015a signatures'
    await svc.from('app_settings').upsert({ key: 'chad_action_steve_mccain', value: defaultVal }, { onConflict: 'key' })
    steveMccainValue = defaultVal
  }

  const actionItems = {
    dynamic_patents: urgentPatents,
    static: {
      steve_mccain: steveMccainValue !== 'done' ? steveMccainValue : null,
      improvmx: settingsMap['chad_action_improvmx'] !== 'done'
        ? 'Register patentpending.app at improvmx.com → add pattie@→agent@hotdeck.com alias'
        : null,
      vercel: settingsMap['chad_action_vercel'] !== 'done'
        ? 'Reconnect GitHub in Vercel dashboard (repo moved to hotdeck-mcp/patentpending-app)'
        : null,
    },
  }

  return NextResponse.json({
    patents,
    queue: {
      status: queueStatus,
      in_progress: inProgress,
      queued_count: queued.length,
      queued,
      current_task: currentTask,
      elapsed_min: elapsedMin,
      last_completed: lastCompleted,
      auto_run_enabled: autoRunEnabled,
    },
    cron_health: cronHealth,
    radar: {
      pending_count: radarPendingCount,
      last_run: radarLastRun,
    },
    health,
    action_items: actionItems,
  })
}

// POST /api/admin/mission-control — dismiss a static action item
export async function POST(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = getServiceClient()
  const { data: profile } = await svc
    .from('patent_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { key } = body as { key: string }

  const allowedKeys = ['chad_action_steve_mccain', 'chad_action_improvmx', 'chad_action_vercel']
  if (!allowedKeys.includes(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  await svc.from('app_settings').upsert({ key, value: 'done' }, { onConflict: 'key' })
  return NextResponse.json({ ok: true })
}
