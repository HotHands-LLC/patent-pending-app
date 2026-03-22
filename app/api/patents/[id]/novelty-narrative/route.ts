import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

async function callGeminiFlash(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not configured')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.6 },
      }),
    }
  )
  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts
  if (!parts?.length) throw new Error('No response from Gemini')
  return parts[0].text.trim()
}

/**
 * GET /api/patents/[id]/novelty-narrative
 * Returns (or lazily generates) a plain-English novelty narrative for investors.
 * Sources: claw_patents.prior_art_citations → Gemini Flash → cached in patents.novelty_narrative
 * Public endpoint — no auth required (narrative contains no sensitive data).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const supabase = getServiceClient()

  // 1. Fetch patent + existing narrative
  const { data: patent } = await supabase
    .from('patents')
    .select('id, title, novelty_narrative')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })

  // 2. Return cached narrative immediately
  if (patent.novelty_narrative) {
    return NextResponse.json({ narrative: patent.novelty_narrative, cached: true })
  }

  // 3. Find citations from claw_patents
  const { data: clawRow } = await supabase
    .from('claw_patents')
    .select('prior_art_citations, novelty_rationale')
    .eq('patent_id', patentId)
    .single()

  const citations: Array<{ title?: string; gap?: string; patent_number?: string }> =
    (clawRow?.prior_art_citations as Array<{ title?: string; gap?: string; patent_number?: string }>) ?? []

  if (!citations.length && !clawRow?.novelty_rationale) {
    return NextResponse.json({ narrative: null, cached: false })
  }

  // 4. Generate narrative with Gemini Flash
  const citationContext = citations
    .filter(c => c.title && c.gap)
    .slice(0, 5)
    .map(c => `- ${c.title}: ${c.gap}`)
    .join('\n')

  const prompt = citationContext
    ? `Given these prior art patents and how this invention goes beyond them:\n${citationContext}\n\nWrite 2-3 sentences in plain English explaining why "${patent.title}" is a novel invention that goes beyond existing solutions. Write for a non-expert investor. Do not use patent jargon. Do not start with "This invention".`
    : `Based on this novelty argument: "${clawRow?.novelty_rationale?.slice(0, 400)}"\n\nWrite 2-3 sentences in plain English explaining why "${patent.title}" is novel and potentially valuable. Write for a non-expert investor. Do not use patent jargon.`

  let narrative: string
  try {
    narrative = await callGeminiFlash(prompt)
  } catch (err) {
    console.error('[novelty-narrative] Gemini error:', err)
    return NextResponse.json({ narrative: null, cached: false })
  }

  // 5. Cache in patents table
  await supabase
    .from('patents')
    .update({ novelty_narrative: narrative })
    .eq('id', patentId)

  return NextResponse.json({ narrative, cached: false })
}
