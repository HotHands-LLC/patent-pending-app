import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const serviceClient = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

async function getAdminUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const userClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await serviceClient.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pingUrl(url: string, opts?: RequestInit): Promise<{ ok: boolean; ms: number; status?: number }> {
  const start = Date.now()
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(5000) })
    return { ok: res.ok, ms: Date.now() - start, status: res.status }
  } catch {
    return { ok: false, ms: Date.now() - start }
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const resetDate  = new Date(Date.UTC(
    now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
    now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1, 1
  ))
  const daysToReset = Math.ceil((resetDate.getTime() - now.getTime()) / 86_400_000)
  const dayOfMonth  = now.getUTCDate()

  // ── Run all fetches in parallel ───────────────────────────────────────────
  const [
    researchRunsRes,
    settingsRes,
    supabaseStatsRes,
    aiUsageRes,
    recentEmailsRes,
  ] = await Promise.all([
    // Brave: research runs this month
    serviceClient
      .from('patent_research_runs')
      .select('id,status,findings_count,new_findings_count,queries_used,started_at,completed_at,error_message')
      .gte('started_at', monthStart)
      .order('started_at', { ascending: false }),

    // App settings
    serviceClient.from('app_settings').select('key,value'),

    // Supabase stats: auth user count + tables + storage
    serviceClient.from('patent_profiles').select('id,subscription_status', { count: 'exact', head: true }),

    // AI usage this month
    serviceClient
      .from('ai_usage_log')
      .select('cost_usd,model,created_at')
      .gte('created_at', monthStart),

    // Recent admin_actions for email activity proxy
    serviceClient
      .from('admin_actions')
      .select('action,result,created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // ── Brave Search ──────────────────────────────────────────────────────────
  const settingsMap: Record<string, string> = {}
  for (const row of settingsRes.data ?? []) settingsMap[row.key] = row.value

  const monthlyLimit    = parseInt(settingsMap['brave_monthly_limit'] ?? '2000', 10)
  const bravePlan       = settingsMap['brave_plan'] ?? 'free'
  const allRuns         = researchRunsRes.data ?? []
  const queriesMonth    = allRuns.reduce((s: number, r: { queries_used?: string[] | null }) =>
    s + (Array.isArray(r.queries_used) ? r.queries_used.length : 0), 0)
  const braveUsagePct   = Math.round((queriesMonth / monthlyLimit) * 100)
  const braveAlert: 'ok' | 'warning' | 'critical' = braveUsagePct >= 90 ? 'critical' : braveUsagePct >= 75 ? 'warning' : 'ok'

  const allTimeRunsRes = await serviceClient
    .from('patent_research_runs')
    .select('findings_count,new_findings_count,queries_used,status')
  const allTimeRuns = allTimeRunsRes.data ?? []
  const totalQueriesEver  = allTimeRuns.reduce((s: number, r: { queries_used?: string[] | null }) =>
    s + (Array.isArray(r.queries_used) ? r.queries_used.length : 0), 0)
  const totalFindingsEver = allTimeRuns.reduce((s: number, r: { findings_count?: number | null }) =>
    s + (r.findings_count ?? 0), 0)
  const successRuns = allTimeRuns.filter((r: { status: string }) => r.status === 'completed').length

  // ── Supabase ──────────────────────────────────────────────────────────────
  const supabaseUsers = supabaseStatsRes.count ?? 0
  const supabasePing  = await pingUrl(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/patents?select=id&limit=1`,
    { headers: { apikey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'), Authorization: `Bearer ${(process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')}`, 'User-Agent': 'BoClaw/1.0' } }
  )

  // ── AI Usage (OpenAI / Claude via ai_usage_log) ────────────────────────
  const aiRows = aiUsageRes.data ?? []
  const aiCostMonth = aiRows.reduce((s: number, r: { cost_usd?: number | null }) => s + (r.cost_usd ?? 0), 0)
  const aiCallsMonth = aiRows.length
  const aiModelBreakdown: Record<string, number> = {}
  for (const r of aiRows) {
    const m = (r.model ?? 'unknown').split('/').pop() ?? 'unknown'
    aiModelBreakdown[m] = (aiModelBreakdown[m] ?? 0) + 1
  }

  // ── Resend ────────────────────────────────────────────────────────────────
  // Count email sends from admin_actions results (contain resend message IDs)
  const recentActions = recentEmailsRes.data ?? []
  const emailsSentMonth = recentActions.filter((a: { created_at: string; result?: string | null }) =>
    a.created_at >= monthStart && a.result?.includes('resend_message_id')
  ).length

  // Ping Resend API
  const resendPing = await pingUrl('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  })

  // ── Stripe ────────────────────────────────────────────────────────────────
  // Note: Stripe API called server-side — key is env var
  let stripeData: {
    status: string; balance_usd: number; active_subscriptions: number;
    revenue_30d: number; charges_30d: number
  } = { status: 'no_key', balance_usd: 0, active_subscriptions: 0, revenue_30d: 0, charges_30d: 0 }

  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const [balRes, subRes, chargeRes] = await Promise.all([
        fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }),
        fetch('https://api.stripe.com/v1/subscriptions?status=active&limit=100', { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }),
        fetch('https://api.stripe.com/v1/charges?limit=100', { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }),
      ])
      if (balRes.ok) {
        const bal = await balRes.json() as { available: Array<{ amount: number; currency: string }> }
        const usd = bal.available?.find((b: { currency: string }) => b.currency === 'usd')
        stripeData.balance_usd = (usd?.amount ?? 0) / 100
        stripeData.status = 'connected'
      }
      if (subRes.ok) {
        const subs = await subRes.json() as { data: unknown[] }
        stripeData.active_subscriptions = subs.data?.length ?? 0
      }
      if (chargeRes.ok) {
        const charges = await chargeRes.json() as { data: Array<{ created: number; status: string; amount: number }> }
        const thirtyDaysAgo = (Date.now() / 1000) - 30 * 86400
        const recent = charges.data?.filter(c => c.created > thirtyDaysAgo && c.status === 'succeeded') ?? []
        stripeData.revenue_30d = recent.reduce((s, c) => s + c.amount, 0) / 100
        stripeData.charges_30d = recent.length
      }
    } catch { stripeData.status = 'error' }
  }

  // ── GitHub ────────────────────────────────────────────────────────────────
  let githubData: {
    status: string; last_commit_repo: string; last_commit_sha: string;
    last_commit_msg: string; last_commit_at: string; open_issues: number
  } = { status: 'no_key', last_commit_repo: '', last_commit_sha: '', last_commit_msg: '', last_commit_at: '', open_issues: 0 }

  if (process.env.GITHUB_PAT) {
    try {
      const repoRes = await fetch('https://api.github.com/repos/HotHands-LLC/patent-pending-app/commits?per_page=1', {
        headers: { Authorization: `Bearer ${process.env.GITHUB_PAT}`, Accept: 'application/vnd.github+json' }
      })
      if (repoRes.ok) {
        const commits = await repoRes.json() as Array<{ sha: string; commit: { message: string; author: { date: string } } }>
        const latest = commits[0]
        githubData = {
          status: 'connected',
          last_commit_repo: 'HotHands-LLC/patent-pending-app',
          last_commit_sha: latest?.sha?.slice(0, 7) ?? '',
          last_commit_msg: latest?.commit?.message?.split('\n')[0]?.slice(0, 80) ?? '',
          last_commit_at: latest?.commit?.author?.date ?? '',
          open_issues: 0,
        }
      }
    } catch { githubData.status = 'error' }
  }

  // ── USPTO ODP ──────────────────────────────────────────────────────────────
  const usptoStatus = process.env.USPTO_API_KEY ? 'key_present' : 'no_key'

  return NextResponse.json({
    connectors: {
      brave_search: {
        status:              process.env.BRAVE_API_KEY ? 'connected' : 'missing_key',
        plan:                bravePlan,
        monthly_limit:       monthlyLimit,
        queries_this_month:  queriesMonth,
        queries_remaining:   monthlyLimit - queriesMonth,
        usage_pct:           braveUsagePct,
        alert_level:         braveAlert,
        projected_monthly:   daysToReset > 0 ? Math.round(queriesMonth + (queriesMonth / Math.max(dayOfMonth, 1)) * daysToReset) : queriesMonth,
        days_to_reset:       daysToReset,
        reset_date:          resetDate.toISOString().split('T')[0],
        runs_this_month:     allRuns.length,
        total_runs:          allTimeRuns.length,
        success_rate:        allTimeRuns.length > 0 ? Math.round((successRuns / allTimeRuns.length) * 100) : 0,
        total_queries_ever:  totalQueriesEver,
        total_findings_ever: totalFindingsEver,
        last_run: allRuns[0] ? {
          id:           allRuns[0].id,
          status:       allRuns[0].status,
          started_at:   allRuns[0].started_at,
          completed_at: allRuns[0].completed_at,
          findings:     allRuns[0].findings_count ?? 0,
          new_findings: allRuns[0].new_findings_count ?? 0,
          queries_used: Array.isArray(allRuns[0].queries_used) ? allRuns[0].queries_used.length : 0,
          error:        allRuns[0].error_message ?? null,
        } : null,
        recent_runs: allRuns.slice(0, 10).map((r: {
          id: string; status: string; started_at: string; completed_at?: string | null;
          findings_count?: number | null; new_findings_count?: number | null;
          queries_used?: string[] | null; error_message?: string | null
        }) => ({
          id: r.id, status: r.status, started_at: r.started_at, completed_at: r.completed_at,
          findings: r.findings_count ?? 0, new_findings: r.new_findings_count ?? 0,
          queries: Array.isArray(r.queries_used) ? r.queries_used.length : 0, error: r.error_message ?? null,
        })),
      },
      resend: {
        status:           resendPing.ok ? 'connected' : 'error',
        ping_ms:          resendPing.ms,
        key_present:      !!process.env.RESEND_API_KEY,
        emails_sent_month: emailsSentMonth,
        from_domain:      'notifications@patentpending.app',
      },
      supabase: {
        status:       supabasePing.ok ? 'connected' : 'degraded',
        ping_ms:      supabasePing.ms,
        project_ref:  'prtqzvcvcdppnuuzfrmh',
        region:       'us-east-1',
        user_count:   supabaseUsers,
        ai_calls_month: aiCallsMonth,
        ai_cost_month_usd: Math.round(aiCostMonth * 100) / 100,
        ai_top_models: aiModelBreakdown,
        storage_bucket: 'patent-uploads',
      },
      stripe: stripeData,
      github: githubData,
      uspto_odp: {
        status:      usptoStatus,
        description: 'Read-only patent application search. Provisionals not searchable (not published).',
        base_url:    'https://api.uspto.gov/api/v1/patent/applications/',
      },
    }
  })
}

// ── PATCH — update connector settings ────────────────────────────────────────
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
