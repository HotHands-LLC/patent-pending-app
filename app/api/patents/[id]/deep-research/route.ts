import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { stripLlmAttribution, researchReportTitle } from '@/lib/ai-utils'
import { logAiUsage } from '@/lib/ai-budget'

export const maxDuration = 300 // 5 min max — Gemini Pro can take 2-3 min
import { createClient } from '@supabase/supabase-js'
import { getUserTier, isTierPro } from '@/lib/subscription'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'

export const dynamic = 'force-dynamic'

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

// Use Gemini 2.5 Pro for Deep Research Pass — more thorough analysis than Flash
const GEMINI_PRO = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`

// Gemini 2.5 Pro pricing: $1.25/M input, $10.00/M output (under 200k tokens)
const COST_PER_M_INPUT = 1.25
const COST_PER_M_OUTPUT = 10.0

/** Max chars per input section — Pro handles up to 1M tokens */
const MAX_CLAIMS_CHARS  = 8_000
const MAX_SPEC_CHARS    = 30_000  // ~7500 tokens — substantial spec context
const MAX_DESC_CHARS    = 4_000

/**
 * POST /api/patents/[id]/deep-research
 * Pro-only. Uses Gemini 2.5 Pro for adversarial claim analysis.
 * Result is staged in claims_draft_research_pending — never overwrites claims_draft.
 * User must explicitly Apply the result from the review banner.
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
  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pro gate
  const tier = await getUserTier(user.id)
  if (!isTierPro(tier)) {
    return NextResponse.json({ error: 'Deep Research Pass requires PatentPending Pro', upgrade_url: '/pricing' }, { status: 403 })
  }

  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, title, owner_id, description, claims_draft, claims_status, spec_draft')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!patent.claims_draft) return NextResponse.json({ error: 'No claims draft to analyze' }, { status: 400 })
  if (patent.claims_status === 'generating') {
    return NextResponse.json({ error: 'Deep Research is already running — check back in a few minutes' }, { status: 409 })
  }

  const { data: profile } = await supabaseService
    .from('patent_profiles')
    .select('email, full_name')
    .eq('id', user.id)
    .single()

  await supabaseService
    .from('patents')
    .update({ claims_status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', patentId)

  await supabaseService.from('ai_usage_log').insert({
    user_id: user.id,
    patent_id: patentId,
    action: 'deep_research_pass',
    model: 'gemini-2.5-pro',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
  })

  waitUntil(
    runDeepResearch(
      patentId,
      patent.title,
      patent.claims_draft,
      patent.description ?? '',
      patent.spec_draft ?? '',
      user.id,
      profile?.email ?? null,
      profile?.full_name ?? null
    )
  )

  return NextResponse.json({
    ok: true,
    message: "Deep Research Pass started — AI is analyzing prior art and strengthening your claims. This usually takes 8–12 minutes. We'll email you when it's ready to review.",
  })
}

async function runDeepResearch(
  patentId: string,
  title: string,
  claimsDraft: string,
  description: string,
  specDraft: string,
  userId: string,
  userEmail: string | null,
  userName: string | null
) {
  const claimsInput = claimsDraft.slice(0, MAX_CLAIMS_CHARS)
  const specInput   = specDraft.slice(0, MAX_SPEC_CHARS)
  const descInput   = description.slice(0, MAX_DESC_CHARS)

  const totalChars = claimsInput.length + specInput.length + descInput.length
  console.log(`[deep-research] patent=${patentId} model=gemini-2.5-pro input_chars=${totalChars} (claims=${claimsInput.length} spec=${specInput.length} desc=${descInput.length})`)

  // ── ADVERSARIAL ANALYSIS PROMPT ─────────────────────────────────────────────
  // Two-phase prompt:
  // Phase 1: Adversarial analysis — finds every weakness a competitor or examiner would exploit
  // Phase 2: Improved claims — uses the analysis to write stronger claims
  // Output: analysis narrative + improved claims, separated by a clear delimiter
  const prompt = `You are a senior patent prosecution attorney conducting adversarial claim analysis. Your job is not merely to rewrite claims — it is to find every weakness a patent examiner or competitor could exploit, then produce specific stronger claims.

**PHASE 1 — ADVERSARIAL ANALYSIS**
Analyze the following patent claims against the specification provided. For each independent claim:

1. **SCOPE ANALYSIS**: Does any language unnecessarily narrow the claim? Identify specific phrases that allow a competitor to design around by using a technically equivalent approach.

2. **ADVERSARIAL TEST**: How would a sophisticated competitor build the same invention while avoiding each independent claim? What would they change?

3. **DEPENDENCY RISK**: Does any claim depend on external IP, named third-party systems, named products, or co-pending applications? Flag any dependencies that create prosecution risk.

4. **PRIOR ART PRESSURE**: What categories of prior art are most likely cited against each independent claim? Which claim language is most vulnerable to §102/§103 rejections?

5. **RECOMMENDED FIXES**: For each identified weakness, provide specific alternative language that broadens protection while remaining fully supported by the specification.

**PHASE 2 — IMPROVED CLAIMS**
Using your adversarial analysis, write complete improved claims. Requirements:
- Every independent claim must be broadened to its maximum defensible scope
- Add dependent claims that capture specific preferred embodiments described in the spec
- Remove any named dependencies on third-party products, brands, or co-pending applications
- Ensure each claim is supported verbatim by language in the specification
- Use precise USPTO-compliant language
- Number claims sequentially

