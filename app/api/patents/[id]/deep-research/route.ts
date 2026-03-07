import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserTier } from '@/lib/subscription'

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

const GEMINI_FLASH = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

/**
 * POST /api/patents/[id]/deep-research
 * Pro-only. Runs extended Gemini prior art analysis and strengthens claims.
 * Async — queues a review_queue job for the cron to pick up, but also
 * fires immediately if the request is fast enough.
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

  // Pro gate
  const tier = await getUserTier(user.id)
  if (tier !== 'pro') {
    return NextResponse.json({ error: 'Deep Research Pass requires PatentPending Pro', upgrade_url: '/pricing' }, { status: 403 })
  }

  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, title, owner_id, description, claims_draft, claims_status')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!patent.claims_draft) return NextResponse.json({ error: 'No claims draft to refine' }, { status: 400 })
  if (patent.claims_status === 'generating') {
    return NextResponse.json({ error: 'Claims generation already in progress' }, { status: 409 })
  }

  // Mark as generating
  await supabaseService
    .from('patents')
    .update({ claims_status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', patentId)

  // Log usage
  await supabaseService.from('ai_usage_log').insert({
    user_id: user.id,
    patent_id: patentId,
    action: 'deep_research_pass',
    model: 'gemini-2.5-flash',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
  })

  // Fire Gemini async (don't await — let it run, cron will also pick up)
  runDeepResearch(patentId, patent.title, patent.claims_draft, patent.description ?? '').catch(console.error)

  return NextResponse.json({ ok: true, message: 'Deep Research Pass started. Claims will update in 2-5 minutes.' })
}

async function runDeepResearch(patentId: string, title: string, claimsDraft: string, description: string) {
  const prompt = `You are a senior USPTO patent examiner AND a patent attorney with 20 years of experience.

Your task is the Deep Research Pass for this patent. Do the following in sequence:

**STEP 1 — Prior Art Analysis**
Review the claims below. Identify the 3 most likely categories of prior art that could challenge novelty:
- What existing technologies does this overlap with?
- What would an examiner search for?
- What are the key distinctions that make this novel?

**STEP 2 — Strengthened Claims**
Rewrite the claims to:
1. Maximize protection while avoiding the prior art you identified
2. Ensure each independent claim has a clear point of novelty
3. Add or improve dependent claims to create a stronger claim tree
4. Use precise USPTO-compliant language (means-plus-function only where appropriate)
5. Ensure claim 1 is broad but defensible

**STEP 3 — Output**
Return ONLY the complete rewritten claims in standard USPTO numbered format (1., 2., 3., etc.)
No preamble, no analysis, just the claims.

Patent Title: ${title}
Description: ${description.slice(0, 1500)}

Current Claims:
${claimsDraft.slice(0, 4000)}`

  try {
    const res = await fetch(GEMINI_FLASH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
      }),
    })
    const data = await res.json()
    const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? []
    const newClaims = parts.filter(p => !p.thought).map(p => p.text ?? '').join('').trim()

    if (newClaims) {
      await supabaseService
        .from('patents')
        .update({
          claims_draft: newClaims,
          claims_status: 'complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', patentId)

      // Update usage log with token counts
      const inputTok = data?.usageMetadata?.promptTokenCount ?? 0
      const outputTok = data?.usageMetadata?.candidatesTokenCount ?? 0
      const cost = inputTok * 1.25 / 1_000_000 + outputTok * 10.0 / 1_000_000
      await supabaseService.from('ai_usage_log')
        .update({ input_tokens: inputTok, output_tokens: outputTok, cost_usd: cost })
        .eq('action', 'deep_research_pass')
        .eq('patent_id', patentId)
        .order('created_at', { ascending: false })
        .limit(1)
    } else {
      await supabaseService.from('patents')
        .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', patentId)
    }
  } catch (err) {
    console.error('[deep-research] Gemini error:', err)
    await supabaseService.from('patents')
      .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', patentId)
  }
}
