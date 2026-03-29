import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/admin/stats
// Returns global dashboard data for admin panel.
// Requires is_admin = true on the calling user's profile.
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
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

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Admin gate ─────────────────────────────────────────────────────────────
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [
    { data: patents, count: patentCount },
    { data: users },
    { data: authUsers },
    { data: pendingCollabs },
    { data: recentPayments },
    { data: claimsJobs },
    { data: revisionJobs },
    { data: usageLogs },
    { data: correspondence },
    { data: clawScores },
    { data: scoreDeltas },
  ] = await Promise.all([
    serviceClient.from('patents').select('*', { count: 'exact' }),
    serviceClient.from('profiles').select('id, display_name, email, is_admin, created_at, require_2fa, subscription_status'),
    // Auth users — email_confirmed_at tells us confirmed vs pending
    serviceClient.auth.admin.listUsers({ perPage: 1000 })
      .then(r => ({ data: r.data?.users ?? [] })),
    // Pending invites not yet accepted
    serviceClient.from('patent_collaborators')
      .select('invited_email, invite_token, created_at, patent_id')
      .is('accepted_at', null),
    serviceClient.from('patents')
      .select('id, title, payment_confirmed_at, owner_id')
      .not('payment_confirmed_at', 'is', null)
      .order('payment_confirmed_at', { ascending: false })
      .limit(20),
    serviceClient.from('patents')
      .select('id, title, claims_status, owner_id, updated_at')
      .in('claims_status', ['complete', 'failed', 'generating'])
      .order('updated_at', { ascending: false })
      .limit(50),
    serviceClient.from('review_queue')
      .select('id, patent_id, status, revision_type, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(50),
    serviceClient.from('ai_usage_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    serviceClient.from('patent_correspondence')
      .select('id, patent_id, type, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    // Claw patent scores — keyed by patent_id for the list display
    serviceClient.from('claw_patents')
      .select('patent_id, composite_score, novelty_score, commercial_score, improvement_day, provisional_ready, spec_draft, claims_draft')
      .not('patent_id', 'is', null),
    // Score deltas from last 24h
    serviceClient.from('patent_score_history')
      .select('patent_id, score_before, score_after, delta, recorded_at')
      .gte('recorded_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('recorded_at', { ascending: false }),
  ])

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const totalPatents = patentCount ?? 0
  const paidPatents = patents?.filter(p => p.payment_confirmed_at) ?? []
  const revenue = paidPatents.length * 49 // $49 per intake payment

  const claimsComplete = patents?.filter(p => p.claims_status === 'complete').length ?? 0
  const claimsFailed = patents?.filter(p => p.claims_status === 'failed').length ?? 0
  const claimsGenerating = patents?.filter(p => p.claims_status === 'generating').length ?? 0

  // AI cost summary from usage log
  const totalCostUsd = (usageLogs ?? []).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0)
  const costByAction = (usageLogs ?? []).reduce((acc: Record<string, number>, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + Number(r.cost_usd ?? 0)
    return acc
  }, {})

  // Per-user stats
  const patentsByUser = (patents ?? []).reduce((acc: Record<string, number>, p) => {
    acc[p.owner_id] = (acc[p.owner_id] ?? 0) + 1
    return acc
  }, {})

  // Auth user map (for email_confirmed_at + status)
  type AuthUserRecord = { id: string; email?: string; email_confirmed_at?: string | null }
  const authUserMap = new Map<string, AuthUserRecord>(
    (authUsers as AuthUserRecord[] ?? []).map((u: AuthUserRecord) => [u.id, u])
  )
  const authEmailMap = new Map<string, AuthUserRecord>(
    (authUsers as AuthUserRecord[] ?? []).map((u: AuthUserRecord) => [u.email ?? '', u])
  )

  // Pending collabs indexed by email
  const pendingInviteEmails = new Set<string>(
    (pendingCollabs ?? []).map((c: { invited_email: string }) => c.invited_email)
  )

  const userTable = (users ?? []).map(u => {
    const authRecord = authUserMap.get(u.id)
    const isConfirmed = !!authRecord?.email_confirmed_at
    const isPending = authRecord && !isConfirmed
    const authStatus: 'confirmed' | 'pending' = isPending ? 'pending' : 'confirmed'
    return {
      id: u.id,
      name: u.display_name || u.email || 'Unknown',
      email: u.email,
      is_admin: u.is_admin,
      patent_count: patentsByUser[u.id] ?? 0,
      paid: paidPatents.some(p => p.owner_id === u.id),
      joined: u.created_at,
      auth_status: authStatus,
      email_confirmed: isConfirmed,
      require_2fa: u.require_2fa ?? false,
      subscription_status: u.subscription_status,
    }
  })

  // Add invite-only users (patent_collaborators with no auth account)
  const profileEmails = new Set((users ?? []).map((u: { email: string }) => u.email))
  const inviteOnlyUsers = (pendingCollabs ?? [])
    .filter((c: { invited_email: string }) => !profileEmails.has(c.invited_email) && !authEmailMap.has(c.invited_email))
    .map((c: { invited_email: string; created_at: string }) => ({
      id: 'no-account',
      name: c.invited_email,
      email: c.invited_email,
      is_admin: false,
      patent_count: 0,
      paid: false,
      joined: c.created_at,
      auth_status: 'no_account' as const,
      email_confirmed: false,
      require_2fa: false,
      subscription_status: 'free',
    }))

  const fullUserTable = [...userTable, ...inviteOnlyUsers]

  // Patent table with per-patent activity
  const corrByPatent = (correspondence ?? []).reduce((acc: Record<string, number>, c) => {
    acc[c.patent_id] = (acc[c.patent_id] ?? 0) + 1
    return acc
  }, {})

  // Build claw_patents lookup by patent_id for admin list display
  type ClawScore = {
    patent_id: string
    composite_score: number | null
    novelty_score: number | null
    commercial_score: number | null
    improvement_day: number | null
    provisional_ready: boolean | null
    spec_draft: string | null
    claims_draft: string | null
  }
  const clawByPatentId = new Map<string, ClawScore>(
    (clawScores ?? []).map((c: ClawScore) => [c.patent_id, c])
  )

  // Build 24h score delta lookup by patent_id (sum all deltas in window)
  const deltaByPatentId = new Map<string, number>()
  for (const d of (scoreDeltas ?? []) as Array<{ patent_id: string; delta: number | null }>) {
    if (!d.patent_id || d.delta == null) continue
    deltaByPatentId.set(d.patent_id, (deltaByPatentId.get(d.patent_id) ?? 0) + Number(d.delta))
  }

  const patentTable = (patents ?? []).map(p => {
    const claw = p.is_claw_draft ? clawByPatentId.get(p.id) : undefined
    // For Claw patents: derive claims count from claims_draft line count
    const clawClaimsCount = claw?.claims_draft
      ? (claw.claims_draft.match(/^\d+\./gm) ?? []).length
      : null
    // Spec indicator: green if spec_draft or specification > 800 words
    const clawSpecOk = claw?.spec_draft
      ? claw.spec_draft.trim().split(/\s+/).length >= 800
      : !!(p.specification && p.specification.trim().split(/\s+/).length >= 800)
    return {
      id: p.id,
      title: p.title,
      owner_id: p.owner_id,
      status: p.status,
      filing_status: p.filing_status,
      claims_status: p.claims_status,
      spec_uploaded: p.spec_uploaded,
      figures_uploaded: p.figures_uploaded,
      paid: !!p.payment_confirmed_at,
      correspondence_count: corrByPatent[p.id] ?? 0,
      updated_at: p.updated_at,
      claims_score: p.claims_score,
      provisional_deadline: p.provisional_deadline,
      ip_readiness_score: p.ip_readiness_score ?? null,
      is_claw_draft: p.is_claw_draft ?? false,
      // Claw-specific display fields (null for human patents)
      claw_composite_score: claw?.composite_score ?? null,
      claw_claims_count: clawClaimsCount,
      claw_spec_ok: p.is_claw_draft ? clawSpecOk : null,
      claw_provisional_ready: claw?.provisional_ready ?? null,
      claw_improvement_day: claw?.improvement_day ?? null,
      score_delta_24h: deltaByPatentId.get(p.id) ?? null,
      commercial_tier: (p as Record<string, unknown>).commercial_tier as number | null ?? null,
      tier_rationale: (p as Record<string, unknown>).tier_rationale as string | null ?? null,
      tier_classified_at: (p as Record<string, unknown>).tier_classified_at as string | null ?? null,
    }
  })

  return NextResponse.json({
    summary: {
      total_patents: totalPatents,
      paid_patents: paidPatents.length,
      revenue_usd: revenue,
      claims_complete: claimsComplete,
      claims_failed: claimsFailed,
      claims_generating: claimsGenerating,
      total_users: users?.length ?? 0,
      total_ai_cost_usd: totalCostUsd,
      total_correspondence: correspondence?.length ?? 0,
      revision_jobs: revisionJobs?.length ?? 0,
    },
    cost_by_action: costByAction,
    recent_payments: recentPayments ?? [],
    claims_jobs: claimsJobs ?? [],
    patent_table: patentTable,
    user_table: fullUserTable,
    recent_usage: (usageLogs ?? []).slice(0, 30),
  })
}
