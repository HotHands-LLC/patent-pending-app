import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(t: string) { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL??'', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'', {global:{headers:{Authorization:`Bearer ${t}`}}}) }
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL??'', process.env.SUPABASE_SERVICE_ROLE_KEY??'') }

const FOUNDER_CTX = `Founder: Chad Bostwick — built patentpending.app because he couldn't afford $10K+ in attorney fees.
Platform: patentpending.app — file your patent, keep your idea. AI-powered patent filing for independent inventors.
First patent filed: RIP2 — Light-Based Communication System for Blind Individuals. Filed March 12, 2026.
Tone: direct, builder-first, no fluff.`

async function gemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY ?? ''
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:1500, temperature:0.8}})
  })
  const d = await r.json()
  return d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
}

const PIECES = [
  { channel: 'TikTok', title: 'TikTok: I Filed My Own Patent', prompt: `${FOUNDER_CTX}\nWrite a 45-second TikTok script. Hook: "I filed this". [VISUAL] cues. End with patentpending.app CTA.` },
  { channel: 'Instagram', title: 'Instagram: The RIP2 Story', prompt: `${FOUNDER_CTX}\nInstagram caption for Chad at his desk. RIP2 story. Question at end. Under 300 words. Then HASHTAGS: [15 tags]` },
  { channel: 'LinkedIn', title: 'LinkedIn: Founder Announcement', prompt: `${FOUNDER_CTX}\nLinkedIn post about launching pp.app. RIP2 story. 1,000–1,300 chars. CTA at end.` },
  { channel: 'Reddit', title: 'Reddit r/patents: Lessons', prompt: `${FOUNDER_CTX}\nReddit post for r/patents. TITLE: [title]\n\n3-4 lessons from filing RIP2. Mention pp.app once. Under 500 words.` },
  { channel: 'Attorney Outreach', title: 'Attorney Outreach Email', prompt: `${FOUNDER_CTX}\nCold email to solo patent attorneys. SUBJECT: [subject]\n\nReferral partner angle. Under 200 words.` },
  { channel: 'Reddit', title: 'Reddit r/entrepreneur: Builder Story', prompt: `${FOUNDER_CTX}\nReddit r/entrepreneur post. TITLE: I got tired of attorney quotes...\n\nBuilder journey. Under 600 words.` },
]

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUser(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({error:'Admin only'},{status:403})
  const svc = getSvc()
  let saved = 0
  for (const p of PIECES) {
    try {
      const content = await gemini(p.prompt)
      let body = content, title = p.title, hook = null, subject = null, hashtags = null
      if (content.includes('HASHTAGS:')) { const pts = content.split('HASHTAGS:',2); body = pts[0].trim(); hashtags = pts[1].trim() }
      if (content.startsWith('SUBJECT:')) { const lines = content.split('\n',3); subject = lines[0].replace('SUBJECT:','').trim(); title = subject; body = lines.slice(1).join('\n').trim() }
      if (content.startsWith('TITLE:')) { const lines = content.split('\n',3); title = lines[0].replace('TITLE:','').trim(); body = lines.slice(1).join('\n').trim() }
      if (p.channel === 'TikTok') hook = body.split('\n')[0].slice(0,100)
      await svc.from('marketing_ideas').insert({ brand:'pp.app', channel:p.channel, title:title.slice(0,200), body, hook, subject_line:subject, hashtags, status:'ready', source:'pattie' })
      saved++
    } catch { /* skip on error */ }
    await new Promise(r => setTimeout(r, 500))
  }
  return NextResponse.json({ ok: true, saved })
}
