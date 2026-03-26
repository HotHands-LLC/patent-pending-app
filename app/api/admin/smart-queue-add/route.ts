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

/**
 * POST /api/admin/smart-queue-add
 * Analyze raw text/prompt with Claude and return structured queue item.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { input, queue_context } = await req.json()
  if (!input?.trim()) return NextResponse.json({ error: 'input required' }, { status: 400 })

  const founderCtx = await getPattieContext('pp.app').catch(() => '')

  const prompt = `You are analyzing a prompt or task that Chad wants to add to the PatentClaw build queue.
${founderCtx ? `\n${founderCtx}\n` : ''}
Current queue: ${queue_context || 'empty'}

Analyze the following input and return a JSON object:
- label: Short descriptive title (max 60 chars, format like "XX — Description")
- priority: Suggested priority integer. P0=critical/crash, P1=important feature, P2=enhancement, P3=nice-to-have. Don't duplicate existing priorities shown above.
- urgency: "p0" | "p1" | "p2" | "p3"
- reasoning: One sentence explaining your priority recommendation
- prompt_body: The cleaned, formatted prompt body ready to send to Claw. If the input is already a well-formed prompt with headers, return it as-is. If it's a rough idea or plain English, expand it into a proper Claw prompt with ## Context, ## What to Build, and ## Acceptance Criteria sections.

INPUT:
${input.slice(0, 8000)}`

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.2, responseMimeType: 'application/json' },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Gemini error: ${err.slice(0, 200)}` }, { status: 500 })
  }

  const data = await res.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Parse JSON from response
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    const parsed = JSON.parse(cleaned.slice(start, end + 1))
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response', raw: raw.slice(0, 300) }, { status: 500 })
  }
}
