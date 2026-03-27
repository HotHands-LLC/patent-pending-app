import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STUCK_THRESHOLD_MINUTES = 25
const HEARTBEAT_STALE_MINUTES = 10

async function sendTelegram(msg: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: msg }),
  }).catch(() => {})
}

export async function GET(req: NextRequest) {
  // Allow Vercel cron (no auth header) or admin token
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await serviceClient.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()

  // Find in_progress items where:
  // - last_heartbeat is NULL and started_at > STUCK_THRESHOLD ago, OR
  // - last_heartbeat is older than HEARTBEAT_STALE_MINUTES
  const stuckThreshold = new Date(now.getTime() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString()
  const heartbeatThreshold = new Date(now.getTime() - HEARTBEAT_STALE_MINUTES * 60 * 1000).toISOString()

  const { data: inProgress } = await serviceClient
    .from('claw_prompt_queue')
    .select('id, prompt_label, prompt_body, started_at, last_heartbeat')
    .eq('status', 'in_progress')

  if (!inProgress?.length) {
    return NextResponse.json({ ok: true, checked: 0, skipped: 0 })
  }

  const stuck = inProgress.filter(item => {
    if (item.last_heartbeat) {
      return item.last_heartbeat < heartbeatThreshold
    }
    return item.started_at < stuckThreshold
  })

  let skippedCount = 0
  for (const item of stuck) {
    const startedAt = new Date(item.started_at)
    const elapsedMin = Math.round((now.getTime() - startedAt.getTime()) / 60000)

    await serviceClient
      .from('claw_prompt_queue')
      .update({
        status: 'stuck',
        completed_at: now.toISOString(),
        error_message: `Auto-skipped by watchdog: in_progress for ${elapsedMin}m with no heartbeat`,
      })
      .eq('id', item.id)

    await sendTelegram(
      `⚠️ WATCHDOG: Stuck task auto-skipped\nTask: ${item.prompt_label}\nTime in progress: ${elapsedMin}m\nStatus: → stuck\nQueue will advance to next item.`
    )

    skippedCount++
  }

  return NextResponse.json({ ok: true, checked: inProgress.length, skipped: skippedCount })
}
