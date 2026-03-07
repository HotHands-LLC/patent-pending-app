import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300 // 5 min — keeps function alive for Claude async completion
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

/**
 * POST /api/patents/[id]/refine-claims
 * Pro-only. Runs Claude Sonnet for a precision language + USPTO-style refinement pass.
 * Async — fires immediately, returns 200 while Anthropic completes in background.
 * Requires ANTHROPIC_API_KEY in Vercel env.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      error: 'Claude Refinement Pass is not yet configured.',
      detail: 'ANTHROPIC_API_KEY environment variable is missing.',
    }, { status: 503 })
  }

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
    return NextResponse.json({
      error: 'Claude Refinement Pass requires PatentPending Pro',
      upgrade_url: '/pricing',
    }, { status: 403 })
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
    return NextResponse.json({ error: 'A generation pass is already in progress' }, { status: 409 })
  }

  // Mark generating immediately
  await supabaseService
    .from('patents')
    .update({ claims_status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', patentId)

  // Log usage start
  await supabaseService.from('ai_usage_log').insert({
    user_id: user.id,
    patent_id: patentId,
    action: 'claude_refinement_pass',
    model: 'claude-sonnet-4-6',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
  })

  // Fire async — don't await
  runRefinementPass(patentId, patent.title, patent.claims_draft, patent.description ?? '', user.id).catch(console.error)

  return NextResponse.json({
    ok: true,
    message: 'Claude Refinement Pass started. Claims will update in ~60 seconds.',
  })
}

async function runRefinementPass(
  patentId: string,
  title: string,
  claimsDraft: string,
  description: string,
  userId: string
) {
  const systemPrompt = `You are a senior patent attorney with 25 years of USPTO prosecution experience. Your specialty is claim language precision — removing ambiguity, tightening scope without losing coverage, and ensuring every claim would survive an examiner's § 112 written description rejection.

You write in precise, formal patent English. You do not use marketing language. You do not add claims — you refine what exists.`

  const userPrompt = `Perform a precision language refinement pass on the following patent claims.

Your objectives:
1. Fix any § 112 written description or enablement vulnerabilities
2. Remove functional language where a structural limitation would be stronger  
3. Ensure antecedent basis is present for every element used in dependent claims
4. Remove unnecessary limitations from independent claims that could limit scope
5. Tighten dependent claims to add clear, defensible distinctions
6. Ensure claim 1 is the broadest defensible claim for this invention
7. Fix any grammatical issues or non-standard terminology
8. Verify "comprising" vs "consisting of" usage is intentional

Do NOT change the substance of the invention. Do NOT add claims. Do NOT remove claims. ONLY refine language.

Return ONLY the refined claims in standard numbered USPTO format (1., 2., 3., etc.). No commentary, no preamble, just the claims.

Patent Title: ${title}
Brief Description: ${description.slice(0, 800)}

Claims to Refine:
${claimsDraft.slice(0, 5000)}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[refine-claims] Anthropic error:', data)
      await supabaseService.from('patents')
        .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', patentId)
      return
    }

    const refinedClaims = data?.content?.[0]?.text?.trim()
    if (!refinedClaims) {
      await supabaseService.from('patents')
        .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', patentId)
      return
    }

    await supabaseService.from('patents')
      .update({
        claims_draft: refinedClaims,
        claims_status: 'complete',
        updated_at: new Date().toISOString(),
      })
      .eq('id', patentId)

    // Update usage log with actuals
    const inputTok = data?.usage?.input_tokens ?? 0
    const outputTok = data?.usage?.output_tokens ?? 0
    // Claude Sonnet pricing: $3/1M input, $15/1M output
    const cost = inputTok * 3.0 / 1_000_000 + outputTok * 15.0 / 1_000_000

    await supabaseService.from('ai_usage_log')
      .update({ input_tokens: inputTok, output_tokens: outputTok, cost_usd: cost })
      .eq('action', 'claude_refinement_pass')
      .eq('patent_id', patentId)
      .order('created_at', { ascending: false })
      .limit(1)

    console.log(`[refine-claims] Complete for patent ${patentId} — ${inputTok}+${outputTok} tokens, $${cost.toFixed(4)}`)
  } catch (err) {
    console.error('[refine-claims] Error:', err)
    await supabaseService.from('patents')
      .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', patentId)
  }
}
