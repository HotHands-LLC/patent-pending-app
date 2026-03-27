import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']
function getUser(t: string) { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { global: { headers: { Authorization: `Bearer ${t}` } } }) }
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUser(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const svc = getSvc()
  const [{ data: active }, { data: queued }, { data: settings }] = await Promise.all([
    svc.from('claw_prompt_queue').select('id,prompt_label,started_at').eq('status','in_progress').limit(1),
    svc.from('claw_prompt_queue').select('id',{count:'exact'}).eq('status','queued'),
    svc.from('app_settings').select('value').eq('key','queue_auto_run_enabled').single(),
  ])
  const activeItem = active?.[0] ?? null
  const elapsedMin = activeItem?.started_at ? Math.floor((Date.now() - new Date(activeItem.started_at).getTime()) / 60000) : 0
  const isStuck = elapsedMin > 10
  const isPaused = settings?.value === 'false'
  const status = isPaused ? 'paused' : activeItem ? (isStuck ? 'stuck' : 'running') : 'idle'
  return NextResponse.json({ status, active_label: activeItem?.prompt_label ?? null, elapsed_min: elapsedMin, queued_count: queued?.length ?? 0 })
}
