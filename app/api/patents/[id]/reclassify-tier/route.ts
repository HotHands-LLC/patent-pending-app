import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

const TIER_PROMPT = `You are an IP commercialization analyst. Evaluate this patent for commercial potential.

TITLE: {title}
ABSTRACT: {abstract}
CPC CODES: {cpc_codes}
FIRST INDEPENDENT CLAIM: {first_claim}

Assign ONE tier:
TIER 1: Active commercial players, real licensing leverage, market >$100M, timing window open
TIER 2: Niche/emerging market, worth protecting, timing uncertain
TIER 3: Saturated/theoretical, no realistic commercial path

Respond in JSON only (no markdown):
{"tier": 1 or 2 or 3, "rationale": "2-3 sentence explanation", "commercial_players": ["co1","co2"], "market_signal": "one sentence", "timing": "open|closing|closed", "confidence": "high|medium|low"}`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )

  const { data: patent } = await service
    .from('patents')
    .select('id, title, abstract_draft, claims_draft, cpc_codes')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })

  // Extract first claim
  const claims = patent.claims_draft ?? ''
  const firstClaimMatch = claims.match(/1\.\s+([\s\S]+?)(?=\n\d+\.)/)
  const firstClaim = firstClaimMatch ? firstClaimMatch[1].trim().slice(0, 600) : claims.slice(0, 600)

  const prompt = TIER_PROMPT
    .replace('{title}', patent.title ?? '')
    .replace('{abstract}', (patent.abstract_draft ?? 'Not provided').slice(0, 500))
    .replace('{cpc_codes}', (patent.cpc_codes ?? []).join(', ') || 'Not assigned')
    .replace('{first_claim}', firstClaim)

  // Call Gemini
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.3 }
      })
    }
  )
  if (!geminiRes.ok) {
    return NextResponse.json({ error: 'Gemini call failed' }, { status: 500 })
  }
  const geminiData = await geminiRes.json()
  const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Parse JSON
  let result: Record<string, unknown>
  try {
    const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}')
    result = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return NextResponse.json({ error: 'Failed to parse Gemini response', raw: raw.slice(0, 300) }, { status: 500 })
  }

  const tier = result.tier as number
  if (![1, 2, 3].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier from Gemini', result }, { status: 500 })
  }

  // Save to DB
  await service.from('patents').update({
    commercial_tier: tier,
    tier_rationale: result.rationale,
    tier_classified_at: new Date().toISOString(),
  }).eq('id', patentId)

  // Save full analysis to claw_patents if linked
  const { data: cp } = await service.from('claw_patents').select('id').eq('patent_id', patentId).limit(1).single()
  if (cp) {
    await service.from('claw_patents').update({ commercial_space_analysis: result }).eq('id', cp.id)
  }

  return NextResponse.json({ ...result, patent_id: patentId })
}
