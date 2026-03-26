/**
 * /api/onboarding — onboarding state management + welcome email trigger
 * GET  → current onboarding state for user
 * POST → update intent, steps, dismissed
 * POST { action: 'send_welcome_email' } → send Day 1 email via Resend
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await getSvc().from('patent_profiles')
    .select('intent, onboarding_steps, onboarding_dismissed')
    .eq('id', user.id).single()
  return NextResponse.json(data ?? {})
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const svc = getSvc()

  if (body.action === 'send_welcome_email') {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ ok: false, reason: 'No Resend key' })
    const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'there'
    const emailBody = `Hey ${firstName},

Welcome to patentpending.app. I'm Pattie — I'll help you protect your invention without the $10K attorney bill.

Here's what to do next:
→ Tell me about your invention (takes 5 minutes)
→ I'll draft your patent abstract and claims
→ You'll have a filing-ready provisional in days, not months

Start here: https://patentpending.app/dashboard

One thing: if you have a filing deadline coming up, tell me now. Provisional patents have a 12-month window from public disclosure — don't let that slip.

– Pattie (and Chad, the founder)
patentpending.app`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Pattie <pattie@patentpending.app>',
        to: [user.email!],
        subject: `Your patent journey starts now, ${firstName}`,
        text: emailBody,
      }),
    })
    return NextResponse.json({ ok: res.ok })
  }

  // Update onboarding state
  const updates: Record<string, unknown> = {}
  if (body.intent !== undefined) updates.intent = body.intent
  if (body.onboarding_steps !== undefined) updates.onboarding_steps = body.onboarding_steps
  if (body.onboarding_dismissed !== undefined) updates.onboarding_dismissed = body.onboarding_dismissed

  await svc.from('patent_profiles').upsert({ id: user.id, ...updates }, { onConflict: 'id' })
  return NextResponse.json({ ok: true })
}
