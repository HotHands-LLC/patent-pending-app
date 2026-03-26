import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(t: string) { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { global: { headers: { Authorization: `Bearer ${t}` } } }) }
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }
async function checkAdmin(t: string) {
  const { data: { user } } = await getUser(t).auth.getUser()
  return user && ADMIN_EMAILS.includes(user.email ?? '') ? user : null
}

export async function GET(req: NextRequest) {
  const t = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(t)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const svc = getSvc()
  const [{ data: features }, { data: brandFeatures }] = await Promise.all([
    svc.from('feature_catalog').select('feature_key,feature_name,description,category,applies_to,certified').eq('status','available').order('category').order('feature_name'),
    svc.from('brand_features').select('brand,feature_key,status'),
  ])
  return NextResponse.json({ features: features ?? [], brand_features: brandFeatures ?? [] })
}

export async function POST(req: NextRequest) {
  const t = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(t)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { feature_key, brand } = await req.json()
  if (!feature_key || !brand) return NextResponse.json({ error: 'feature_key + brand required' }, { status: 400 })
  const svc = getSvc()
  // Get feature prompt
  const { data: feature } = await svc.from('feature_catalog').select('feature_name,prompt_label').eq('feature_key', feature_key).single()
  // Insert into queue
  const priority = Math.floor(Math.random() * 10) + 90 // high priority number = runs last
  await svc.from('claw_prompt_queue').insert({
    prompt_label: `[${brand.toUpperCase()}] ${feature?.prompt_label ?? feature?.feature_name ?? feature_key}`,
    prompt_body: `Deploy feature '${feature_key}' (${feature?.feature_name}) to brand: ${brand}.\n\nReview the existing pp.app implementation and adapt it for the ${brand} brand/workspace.`,
    priority,
    status: 'queued',
    created_by: brand + '-deploy',
  })
  await svc.from('brand_features').upsert({ brand, feature_key, status: 'queued' }, { onConflict: 'brand,feature_key' })
  return NextResponse.json({ ok: true })
}
