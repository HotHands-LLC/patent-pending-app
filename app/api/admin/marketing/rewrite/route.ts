import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPattieContext } from '@/lib/pattie-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id, tone, channel, current_body } = await req.json()
  if (!current_body?.trim()) return NextResponse.json({ error: 'current_body required' }, { status: 400 })

  const toneGuides: Record<string, string> = {
    educational: 'informative, clear, teaches something valuable, builds credibility',
    story: 'personal narrative, emotional, first-person, shows the journey',
    hype: 'energetic, bold, uses excitement, strong calls to action',
    professional: 'formal, credible, respectful, business-appropriate',
  }

  const founderCtx = await getPattieContext('pp.app').catch(() => '')

  const prompt = `You are a marketing content writer. Rewrite the following ${channel} content in a "${tone}" tone.
${founderCtx ? `\n${founderCtx}\n` : ''}
Tone description: ${toneGuides[tone] ?? tone}
Platform: ${channel}
Preserve the core message and key information. Keep the same approximate length.

ORIGINAL:
${current_body}

Return only the rewritten content, no explanation.`

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',  'anthropic-version': '2023-06-01' },
    body: JSON.stringify({  // max_tokens: 2048,
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.5 } }),
  })
  const d = await res.json()
  const body = d?.content?.[0]?.text?.trim() ?? ''
  if (!body) return NextResponse.json({ error: 'No response from Claude' }, { status: 500 })

  // Save to DB
  if (id) {
    await getServiceClient().from('marketing_ideas').update({ body, tone }).eq('id', id)
  }
  return NextResponse.json({ body })
}
