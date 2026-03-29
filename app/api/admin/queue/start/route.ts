import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'

export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)

const serviceClient = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(jwt: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )
}

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null
}

// POST /api/admin/queue/start
// Triggers the next queued item in claw_prompt_queue via claw-queue-runner.py --auto
export async function POST(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify admin status
  const { data: profile } = await serviceClient
    .from('patent_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  // Check queue state before triggering
  const { data: inProgressItems } = await serviceClient
    .from('claw_prompt_queue')
    .select('id, prompt_label')
    .eq('status', 'in_progress')
    .limit(1)

  if (inProgressItems && inProgressItems.length > 0) {
    return NextResponse.json({
      error: 'Queue item already in progress',
      in_progress: inProgressItems[0],
    }, { status: 409 })
  }

  const { data: queuedItems } = await serviceClient
    .from('claw_prompt_queue')
    .select('id, prompt_label, priority')
    .eq('status', 'queued')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)

  if (!queuedItems || queuedItems.length === 0) {
    return NextResponse.json({ error: 'No queued items to start' }, { status: 404 })
  }

  const nextItem = queuedItems[0]

  // Trigger the queue runner in the background
  // Use nohup so it outlives the request
  try {
    const scriptPath = '/Users/hotdeck-agent/.openclaw/workspace/scripts/claw-queue-runner.py'
    execAsync(`nohup python3 ${scriptPath} --auto > /tmp/claw-queue-start.log 2>&1 &`)
      .catch(err => console.error('[queue/start] runner error:', err))

    return NextResponse.json({
      ok: true,
      started: nextItem,
      message: `Queue runner triggered for: ${nextItem.prompt_label}`,
    })
  } catch (err) {
    console.error('[queue/start] failed to trigger runner:', err)
    return NextResponse.json({ error: 'Failed to start queue runner' }, { status: 500 })
  }
}

// GET /api/admin/queue/start — queue status
export async function GET(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await serviceClient
    .from('patent_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const [inProgressRes, queuedRes, settingsRes] = await Promise.all([
    serviceClient.from('claw_prompt_queue').select('id, prompt_label, started_at').eq('status', 'in_progress').limit(5),
    serviceClient.from('claw_prompt_queue').select('id, prompt_label, priority, created_at').eq('status', 'queued').order('priority', { ascending: true }).limit(20),
    serviceClient.from('app_settings').select('key, value').in('key', ['queue_auto_run_enabled', 'queue_security_gate_enabled']),
  ])

  const in_progress = inProgressRes.data ?? []
  const queued = queuedRes.data ?? []
  const settings = (settingsRes.data ?? []).reduce((acc: Record<string, unknown>, r: { key: string; value: unknown }) => {
    acc[r.key] = r.value
    return acc
  }, {} as Record<string, unknown>)

  const autoRunEnabled = settings['queue_auto_run_enabled'] !== 'false' &&
    settings['queue_auto_run_enabled'] !== false &&
    settings['queue_auto_run_enabled'] !== '0' &&
    settings['queue_auto_run_enabled'] !== 0

  let queueStatus: 'running' | 'idle' | 'paused'
  if (!autoRunEnabled) {
    queueStatus = 'paused'
  } else if (in_progress.length > 0) {
    queueStatus = 'running'
  } else {
    queueStatus = 'idle'
  }

  return NextResponse.json({
    status: queueStatus,
    in_progress,
    queued,
    queued_count: queued.length,
    auto_run_enabled: autoRunEnabled,
  })
}
