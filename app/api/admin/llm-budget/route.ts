import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(token: string) { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { global: { headers: { Authorization: `Bearer ${token}` } } }) }
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }
async function checkAdmin(token: string) {
  const { data: { user } } = await getUser(token).auth.getUser()
  return user && ADMIN_EMAILS.includes(user.email ?? '') ? user : null
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { data } = await getSvc().from('llm_budget_config').select('*')
  // Compute % used for each provider
  const providers = (data ?? []).map(p => ({
    ...p,
    pct_used: p.monthly_limit_usd && p.current_month_spend_usd
      ? Math.round((Number(p.current_month_spend_usd) / Number(p.monthly_limit_usd)) * 100)
      : null,
  }))
  return NextResponse.json({ providers })
}

export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { provider, monthly_limit_usd, warning_threshold_pct, is_blocked, blocked_until } = await req.json()
  if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 })
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (monthly_limit_usd !== undefined) updates.monthly_limit_usd = monthly_limit_usd
  if (warning_threshold_pct !== undefined) updates.warning_threshold_pct = warning_threshold_pct
  if (is_blocked !== undefined) updates.is_blocked = is_blocked
  if (blocked_until !== undefined) updates.blocked_until = blocked_until
  await getSvc().from('llm_budget_config').update(updates).eq('provider', provider)
  return NextResponse.json({ ok: true })
}
