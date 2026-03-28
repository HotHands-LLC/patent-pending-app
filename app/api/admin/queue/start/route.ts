import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'

export const dynamic = 'force-dynamic'
export const maxDuration = 25
const execAsync = promisify(exec)
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(t: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${t}` } } })
}
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUser(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const svc = getSvc()

  // Re-enable auto-runner if paused
  await svc.from('app_settings').upsert({ key: 'queue_auto_run_enabled', value: 'true' }, { onConflict: 'key' })

  // Find the next queued item (lowest priority number, then oldest)
  const { data: nextItem } = await svc
    .from('claw_prompt_queue')
    .select('id, prompt_label')
    .eq('status', 'queued')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!nextItem) {
    const { data: allQueued } = await svc.from('claw_prompt_queue').select('id').eq('status', 'queued')
    return NextResponse.json({ ok: true, task: null, queued: allQueued?.length ?? 0, message: 'No queued items' })
  }

  // Mark it as in_progress
  await svc
    .from('claw_prompt_queue')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', nextItem.id)

  // Fire queue runner in background (non-blocking)
  try {
    execAsync(
      'python3 /Users/hotdeck-agent/.openclaw/workspace/scripts/claw-queue-runner.py --auto',
      { timeout: 20000 }
    ).catch(() => { /* non-blocking */ })
  } catch { /* ignore */ }

  const { data: remaining } = await svc.from('claw_prompt_queue').select('id').eq('status', 'queued')
  return NextResponse.json({
    ok: true,
    task: nextItem.prompt_label,
    taskId: nextItem.id,
    queued: remaining?.length ?? 0,
  })
}
