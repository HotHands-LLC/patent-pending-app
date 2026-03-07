import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'

export const maxDuration = 300 // 5 min — required for Gemini async completion
import { createClient } from '@supabase/supabase-js'
import { getUserTier, isTierPro } from '@/lib/subscription'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'

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

/** Max chars to send to Gemini — ~100k tokens is safe for Flash */
const MAX_INPUT_CHARS = 60_000

/**
 * POST /api/patents/[id]/deep-research
 * Pro-only. Runs extended Gemini prior art analysis and strengthens claims.
 * Uses waitUntil() to safely run Gemini after returning 202 — avoids
 * Vercel serverless terminating the background work.
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
    .select('id, title, owner_id, description, claims_draft, claims_status')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!patent.claims_draft) return NextResponse.json({ error: 'No claims draft to refine' }, { status: 400 })
  if (patent.claims_status === 'generating') {
    return NextResponse.json({ error: 'Deep Research is already running — check back in a few minutes' }, { status: 409 })
  }

  // Get user email for completion notification
  const { data: profile } = await supabaseService
    .from('patent_profiles')
    .select('email, full_name')
    .eq('id', user.id)
    .single()

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

  // waitUntil keeps the Vercel function alive until the promise resolves,
  // even after the HTTP response is sent — this is the correct pattern.
  waitUntil(
    runDeepResearch(
      patentId,
      patent.title,
      patent.claims_draft,
      patent.description ?? '',
      user.id,
      profile?.email ?? null,
      profile?.full_name ?? null
    )
  )

  return NextResponse.json({
    ok: true,
    message: 'Deep Research Pass started — this usually takes 8-12 minutes. We\'ll email you when it\'s ready.',
  })
}

async function runDeepResearch(
  patentId: string,
  title: string,
  claimsDraft: string,
  description: string,
  userId: string,
  userEmail: string | null,
  userName: string | null
) {
  // Input size guard — truncate if over limit
  const claimsInput = claimsDraft.slice(0, 6_000)
  const descInput = description.slice(0, 4_000)
  const totalChars = claimsInput.length + descInput.length + 1_000 // prompt overhead

  console.log(`[deep-research] patent=${patentId} input_chars=${totalChars} (claims=${claimsInput.length} desc=${descInput.length})`)

  if (totalChars > MAX_INPUT_CHARS) {
    console.warn(`[deep-research] Input ${totalChars} chars exceeds ${MAX_INPUT_CHARS} limit — truncating`)
  }

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
Description: ${descInput}

Current Claims:
${claimsInput}`

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

    if (!res.ok) {
      console.error('[deep-research] Gemini API error:', data?.error?.message ?? JSON.stringify(data).slice(0, 200))
      await supabaseService.from('patents')
        .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', patentId)
      return
    }

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

      // Update usage log
      const inputTok = data?.usageMetadata?.promptTokenCount ?? 0
      const outputTok = data?.usageMetadata?.candidatesTokenCount ?? 0
      const cost = inputTok * 1.25 / 1_000_000 + outputTok * 10.0 / 1_000_000
      console.log(`[deep-research] ✅ complete patent=${patentId} tokens=${inputTok}+${outputTok} cost=$${cost.toFixed(4)}`)

      await supabaseService.from('ai_usage_log')
        .update({ input_tokens: inputTok, output_tokens: outputTok, cost_usd: cost })
        .eq('action', 'deep_research_pass')
        .eq('patent_id', patentId)
        .order('created_at', { ascending: false })
        .limit(1)

      // Email notification
      if (userEmail) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
        const firstName = userName?.split(' ')[0] ?? 'there'
        await sendEmail(buildEmail({
          to: userEmail,
          from: FROM_DEFAULT,
          subject: `Deep Research complete — ${title}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#d97706">Deep Research Pass complete 🔬</h2>
  <p>Hi ${firstName},</p>
  <p>Gemini has finished the Deep Research Pass on <strong>${title}</strong>.</p>
  <p>Your claims have been strengthened based on prior art analysis. Review the updated claims and compare with your original draft.</p>
  <p><a href="${appUrl}/dashboard/patents/${patentId}?tab=claims" style="display:inline-block;background:#d97706;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Updated Claims →</a></p>
</div>`,
        })).catch(e => console.error('[deep-research] email failed:', e))
      }
    } else {
      console.error('[deep-research] Empty output from Gemini')
      await supabaseService.from('patents')
        .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', patentId)
    }
  } catch (err) {
    console.error('[deep-research] error:', err)
    await supabaseService.from('patents')
      .update({ claims_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', patentId)
  }
}
