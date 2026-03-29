import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(t: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${t}` } } }
  )
}
function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}
async function checkAdmin(t: string) {
  const { data: { user } } = await getUser(t).auth.getUser()
  return user && ADMIN_EMAILS.includes(user.email ?? '') ? user : null
}

export async function POST(req: NextRequest) {
  const t = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(t)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { feature_key, feature_name, description, category, tier_required, commit_ref, status } = body

  if (!feature_key || !feature_name) {
    return NextResponse.json({ error: 'feature_key and feature_name are required' }, { status: 400 })
  }

  const svc = getSvc()

  // Check for duplicate
  const { data: existing } = await svc
    .from('feature_catalog')
    .select('feature_key')
    .eq('feature_key', feature_key)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: `Feature '${feature_key}' already exists` }, { status: 409 })
  }

  const { error } = await svc.from('feature_catalog').insert({
    feature_key,
    feature_name,
    description: description || null,
    category: category || 'core',
    tier_required: tier_required || 'free',
    commit_ref: commit_ref || null,
    status: status || 'available',
    deployed_at: new Date().toISOString(),
    applies_to: ['pp.app'],
    certified: false,
  })

  if (error) {
    console.error('[feature-catalog/add] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
