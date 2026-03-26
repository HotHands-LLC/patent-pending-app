import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const svc = getSvc()
  const now = new Date().toISOString()
  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString()

  const [queueRes, errorsRes, patentsRes, cronRes] = await Promise.all([
    svc.from('claw_prompt_queue')
      .select('id, prompt_label, status, started_at, priority')
      .in('status', ['queued', 'in_progress'])
      .order('status', { ascending: false }) // in_progress first
      .order('priority', { ascending: true })
      .limit(20),
    svc.from('claw_errors')
      .select('id, severity, status')
      .eq('status', 'open')
      .gte('created_at', twoHoursAgo),
    svc.from('patents')
      .select('id, status, filing_status')
      .not('status', 'in', '("abandoned","research_import","archived")'),
    svc.from('cron_run_log')
      .select('cron_name, status, started_at')
      .eq('status', 'running')
      .limit(1),
  ])

  const queueItems = queueRes.data ?? []
  const active = queueItems.find(q => q.status === 'in_progress')
  const waiting = queueItems.filter(q => q.status === 'queued').length
  const errors = errorsRes.data ?? []
  const patents = patentsRes.data ?? []
  const runningCron = (cronRes.data ?? [])[0]

  // Queue status
  let queueStatus: 'running' | 'idle' | 'paused' | 'clear' = 'clear'
  let elapsedSeconds = 0
  if (active) {
    queueStatus = 'running'
    elapsedSeconds = Math.floor((Date.now() - new Date(active.started_at ?? now).getTime()) / 1000)
  } else if (waiting > 0) {
    // Check if paused
    const { data: pauseSetting } = await svc.from('app_settings').select('value').eq('key', 'queue_auto_run_enabled').single()
    queueStatus = (pauseSetting?.value === 'false') ? 'paused' : 'idle'
  }

  // Next cron (hardcoded schedule — expand later from cron list)
  const cronSchedules: Array<{ name: string; label: string; hour: number; minute: number }> = [
    { name: 'claw-invents-nightly', label: 'Invention Run', hour: 23, minute: 0 },
    { name: 'claw-observer-nightly', label: 'Observer', hour: 0, minute: 30 },
    { name: 'daily-briefing', label: 'Briefing', hour: 8, minute: 0 },
  ]
  const nowDate = new Date()
  let nextCron = { name: 'claw-invents-nightly', label: 'Invention Run', minutesUntil: 0 }
  let minMins = Infinity
  for (const c of cronSchedules) {
    const fire = new Date(nowDate)
    fire.setHours(c.hour, c.minute, 0, 0)
    if (fire <= nowDate) fire.setDate(fire.getDate() + 1)
    const mins = Math.round((fire.getTime() - nowDate.getTime()) / 60000)
    if (mins < minMins) { minMins = mins; nextCron = { name: c.name, label: c.label, minutesUntil: mins } }
  }

  // Error counts by severity
  const p0 = errors.filter(e => e.severity === 'P0').length
  const p1 = errors.filter(e => e.severity === 'P1').length
  const p2 = errors.filter(e => e.severity === 'P2').length

  // Patent breakdown
  const provisionalReady = patents.filter(p => p.filing_status === 'provisional_ready' || p.status === 'provisional_ready').length
  const filed = patents.filter(p => ['provisional_filed','nonprov_filed','filed'].includes(p.filing_status ?? '')).length

  return NextResponse.json({
    queue: {
      status: queueStatus,
      active_label: active?.prompt_label ?? null,
      active_started_at: active?.started_at ?? null,
      elapsed_seconds: elapsedSeconds,
      estimated_minutes: Math.max(1, Math.round((20 * 60 - elapsedSeconds) / 60)),
      items_waiting: waiting,
    },
    next_cron: {
      name: nextCron.name,
      label: nextCron.label,
      minutes_until: nextCron.minutesUntil,
      currently_running: !!runningCron,
      running_name: runningCron?.cron_name ?? null,
    },
    errors: { p0_count: p0, p1_count: p1, p2_count: p2 },
    patents: { active_count: patents.length, provisional_ready: provisionalReady, filed },
    health_check: await (async () => {
      try {
        const { data } = await svc.from('health_check_log')
          .select('checked_at, has_errors').order('checked_at', { ascending: false }).limit(1).single()
        if (!data) return { status: 'unknown', minutes_ago: null }
        const minsAgo = Math.floor((Date.now() - new Date(data.checked_at).getTime()) / 60000)
        return {
          status: data.has_errors ? 'error' : minsAgo > 35 ? 'stale' : 'ok',
          minutes_ago: minsAgo,
          has_errors: data.has_errors,
        }
      } catch { return { status: 'unknown', minutes_ago: null } }
    })(),
    llm_status: await (async () => {
      try {
        const { data } = await svc.from('llm_budget_config').select('provider,is_blocked,blocked_until,monthly_limit_usd,current_month_spend_usd')
        return (data ?? []).map((p: Record<string, unknown>) => ({
          provider: p.provider,
          is_blocked: p.is_blocked,
          blocked_until: p.blocked_until,
          pct_used: p.monthly_limit_usd && p.current_month_spend_usd
            ? Math.round((Number(p.current_month_spend_usd) / Number(p.monthly_limit_usd)) * 100)
            : null,
        }))
      } catch { return [] }
    })(),
  })
}