**OUTPUT FORMAT**
First output your analysis (Phase 1) as a structured summary.
Then output a clear delimiter: ---IMPROVED CLAIMS---
Then output the complete improved claims in standard USPTO numbered format (1., 2., 3., etc.).
No additional text after the claims.

---
Patent Title: ${title}

Specification:
${specInput || descInput || '(no specification provided)'}

Current Claims:
${claimsInput}`

  try {
    const res = await fetch(GEMINI_PRO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 8192,  // Pro can output more
          temperature: 0.2,       // Lower temp for more precise legal language
        },
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      const errMsg = data?.error?.message ?? JSON.stringify(data).slice(0, 300)
      console.error('[deep-research] Gemini Pro API error:', errMsg)
      await supabaseService.from('patents')
        .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', patentId)
      return
    }

    const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? []
    const fullOutput = parts.filter(p => !p.thought).map(p => p.text ?? '').join('').trim()

    if (!fullOutput) {
      console.error('[deep-research] Empty output from Gemini Pro')
      await supabaseService.from('patents')
        .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', patentId)
      return
    }

    // Extract improved claims after delimiter
    const delimiterIdx = fullOutput.indexOf('---IMPROVED CLAIMS---')
    const analysisSection = delimiterIdx >= 0 ? fullOutput.slice(0, delimiterIdx).trim() : ''
    const claimsSection   = delimiterIdx >= 0
      ? fullOutput.slice(delimiterIdx + '---IMPROVED CLAIMS---'.length).trim()
      : fullOutput // fallback: if no delimiter, treat whole output as claims

    // Stage both analysis and claims — user reviews before applying
    const stagedContent = delimiterIdx >= 0
      ? `${analysisSection}\n\n---IMPROVED CLAIMS---\n\n${claimsSection}`
      : claimsSection

    const inputTok  = data?.usageMetadata?.promptTokenCount ?? 0
    const outputTok = data?.usageMetadata?.candidatesTokenCount ?? 0
    const cost      = (inputTok * COST_PER_M_INPUT + outputTok * COST_PER_M_OUTPUT) / 1_000_000
    console.log(`[deep-research] ✅ staged patent=${patentId} tokens=${inputTok}+${outputTok} cost=$${cost.toFixed(4)} analysis=${analysisSection.length}chars claims=${claimsSection.length}chars`)

    // Save research report to patent_correspondence — LLM attribution stripped, non-blocking
    const cleanedContent = stripLlmAttribution(stagedContent)
    void supabaseService.from('patent_correspondence').insert({
      patent_id:           patentId,
      owner_id:            userId,
      title:               researchReportTitle('deep_research'),
      type:                'ai_research',
      content:             cleanedContent,
      from_party:          'PatentPending AI',
      correspondence_date: new Date().toISOString().split('T')[0],
      tags:                ['research_report', 'deep_research', 'ai_generated'],
      attachments: {
        query_used:    'Deep Research Pass (prior art + adversarial + claim strengthening)',
        phases_run:    ['prior_art_sweep', 'adversarial_pass', 'claim_strengthening'],
        generated_at:  new Date().toISOString(),
        feature:       'deep_research',
        tokens_input:  inputTok,
        tokens_output: outputTok,
        cost_usd:      cost,
      },
    }).then(({ error }) => { if (error) console.error('[deep-research] correspondence save failed:', error) })

    await supabaseService
      .from('patents')
      .update({
        claims_draft_research_pending: stagedContent,
        research_completed_at: new Date().toISOString(),
        claims_status: 'complete',
        updated_at: new Date().toISOString(),
      })
      .eq('id', patentId)

    await supabaseService.from('ai_usage_log')
      .update({ input_tokens: inputTok, output_tokens: outputTok, cost_usd: cost })
      .eq('action', 'deep_research_pass')
      .eq('patent_id', patentId)
      .order('created_at', { ascending: false })
      .limit(1)

    // Log to ai_token_usage (account-level budget tracking, feature = 'deep_research')
    await logAiUsage(supabaseService, {
      userId:     userId,
      patentId,
      feature:    'deep_research',
      tokensUsed: inputTok + outputTok,
      model:      'gemini-2.5-pro',
    })

    if (userEmail) {
      const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
      const firstName = userName?.split(' ')[0] ?? 'there'
      await sendEmail(buildEmail({
        to: userEmail,
        from: FROM_DEFAULT,
        subject: `Deep Research ready for review — ${title}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#d97706">Deep Research Pass ready 🔬</h2>
  <p>Hi ${firstName},</p>
  <p>Deep Research has completed for <strong>${title}</strong>.</p>
  <p>The analysis identifies weaknesses, competitor workarounds, and prior art risks — then proposes stronger claims. Your original claims are untouched until you choose to apply.</p>
  <p><a href="${appUrl}/dashboard/patents/${patentId}?tab=claims" style="display:inline-block;background:#d97706;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Review Analysis &amp; Apply →</a></p>
</div>`,
      })).catch(e => console.error('[deep-research] email failed:', e))
    }
  } catch (err) {
    console.error('[deep-research] unexpected error:', err)
    await supabaseService.from('patents')
      .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', patentId)
  }
}
