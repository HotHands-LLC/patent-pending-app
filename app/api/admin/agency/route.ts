import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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

/**
 * GET /api/admin/agency
 * Returns all patents with active agency agreements + lead counts + deal status.
 */
export async function GET(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Active agreements with patent info
  const { data: agreements } = await supabaseService
    .from('agency_agreements')
    .select(`
      id, commission_pct, terms_version, agreed_at, ip_address,
      patents!inner(id, title, slug, status, arc3_active, owner_id,
        deal_page_summary, licensing_exclusive, licensing_nonexclusive, licensing_field_of_use)
    `)
    .eq('is_active', true)
    .order('agreed_at', { ascending: false })

  // Lead counts per patent
  const { data: leads } = await supabaseService
    .from('patent_leads')
    .select('patent_id, status, deal_amount, deal_type')
    .not('patent_id', 'is', null)

  // Build lead summary per patent
  const leadSummary: Record<string, { total: number; new: number; negotiating: number; closed: number; total_deal_value: number }> = {}
  for (const lead of leads ?? []) {
    if (!lead.patent_id) continue
    if (!leadSummary[lead.patent_id]) {
      leadSummary[lead.patent_id] = { total: 0, new: 0, negotiating: 0, closed: 0, total_deal_value: 0 }
    }
    const s = leadSummary[lead.patent_id]
    s.total++
    if (lead.status === 'new') s.new++
    if (lead.status === 'negotiating') s.negotiating++
    if (lead.status === 'closed') {
      s.closed++
      s.total_deal_value += parseFloat(lead.deal_amount ?? 0)
    }
  }

  // All leads for the leads table
  const { data: allLeads } = await supabaseService
    .from('patent_leads')
    .select('id, patent_id, name, email, company, message, status, deal_type, deal_amount, notes, created_at, updated_at')
    .not('patent_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ agreements: agreements ?? [], leadSummary, allLeads: allLeads ?? [] })
}

/**
 * PATCH /api/admin/agency
 * Update a lead status/deal info.
 * Body: { lead_id, status?, deal_type?, deal_amount?, notes? }
 */
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { lead_id, ...updates } = body
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const allowed = ['status', 'deal_type', 'deal_amount', 'notes']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in updates) patch[k] = updates[k]

  await supabaseService.from('patent_leads').update(patch).eq('id', lead_id)
  return NextResponse.json({ ok: true })
}
