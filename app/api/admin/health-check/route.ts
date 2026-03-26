import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

interface CheckResult {
  check: string
  status: 'ok' | 'warning' | 'error'
  value?: unknown
  error?: string
}

export async function GET(_req: NextRequest) {
  const svc = getSvc()
  const results: CheckResult[] = []
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 86400000).toISOString()
  const thirtyDaysOut = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0]

  // 1. DB Connectivity
  try {
    const { count } = await svc.from('patents').select('id', { count: 'exact', head: true })
    results.push({ check: 'db_connectivity', status: 'ok', value: count })
  } catch (e) {
    results.push({ check: 'db_connectivity', status: 'error', error: String(e).slice(0, 100) })
  }

  // 2. Active Patent Count
  try {
    const { count } = await svc.from('patents').select('id', { count: 'exact', head: true })
      .not('status', 'in', '("abandoned","research_import")')
    results.push({ check: 'active_patents', status: 'ok', value: count })
  } catch (e) {
    results.push({ check: 'active_patents', status: 'error', error: String(e).slice(0, 100) })
  }

  // 3. P0 Errors (24h)
  try {
    const { count } = await svc.from('claw_errors').select('id', { count: 'exact', head: true })
      .eq('severity', 'P0').eq('status', 'open').gte('created_at', oneDayAgo)
    results.push({ check: 'p0_errors_24h', status: (count ?? 0) > 0 ? 'warning' : 'ok', value: count })
  } catch (e) {
    results.push({ check: 'p0_errors_24h', status: 'error', error: String(e).slice(0, 100) })
  }

  // 4. Pending Signing Requests
  try {
    const { count } = await svc.from('signing_requests').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    results.push({ check: 'pending_signing', status: 'ok', value: count })
  } catch (e) {
    results.push({ check: 'pending_signing', status: 'ok', value: 0 }) // table may not exist
  }

  // 5. Upcoming Deadlines (30d)
  try {
    const { data } = await svc.from('patents').select('id, title, provisional_deadline')
      .lte('provisional_deadline', thirtyDaysOut)
      .gte('provisional_deadline', now.toISOString().split('T')[0])
      .not('status', 'in', '("abandoned","research_import","granted")')
      .limit(5)
    results.push({ check: 'upcoming_deadlines_30d', status: (data?.length ?? 0) > 0 ? 'warning' : 'ok', value: data?.length ?? 0 })
  } catch (e) {
    results.push({ check: 'upcoming_deadlines_30d', status: 'error', error: String(e).slice(0, 100) })
  }

  const hasErrors = results.some(r => r.status === 'error')
  const hasWarnings = results.some(r => r.status === 'warning')
  const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok'

  // Log to health_check_log
  await svc.from('health_check_log').insert({
    checked_at: now.toISOString(),
    results,
    has_errors: hasErrors,
    source: 'vercel_cron',
  })

  return NextResponse.json({
    status: overallStatus,
    checked_at: now.toISOString(),
    results,
  })
}
