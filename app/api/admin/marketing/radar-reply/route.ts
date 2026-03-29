import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MARKETING_GUARDRAILS } from '@/lib/marketing-guardrails'

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

  const prompt = `You are a helpful member of the inventor community writing a reply to a patent-related post.

${MARKETING_GUARDRAILS}

Write a helpful reply to this post. Lead with genuine, useful information. Mention PatentPending.app once at the end only if it directly applies — naturally, not as a pitch. Tone: knowledgeable peer, not salesperson. Under 200 words.

If you want to mention tools for inventors, use: "PatentPending.app has tools to help inventors understand their options and build stronger applications — worth checking out if you're navigating this."

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
