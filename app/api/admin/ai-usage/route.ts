import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/ai-usage
 * Admin-only. Returns per-user AI token usage for the current calendar month,
 * broken down by feature (pattie_chat, pattie_polish, deep_research).
 */

const supabaseService = createClient(
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
  const { data: profile } = await supabaseService.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Start of current calendar month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Get all users with their budget settings
  const { data: profiles, error: profileErr } = await supabaseService
    .from('patent_profiles')
    .select('id, email, monthly_ai_budget_pct')

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  // Get this month's usage grouped by user + feature
  const { data: usage, error: usageErr } = await supabaseService
    .from('ai_token_usage')
    .select('user_id, feature, tokens_used')
    .gte('created_at', monthStart)

  if (usageErr) return NextResponse.json({ error: usageErr.message }, { status: 500 })

  // Aggregate per user
  const usageMap: Record<string, {
    total_tokens: number
    chat_tokens: number
    polish_tokens: number
    research_tokens: number
  }> = {}

  for (const row of (usage ?? [])) {
    if (!usageMap[row.user_id]) {
      usageMap[row.user_id] = { total_tokens: 0, chat_tokens: 0, polish_tokens: 0, research_tokens: 0 }
    }
    const u = usageMap[row.user_id]
    u.total_tokens += row.tokens_used ?? 0
    if (row.feature === 'pattie_chat')   u.chat_tokens    += row.tokens_used ?? 0
    if (row.feature === 'pattie_polish') u.polish_tokens  += row.tokens_used ?? 0
    if (row.feature === 'deep_research') u.research_tokens += row.tokens_used ?? 0
  }

  // Build rows — include all users (even zero usage)
  const rows = (profiles ?? [])
    .map(p => ({
      email:                  p.email ?? '(no email)',
      monthly_ai_budget_pct:  p.monthly_ai_budget_pct ?? 10,
      total_tokens:           usageMap[p.id]?.total_tokens    ?? 0,
      chat_tokens:            usageMap[p.id]?.chat_tokens     ?? 0,
      polish_tokens:          usageMap[p.id]?.polish_tokens   ?? 0,
      research_tokens:        usageMap[p.id]?.research_tokens ?? 0,
    }))
    .filter(r => r.total_tokens > 0)  // only show users with usage
    .sort((a, b) => b.total_tokens - a.total_tokens)

  return NextResponse.json({ rows, month: monthStart.slice(0, 7) })
}
