import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAdminUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await serviceClient.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

/**
 * GET /api/admin/connectors
 * Returns live connector health + usage stats for admin dashboard.
 */
export async function GET(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  // ── Brave Search usage this month ──────────────────────────────────────────
  const { data: runs } = await serviceClient
    .from('patent_research_runs')
    .select('id, status, findings_count, new_findings_count, queries_used, started_at, completed_at, error_message')
    .gte('started_at', monthStart)
    .order('started_at', { ascending: false })

  const braveSettings = await serviceClient
    .from('app_settings')
    .select('key, value')
    .in('key', ['brave_monthly_limit', 'brave_plan', 'brave_reset_day'])

  const settingsMap: Record<string, string> = {}
  for (const row of braveSettings.data ?? []) settingsMap[row.key] = row.value

  const monthlyLimit = parseInt(settingsMap['brave_monthly_limit'] ?? '2000', 10)
  const bravePlan    = settingsMap['brave_plan'] ?? 'free'

  // Count queries used this month from queries_used arrays
  const allRuns = runs ?? []
  const queriesThisMonth = allRuns.reduce((sum: number, r: { queries_used?: string[] | null }) => {
    return sum + (Array.isArray(r.queries_used) ? r.queries_used.length : 0)
  }, 0)

  const usagePct  = Math.round((queriesThisMonth / monthlyLimit) * 100)
  const remaining = monthlyLimit - queriesThisMonth
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate()
  const dayOfMonth  = now.getUTCDate()
  const daysLeft    = daysInMonth - dayOfMonth + 1
  const projectedMonthly = daysLeft > 0
    ? Math.round(queriesThisMonth + (queriesThisMonth / Math.max(dayOfMonth, 1)) * daysLeft)
    : queriesThisMonth

  // Alert level
  let alertLevel: 'ok' | 'warning' | 'critical' = 'ok'
  if (usagePct >= 90) alertLevel = 'critical'
  else if (usagePct >= 75) alertLevel = 'warning'

  // Last run details
  const lastRun = allRuns[0] ?? null

  // ── All-time totals ────────────────────────────────────────────────────────
  const { data: allTimeRuns } = await serviceClient
    .from('patent_research_runs')
    .select('findings_count, new_findings_count, queries_used, status')

  const totalQueriesAllTime = (allTimeRuns ?? []).reduce((sum: number, r: { queries_used?: string[] | null }) =>
    sum + (Array.isArray(r.queries_used) ? r.queries_used.length : 0), 0)
  const totalFindings = (allTimeRuns ?? []).reduce((sum: number, r: { findings_count?: number | null }) =>
    sum + (r.findings_count ?? 0), 0)
  const totalRuns = (allTimeRuns ?? []).length
  const successRuns = (allTimeRuns ?? []).filter((r: { status: string }) => r.status === 'completed').length

  // ── Monthly reset info ─────────────────────────────────────────────────────
  const resetDate = new Date(Date.UTC(
    now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
    now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1,
    1
  ))
  const daysToReset = Math.ceil((resetDate.getTime() - now.getTime()) / 86_400_000)

  return NextResponse.json({
    connectors: {
      brave_search: {
        status:              process.env.BRAVE_API_KEY ? 'connected' : 'missing_key',
        plan:                bravePlan,
        monthly_limit:       monthlyLimit,
        queries_this_month:  queriesThisMonth,
        queries_remaining:   remaining,
        usage_pct:           usagePct,
        alert_level:         alertLevel,
        projected_monthly:   projectedMonthly,
        days_to_reset:       daysToReset,
        reset_date:          resetDate.toISOString().split('T')[0],
        // Run stats
        runs_this_month:     allRuns.length,
        total_runs:          totalRuns,
        success_rate:        totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0,
        total_queries_ever:  totalQueriesAllTime,
        total_findings_ever: totalFindings,
        last_run: lastRun ? {
          id:             lastRun.id,
          status:         lastRun.status,
          started_at:     lastRun.started_at,
          completed_at:   lastRun.completed_at,
          findings:       lastRun.findings_count ?? 0,
          new_findings:   lastRun.new_findings_count ?? 0,
          queries_used:   Array.isArray(lastRun.queries_used) ? lastRun.queries_used.length : 0,
          error:          lastRun.error_message ?? null,
        } : null,
        recent_runs: allRuns.slice(0, 10).map((r: {
          id: string; status: string; started_at: string; completed_at?: string | null;
          findings_count?: number | null; new_findings_count?: number | null;
          queries_used?: string[] | null; error_message?: string | null
        }) => ({
          id:           r.id,
          status:       r.status,
          started_at:   r.started_at,
          completed_at: r.completed_at,
          findings:     r.findings_count ?? 0,
          new_findings: r.new_findings_count ?? 0,
          queries:      Array.isArray(r.queries_used) ? r.queries_used.length : 0,
          error:        r.error_message ?? null,
        })),
      }
    }
  })
}

/**
 * PATCH /api/admin/connectors
 * Update connector settings (e.g. monthly_limit, plan).
 */
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { brave_monthly_limit?: number; brave_plan?: string }

  if (body.brave_monthly_limit) {
    await serviceClient.from('app_settings')
      .upsert({ key: 'brave_monthly_limit', value: String(body.brave_monthly_limit), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }
  if (body.brave_plan) {
    await serviceClient.from('app_settings')
      .upsert({ key: 'brave_plan', value: body.brave_plan, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }
  return NextResponse.json({ ok: true })
}
