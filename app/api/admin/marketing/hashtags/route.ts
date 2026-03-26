import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 20
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { channel, body, title } = await req.json()

  const prompt = `Generate 12–15 relevant hashtags for this ${channel} post about patents and invention.

Post title: ${title ?? ''}
Post content: ${(body ?? '').slice(0, 500)}

Return hashtags in three groups:
1. Broad reach (3-4): high-volume tags like #inventor #patent #startups
2. Niche (6-8): specific tags like #independentinventor #patentpending #makersofinstagram
3. Branded (2-3): #patentpendingapp #fileYourPatent

Return as a single space-separated string of hashtags (all starting with #), no other text.`

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',  'anthropic-version': '2023-06-01' },
    body: JSON.stringify({  // max_tokens: 512,
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.5 } }),
  })
  const d = await res.json()
  const hashtags = d?.content?.[0]?.text?.trim() ?? ''
  return NextResponse.json({ hashtags })
}
