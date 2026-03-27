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

  // Re-enable auto-runner if paused
  await getSvc().from('app_settings').upsert({ key: 'queue_auto_run_enabled', value: 'true' }, { onConflict: 'key' })

  // Trigger queue runner directly (fire-and-forget, 20s timeout)
  try {
    const { stdout } = await execAsync(
      'python3 /Users/hotdeck-agent/.openclaw/workspace/scripts/claw-queue-runner.py --auto',
      { timeout: 20000 }
    )
    const { data: items } = await getSvc().from('claw_prompt_queue').select('id', { count: 'exact' }).eq('status', 'queued')
    return NextResponse.json({ ok: true, output: stdout.slice(0, 300), queued: items?.length ?? 0 })
  } catch (e) {
    const err = e as { message?: string; stdout?: string }
    return NextResponse.json({ ok: false, error: err.message, output: err.stdout?.slice(0, 200) })
  }
}
