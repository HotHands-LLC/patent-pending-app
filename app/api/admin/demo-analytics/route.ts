import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUser(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '7')
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const svc = getSvc()

  // Sessions from demo_sessions table
  const { data: sessions } = await svc.from('demo_sessions')
    .select('session_id, message_count, dominant_intent, started_at, last_activity_at')
    .gte('started_at', since).order('started_at', { ascending: false }).limit(200)

  // Events from demo_events
  const { data: events } = await svc.from('demo_events')
    .select('session_id, event_type, intent_category, message_count, created_at')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(2000)

  const sess = sessions ?? []
  const evts = events ?? []

  // Aggregate stats
  const totalSessions = new Set(sess.map(s => s.session_id)).size
  const totalMessages = evts.filter(e => e.event_type === 'demo_message' || e.event_type === 'demo_start').length
  const avgMessages = totalSessions > 0 ? Math.round(totalMessages / totalSessions * 10) / 10 : 0
  const gateShown = new Set(evts.filter(e => e.event_type === 'gate_shown').map(e => e.session_id)).size
  const gateClicked = new Set(evts.filter(e => e.event_type === 'gate_signup_click').map(e => e.session_id)).size
  const rateLimited = new Set(evts.filter(e => e.event_type === 'rate_limit_hit').map(e => e.session_id)).size

  // Sessions by day
  const byDay: Record<string, number> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
    byDay[d] = 0
  }
  const seenSessions = new Set<string>()
  for (const e of evts.filter(e => e.event_type === 'demo_start')) {
    const d = e.created_at.split('T')[0]
    if (!seenSessions.has(e.session_id) && d in byDay) {
      byDay[d]++; seenSessions.add(e.session_id)
    }
  }

  // Intent breakdown
  const intentCounts: Record<string, number> = {}
  for (const e of evts.filter(e => e.intent_category)) {
    intentCounts[e.intent_category!] = (intentCounts[e.intent_category!] ?? 0) + 1
  }

  // Recent sessions
  const recentSessions = sess.slice(0, 50).map(s => ({
    session_id: s.session_id.slice(0, 8),
    messages: s.message_count ?? 0,
    intent: s.dominant_intent ?? 'unknown',
    started_at: s.started_at,
    gate_shown: evts.some(e => e.session_id === s.session_id && e.event_type === 'gate_shown'),
    converted: evts.some(e => e.session_id === s.session_id && e.event_type === 'gate_signup_click'),
    rate_limited: evts.some(e => e.session_id === s.session_id && e.event_type === 'rate_limit_hit'),
  }))

  return NextResponse.json({
    stats: { totalSessions, avgMessages, gateShown, gateClicked, rateLimited,
      gateRate: totalSessions > 0 ? Math.round(gateShown / totalSessions * 100) : 0,
      convRate: gateShown > 0 ? Math.round(gateClicked / gateShown * 100) : 0 },
    byDay: Object.entries(byDay).sort((a,b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
    intentCounts,
    recentSessions,
  })
}
