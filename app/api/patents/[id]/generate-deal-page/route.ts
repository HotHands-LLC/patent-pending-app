import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

async function geminiGenerate(prompt: string, maxTokens = 1024): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
    }),
  })
  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? []
  return parts.filter(p => !p.thought).map(p => p.text ?? '').join('').trim()
}

/**
 * POST /api/patents/[id]/generate-deal-page
 * Owner-only. Generates plain-English summary + market opportunity via Gemini.
 * Stores in patents.deal_page_summary + patents.deal_page_market.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, title, owner_id, description, claims_draft, arc3_active')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!patent.arc3_active) return NextResponse.json({ error: 'Activate Arc 3 first' }, { status: 400 })

  const claims = patent.claims_draft?.slice(0, 3000) ?? ''
  const desc = patent.description?.slice(0, 1000) ?? ''

  const [summary, market] = await Promise.all([
    geminiGenerate(`You are writing a technology summary for a patent licensing deal page.
The audience is potential licensees — business people, not patent attorneys.
Write 3-4 sentences in plain English explaining what this invention does and why it's valuable.
No jargon. No claims language. Just clear value proposition.

Patent Title: ${patent.title}
Description: ${desc}
Key Claims (excerpt): ${claims}

Write ONLY the summary text, no headers or labels.`, 512),

    geminiGenerate(`You are writing a market opportunity section for a patent licensing deal page.
Write 3-4 sentences covering: estimated market size, key industries or use cases that would benefit, and why now is the right time.
Be concrete and specific. Use real industry names. Keep it business-focused.

Patent Title: ${patent.title}
Description: ${desc}

Write ONLY the market opportunity text, no headers or labels.`, 512),
  ])

  await supabaseService
    .from('patents')
    .update({
      deal_page_summary: summary,
      deal_page_market: market,
      updated_at: new Date().toISOString(),
    })
    .eq('id', patentId)

  return NextResponse.json({ ok: true, summary, market })
}
