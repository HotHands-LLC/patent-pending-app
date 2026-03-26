import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getQueueETA } from '@/lib/queue-eta'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const eta = await getQueueETA()
  return NextResponse.json({
    canSleep: eta.canSleep,
    canSleepReason: eta.canSleepReason,
    estimatedAllComplete: eta.estimatedAllComplete.toISOString(),
    confidence: eta.confidence,
    totalMinutes: Math.round(eta.totalEstimatedSeconds / 60),
    queuedItems: eta.queuedItems.map(q => ({
      id: q.id,
      label: q.label,
      estimatedStart: q.estimatedStart.toISOString(),
      estimatedMinutes: Math.round(q.estimatedSeconds / 60),
    })),
  })
}
