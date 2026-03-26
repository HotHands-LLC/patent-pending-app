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

/** Safely extract text from Gemini or Claude response */
function extractLLMText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>
  // Gemini shape
  const candidates = d.candidates as Array<Record<string, unknown>> | undefined
  if (candidates?.[0]) {
    const content = candidates[0].content as Record<string, unknown> | undefined
    const parts = content?.parts as Array<Record<string, unknown>> | undefined
    if (parts?.[0]?.text) return String(parts[0].text)
  }
  // Claude shape
  const content = d.content as Array<Record<string, unknown>> | undefined
  if (content?.[0]?.text) return String(content[0].text)
  return ''
}

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

  // If input is already a well-formed prompt (has ## headers), preserve it entirely as prompt_body
  // and only ask Gemini for metadata (label, priority, reasoning)
  const isWellFormedPrompt = input.includes('## ') || input.includes('# ')
  
  const prompt = isWellFormedPrompt
    ? `Analyze this queue prompt and return ONLY a JSON object with metadata. Do NOT rewrite the prompt_body — use the input exactly as-is.

Current queue: ${queue_context || 'empty'}

Return this JSON:
{
  "label": "short title max 60 chars",
  "priority": 5,
  "urgency": "p1",
  "reasoning": "one sentence",
  "prompt_body": ${JSON.stringify(input.slice(0, 6000))}
}

INPUT:
${input.slice(0, 1000)}`
    : `You are analyzing a task for the PatentClaw build queue.
${founderCtx ? `\n${founderCtx}\n` : ''}
Current queue: ${queue_context || 'empty'}

Return a JSON object:
- label: Short title (max 60 chars, format "XX — Description")
- priority: integer (P0=critical, P1=important, P2=enhancement, P3=nice-to-have)
- urgency: "p0" | "p1" | "p2" | "p3"
- reasoning: One sentence
- prompt_body: Cleaned prompt with ## Context, ## What to Build, ## Acceptance Criteria

INPUT:
${input.slice(0, 6000)}`

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
        // Note: NOT using responseMimeType to avoid JSON truncation on large prompts
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Gemini error: ${err.slice(0, 200)}` }, { status: 500 })
  }

  const data = await res.json()
  const raw = extractLLMText(data)

  // Guard: ensure we got something
  if (!raw || raw.trim().length < 10) {
    return NextResponse.json({
      error: 'Analysis returned empty response — check Gemini API and response parsing',
      raw_response: JSON.stringify(data).slice(0, 300),
    }, { status: 500 })
  }

  // Parse JSON from response (strip markdown fences if present)
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1) throw new Error('No JSON found in response')
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    
    // Guard: ensure prompt_body is populated
    if (!parsed.prompt_body || String(parsed.prompt_body).trim().length < 5) {
      // Fallback: use the input directly as prompt_body
      parsed.prompt_body = input
    }
    
    return NextResponse.json(parsed)
  } catch {
    // Fallback: return structured response with raw input as body
    return NextResponse.json({
      label: input.split('\n')[0].slice(0, 60).replace(/^#+\s*/, ''),
      priority: 5,
      urgency: 'p1',
      reasoning: 'Auto-extracted — Gemini parse failed, using input as-is',
      prompt_body: input,
    })
  }
}
