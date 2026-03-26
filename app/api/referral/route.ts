/**
 * /api/referral — Referral code management
 * GET  → get or create referral code for current user + stats
 * POST → track a referred signup (called after auth completes with ref= param)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

function generateCode(name: string): string {
  const prefix = (name || 'USER').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'USER'
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `${prefix}-${suffix}`
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = getSvc()

  // Get or create referral code
  let { data: rc } = await svc.from('referral_codes').select('code').eq('user_id', user.id).single()
  if (!rc) {
    const { data: profile } = await svc.from('profiles').select('display_name').eq('id', user.id).single()
    const code = generateCode(profile?.display_name ?? user.email?.split('@')[0] ?? 'USER')
    const { data: newRc } = await svc.from('referral_codes').insert({ user_id: user.id, code }).select('code').single()
    rc = newRc
  }

  // Get referral stats
  const { data: events } = await svc.from('referral_events')
    .select('status, signed_up_at, activated_at, rewarded_at')
    .eq('referrer_user_id', user.id)

  const stats = {
    signed_up: (events ?? []).length,
    activated: (events ?? []).filter(e => e.activated_at).length,
    rewarded: (events ?? []).filter(e => e.rewarded_at).length,
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  return NextResponse.json({ code: rc?.code, url: `${appUrl}/?ref=${rc?.code}`, stats })
}

export async function POST(req: NextRequest) {
  // Track a referral signup — called after new user completes auth with ref= param
  const { referral_code, referred_user_id } = await req.json()
  if (!referral_code || !referred_user_id) return NextResponse.json({ error: 'referral_code + referred_user_id required' }, { status: 400 })

  const svc = getSvc()
  const { data: rc } = await svc.from('referral_codes').select('user_id').eq('code', referral_code).single()
  if (!rc) return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })

  // Don't self-refer
  if (rc.user_id === referred_user_id) return NextResponse.json({ ok: true })

  await svc.from('referral_events').upsert({
    referrer_user_id: rc.user_id,
    referred_user_id,
    referral_code,
    status: 'signed_up',
  }, { onConflict: 'referred_user_id' })

  return NextResponse.json({ ok: true })
}
