import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 20
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { lead_id, post_title, post_body, reply_angle } = await req.json()
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const prompt = `Write a helpful reply for this post about patents. Be genuinely useful. Mention patentpending.app naturally only if it directly helps. Tone: knowledgeable friend, not salesperson. Under 200 words.

Post: ${post_title}
${post_body ? `Details: ${post_body.slice(0, 300)}` : ''}
${reply_angle ? `Context: ${reply_angle}` : ''}`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 512, temperature: 0.7 } }),
  })
  const d = await res.json()
  const reply = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  if (!reply) return NextResponse.json({ error: 'No response' }, { status: 500 })

  if (lead_id) {
    await getSvc().from('community_radar_leads').update({ draft_reply: reply }).eq('id', lead_id)
  }
  return NextResponse.json({ reply })
}
