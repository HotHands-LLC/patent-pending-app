import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@supabase/supabase-js'
import { getUserTierInfo, isPro, tierRequiredResponse } from '@/lib/tier'
import { getUserTier, isTierPro } from '@/lib/subscription'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'
import { logAiUsage } from '@/lib/ai-budget'

export const dynamic = 'force-dynamic'

export const maxDuration = 300

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/**
 * POST /api/patents/[id]/refine-claims
 * Pro-only. Async Claude Sonnet refinement pass.
 * Returns 202 immediately. Email sent on completion.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      error: 'Pattie Polish is not yet configured.',
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

  const tier = await getUserTier(user.id)
  if (!isTierPro(tier)) {
    return NextResponse.json({
      error: 'Pattie Polish requires PatentPending Pro',
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

  // ── Tier gate ───────────────────────────────────────────────────────────
  const tierInfo = await getUserTierInfo(user.id)
  if (!isPro(tierInfo, { isOwner: true, feature: 'claims_edit' })) {
    return tierRequiredResponse('claims_edit')
  }

  if (!patent.claims_draft) return NextResponse.json({ error: 'No claims draft to refine' }, { status: 400 })
  if (patent.claims_status === 'refining') {
    return NextResponse.json({ error: 'Pattie Polish is already in progress' }, { status: 409 })
  }

  // Get owner email
  const { data: profile } = await supabaseService
    .from('patent_profiles')
    .select('email, full_name')
    .eq('id', user.id)
    .single()

  // Snapshot original claims before overwriting
  await supabaseService
    .from('patents')
    .update({
      claims_status: 'refining',
      claims_draft_pre_refine: patent.claims_draft,
      updated_at: new Date().toISOString(),
    })
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

  // waitUntil keeps the Vercel function alive after HTTP response is sent
  waitUntil(
    runRefinementPass(
      patentId,
      patent.title,
      patent.claims_draft,
      patent.description ?? '',
      user.id,
      profile?.email ?? '',
      profile?.full_name ?? 'Inventor'
    )
  )

  return NextResponse.json({
    ok: true,
    status: 'refining',
    message: "Refinement in progress — we'll email you when done (usually 2–3 min).",
  }, { status: 202 })
}

async function runRefinementPass(
  patentId: string,
  title: string,
  claimsDraft: string,
  description: string,
  userId: string,
  ownerEmail: string,
  ownerName: string
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
        'x-api-key': (process.env.ANTHROPIC_API_KEY ?? ''),
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
        claims_status: 'refined',
        updated_at: new Date().toISOString(),
      })
      .eq('id', patentId)

    // Update usage log
    const inputTok = data?.usage?.input_tokens ?? 0
    const outputTok = data?.usage?.output_tokens ?? 0
    const cost = inputTok * 3.0 / 1_000_000 + outputTok * 15.0 / 1_000_000

    await supabaseService.from('ai_usage_log')
      .update({ input_tokens: inputTok, output_tokens: outputTok, cost_usd: cost })
      .eq('action', 'claude_refinement_pass')
      .eq('patent_id', patentId)
      .order('created_at', { ascending: false })
      .limit(1)

    // Also log to ai_token_usage (account-level budget tracking, feature = 'pattie_polish')
    await logAiUsage(supabaseService, {
      userId:     (await supabaseService.from('patents').select('owner_id').eq('id', patentId).single()).data?.owner_id ?? '',
      patentId,
      feature:    'pattie_polish',
      tokensUsed: inputTok + outputTok,
      model:      'claude-sonnet-4-6',
    })

    // Send completion email via Resend
    if (ownerEmail && process.env.RESEND_API_KEY) {
      const patentUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'}/dashboard/patents/${patentId}?tab=claims`
      await sendEmail(buildEmail({
        to: ownerEmail,
        from: FROM_DEFAULT,
        subject: `Your claims have been refined — ${title}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">Your claims have been refined ✨</h2>
  <p>Hi ${ownerName},</p>
  <p>Pattie has completed a Polish pass on the claims for <strong>${title}</strong>.</p>
  <p>What was improved:</p>
  <ul>
    <li>Antecedent basis verified for all dependent claim elements</li>
    <li>Unnecessary limitations removed from independent claims</li>
    <li>§ 112 written description vulnerabilities addressed</li>
    <li>Non-standard terminology corrected</li>
  </ul>
  <p>Your original claims are saved — use the Before / After toggle in the Claims tab to compare.</p>
  <p><a href="${patentUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Refined Claims →</a></p>
</div>`,
      }))
    }

    console.log(`[refine-claims] Complete for ${patentId} — ${inputTok}+${outputTok} tokens, $${cost.toFixed(4)}`)
  } catch (err) {
    console.error('[refine-claims] Error:', err)
    await supabaseService.from('patents')
      .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', patentId)
  }
}
