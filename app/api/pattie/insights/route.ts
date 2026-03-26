/**
 * GET /api/pattie/insights — fetch proactive insights for current user
 * Returns unseen, non-dismissed insights sorted by priority
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = getSvc()

  // Get active patent deadlines and generate real-time insights
  const { data: patents } = await svc.from('patents')
    .select('id, title, provisional_deadline, status, claims_draft, abstract_draft, spec_draft, ip_readiness_score')
    .eq('owner_id', user.id)
    .not('status', 'in', '("abandoned","research_import","archived")')
    .limit(10)

  const insights: Array<{
    id: string; insight_type: string; priority: string; message: string; cta: string | null
    patent_id: string | null; created_at: string
  }> = []

  const now = new Date()
  for (const p of patents ?? []) {
    if (p.provisional_deadline) {
      const days = Math.ceil((new Date(p.provisional_deadline).getTime() - now.getTime()) / 86400000)
      if (days <= 30 && days > 0 && p.status === 'provisional') {
        insights.push({
          id: `deadline-${p.id}`, insight_type: 'deadline_warning',
          priority: days <= 7 ? 'high' : 'medium',
          message: `⚠️ ${p.title.slice(0, 40)} deadline in ${days} day${days !== 1 ? 's' : ''} — have you started the non-provisional?`,
          cta: 'Review filing checklist', patent_id: p.id,
          created_at: now.toISOString(),
        })
      }
    }
    if (!p.abstract_draft && p.claims_draft) {
      insights.push({
        id: `abstract-${p.id}`, insight_type: 'missing_abstract', priority: 'medium',
        message: `📝 ${p.title.slice(0, 40)} is missing an abstract — required for non-provisional filing`,
        cta: 'Add abstract', patent_id: p.id, created_at: now.toISOString(),
      })
    }
  }

  // Also fetch stored insights from DB
  const { data: stored } = await svc.from('pattie_insights')
    .select('id, insight_type, priority, message, cta, patent_id, created_at')
    .eq('user_id', user.id).eq('seen', false).eq('dismissed', false)
    .order('created_at', { ascending: false }).limit(5)

  return NextResponse.json({ insights: [...insights.slice(0, 3), ...(stored ?? []).slice(0, 2)] })
}

export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, action } = await req.json()
  if (id && action === 'dismiss') {
    await getSvc().from('pattie_insights').update({ dismissed: true }).eq('id', id).eq('user_id', user.id)
  }
  return NextResponse.json({ ok: true })
}
