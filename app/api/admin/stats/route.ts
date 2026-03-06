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
    { data: recentPayments },
    { data: claimsJobs },
    { data: revisionJobs },
    { data: usageLogs },
    { data: correspondence },
  ] = await Promise.all([
    serviceClient.from('patents').select('*', { count: 'exact' }),
    serviceClient.from('profiles').select('id, display_name, email, is_admin, created_at'),
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

  const userTable = (users ?? []).map(u => ({
    id: u.id,
    name: u.display_name || u.email || 'Unknown',
    email: u.email,
    is_admin: u.is_admin,
    patent_count: patentsByUser[u.id] ?? 0,
    paid: paidPatents.some(p => p.owner_id === u.id),
    joined: u.created_at,
  }))

  // Patent table with per-patent activity
  const corrByPatent = (correspondence ?? []).reduce((acc: Record<string, number>, c) => {
    acc[c.patent_id] = (acc[c.patent_id] ?? 0) + 1
    return acc
  }, {})

  const patentTable = (patents ?? []).map(p => ({
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
  }))

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
    user_table: userTable,
    recent_usage: (usageLogs ?? []).slice(0, 30),
  })
}
