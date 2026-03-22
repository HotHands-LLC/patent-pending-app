import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']
const GEMINI_SCORE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent`

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}
function getServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

function buildScoringPrompt(title: string, specText: string, claimsText: string): string {
  return `You are an expert patent analyst. Score this patent on three dimensions (0–100 each).

Patent title: ${title}

Specification (excerpt):
${specText.slice(0, 3000)}

Claims (excerpt):
${claimsText.slice(0, 1500)}

NOVELTY: [0–100 integer]
How far does this invention sit from the prior art centroid?
0 = fully anticipated by existing patents, 100 = completely novel
Reason: [2 sentences]

COMMERCIAL_VALUE: [0–100 integer]
Estimated market relevance, licensing potential, product applicability across industries.
0 = no commercial application, 100 = massive multi-industry opportunity
Reason: [2 sentences]

FILING_COMPLEXITY: [0–100 integer]
How hard is this to file pro se? Higher = harder.
Consider: claim language complexity, spec completeness, likely office actions.
0 = simple/straightforward, 100 = highly complex, attorney recommended
Reason: [2 sentences]

Output ONLY:
NOVELTY: [integer]
NOVELTY_REASON: [2 sentences]
COMMERCIAL_VALUE: [integer]
COMMERCIAL_REASON: [2 sentences]
FILING_COMPLEXITY: [integer]
COMPLEXITY_REASON: [2 sentences]`
}

/**
 * POST /api/patents/[id]/rescore
 * Admin-only. Re-evaluates N/V/C scores using Gemini 2.5 Pro.
 * Writes to claw_patents (insert if not exists).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const supabase = getServiceClient()

  // Fetch patent
  const { data: patent } = await supabase
    .from('patents')
    .select('id, title, spec_draft, claims_draft, abstract_draft, description, owner_id')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })

  const title      = patent.title ?? 'Untitled'
  const specText   = [patent.spec_draft, patent.abstract_draft, patent.description].filter(Boolean).join('\n\n')
  const claimsText = patent.claims_draft ?? ''

  if (!specText && !claimsText) {
    return NextResponse.json({ error: 'No spec or claims to score. Add spec/claims first.' }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  // Call Gemini 2.5 Pro
  const geminiRes = await fetch(`${GEMINI_SCORE_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildScoringPrompt(title, specText, claimsText) }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
    }),
  })

  if (!geminiRes.ok) {
    const err = await geminiRes.text()
    console.error('[rescore] Gemini error:', err)
    return NextResponse.json({ error: 'Scoring failed — Gemini error' }, { status: 502 })
  }

  const gd = await geminiRes.json()
  const text: string = gd.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  if (!text) return NextResponse.json({ error: 'No text in Gemini response' }, { status: 502 })

  function extractInt(label: string): number {
    const m = text.match(new RegExp(`${label}:\\s*(\\d+)`, 'i'))
    return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : 50
  }

  const novelty    = extractInt('NOVELTY')
  const commercial = extractInt('COMMERCIAL_VALUE')
  const complexity = extractInt('FILING_COMPLEXITY')
  const composite  = Math.round((novelty * 0.4 + commercial * 0.4 + (100 - complexity) * 0.2) * 100) / 100
  const scoredAt   = new Date().toISOString()

  // Check if claw_patents row exists
  const { data: existing } = await supabase
    .from('claw_patents')
    .select('id')
    .eq('patent_id', patentId)
    .single()

  if (existing) {
    await supabase.from('claw_patents').update({
      novelty_score:    novelty,
      commercial_score: commercial,
      filing_complexity: complexity,
      composite_score:   composite,
      scored_at:         scoredAt,
    }).eq('id', existing.id)
  } else {
    // Insert minimal row for non-Claw patents
    await supabase.from('claw_patents').insert({
      title:            title,
      invention_area:   'user_created',
      novelty_rationale: '',
      research_summary: '',
      status:           'draft',
      legal_note:       'Score computed by admin re-score — not a Claw-invented patent.',
      patent_id:        patentId,
      novelty_score:    novelty,
      commercial_score: commercial,
      filing_complexity: complexity,
      composite_score:   composite,
      scored_at:         scoredAt,
    })
  }

  return NextResponse.json({
    novelty_score:     novelty,
    commercial_score:  commercial,
    filing_complexity: complexity,
    composite_score:   composite,
    scored_at:         scoredAt,
  })
}
