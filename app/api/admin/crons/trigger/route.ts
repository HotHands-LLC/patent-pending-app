import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const execAsync = promisify(exec)
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

// Map cron_name → OpenClaw cron ID
const CRON_IDS: Record<string, string> = {
  'claw-invents-nightly':   '64f078ca-76d1-4943-a012-4543a4fd85bf',
  'claw-observer-nightly':  '0f85fc28-0949-4c67-bdd9-36ed768ae716',
  'claw-healer-midnight':   '3635d450-7e01-42af-883b-b241a7076f08',
  'claw-healer-morning':    '46537add-742a-40c7-878d-4e07c9e8038c',
  'clawwatch-nightly':      '9a4a90c9-3685-4e93-bdae-dc363a0cd35d',
  'ux-audit-nightly':       '2cb14617-5c9c-443f-8123-2b36deeb66b5',
  'pattie-monitor-nightly': '86c8cb71-8dc7-4d3d-a1be-a09faba2df76',
  'daily-briefing':         'c0ffee01-d41b-4b16-9a3c-bb8e1f2d3a4e',
}

/** POST /api/admin/crons/trigger — manually trigger a cron */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { cron_name } = await req.json()
  const cronId = CRON_IDS[cron_name]
  if (!cronId) return NextResponse.json({ error: `Unknown cron: ${cron_name}` }, { status: 400 })

  try {
    const { stdout, stderr } = await execAsync(
      `/opt/homebrew/bin/openclaw cron run ${cronId}`,
      { timeout: 25000 }
    )
    return NextResponse.json({ ok: true, output: (stdout + stderr).slice(0, 500) })
  } catch (err) {
    const e = err as { message?: string; stdout?: string; stderr?: string }
    return NextResponse.json({
      error: e.message ?? 'Trigger failed',
      detail: ((e.stdout ?? '') + (e.stderr ?? '')).slice(0, 300),
    }, { status: 500 })
  }
}
