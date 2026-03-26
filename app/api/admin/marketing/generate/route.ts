import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}
function userClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/** POST /api/admin/marketing/generate — generate 5 ideas via Gemini */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await userClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json()
  const { brand = 'pp.app', type = 'ideas', channel, title, hook } = body

  // Fetch patent context
  const { data: patents } = await svc()
    .from('patents')
    .select('title, status, filing_status')
    .in('filing_status', ['provisional_filed', 'nonprov_filed', 'approved', 'draft'])
    .limit(10)

  const patentList = (patents ?? []).map(p => p.title).join(', ') || 'QR+ Interactive Media System, RIP2 Light-Based Communication for Blind Individuals, READI Smart Grid Retrofit'

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  let prompt: string
  if (type === 'draft_single') {
    prompt = `Write a complete social media post for ${channel}.
Title/Angle: ${title}
Hook: ${hook ?? ''}
Brand: ${brand} (patentpending.app — AI platform to help inventors file their own patents)
Write the full post body. Match the voice and format of the channel.
Return JSON: {"body": "..."}` 
  } else if (type === 'attorney_outreach') {
    prompt = `You are a marketing copywriter for patentpending.app. Write a warm, professional attorney outreach email.

Brand: patentpending.app
Target: Solo and small patent attorneys
Angle: PatentPending.app helps inventors who can't afford full legal representation file and manage their own patents. We'd love to be a referral resource — attorneys send clients who need help but can't pay full fees; inventors get AI-assisted filing; attorneys focus on complex cases.

Write:
- Subject line (one line, compelling, professional)
- Body (3 paragraphs: intro/hook, value prop, soft call to action)
- Sign as: Chad Bostwick, Founder, patentpending.app

Return JSON: {"subject": "...", "body": "..."}`
  } else {
    prompt = `You are a marketing strategist for ${brand}. Generate 5 ranked content ideas.

Brand: ${brand}
Active patents: ${patentList}
Founder story: Independent inventor who built an AI platform to file his own patents. Filed RIP2 (Light-Based Communication System) using the platform. Non-technical founder navigating USPTO pro se.
Available channels: TikTok, Instagram, LinkedIn, Reddit, Attorney Outreach, Amazon
Goal: Drive awareness and signups among independent inventors.

For each idea provide:
- channel (one of: TikTok, Instagram, LinkedIn, Reddit, Attorney Outreach, Amazon)
- title (one compelling line)
- hook (first sentence that grabs attention)
- rationale (one sentence why this works)

Return a JSON array of 5 objects: [{"channel":"...","title":"...","hook":"...","rationale":"..."}]`
  }

  const gemRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.8, responseMimeType: 'application/json' },
      }),
    }
  )

  if (!gemRes.ok) return NextResponse.json({ error: 'Gemini call failed' }, { status: 500 })
  const gemData = await gemRes.json()
  const raw = gemData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'

  try {
    const parsed = JSON.parse(raw)
    return NextResponse.json({ result: parsed, raw })
  } catch {
    return NextResponse.json({ result: null, raw })
  }
}
