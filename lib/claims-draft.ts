// Claims Draft — Gemini-powered async job
// Model: gemini-2.5-pro (legally critical, highest available stable model)
// Fallback: gemini-2.0-flash if 2.5-pro unavailable
// Called by webhook handler after payment confirmed — non-blocking

import { createClient } from '@supabase/supabase-js'

const CLAIMS_MODEL = 'gemini-2.5-pro'
const CLARIFY_MODEL = 'gemini-2.0-flash' // lower stakes

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface IntakeData {
  invention_name?: string | null
  problem_solved?: string | null
  how_it_works?: string | null
  what_makes_it_new?: string | null
  inventor_name?: string | null
  co_inventors?: string[]
  micro_entity_eligible?: boolean | null
}

async function callGemini(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, // Low temperature for legal drafting — consistent output
        maxOutputTokens: 8192,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    // Fallback to flash if pro unavailable
    if (model === CLAIMS_MODEL && res.status === 404) {
      console.warn(`${model} unavailable, falling back to gemini-2.0-flash`)
      return callGemini('gemini-2.0-flash', prompt)
    }
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export async function generateClaimsDraft(
  patentId: string,
  intake: IntakeData
): Promise<void> {
  const prompt = `You are a USPTO patent claims drafter. Based on the inventor's intake description below, generate a structured first-draft set of patent claims.

INVENTION NAME: ${intake.invention_name || 'Unknown'}

PROBLEM SOLVED:
${intake.problem_solved || 'Not provided'}

HOW IT WORKS:
${intake.how_it_works || 'Not provided'}

WHAT MAKES IT NEW:
${intake.what_makes_it_new || 'Not provided'}

INVENTOR: ${[intake.inventor_name, ...(intake.co_inventors || [])].filter(Boolean).join(', ') || 'Not provided'}

---

Generate the following in USPTO format:

1. INDEPENDENT CLAIMS (3–5 claims):
   - Claim 1: System/apparatus claim — broadest scope
   - Claim 2: Method claim — key process steps
   - Claim 3: Computer-readable medium or additional system claim
   - Additional independent claims if warranted

2. DEPENDENT CLAIMS (8–12 claims):
   - Narrow each independent claim with specific features
   - Cover alternative embodiments mentioned in the description
   - Each dependent claim must explicitly reference its parent claim

FORMAT RULES:
- Number claims consecutively (1, 2, 3...)
- Each claim is a single sentence ending with a period
- Independent claims begin with "A system/method/apparatus comprising:"
- Dependent claims begin with "The [system/method] of claim N, wherein:"
- Use functional language — describe WHAT it does, not HOW it's implemented
- Avoid brand names, specific companies, or non-generic terms

IMPORTANT: This is a first draft for attorney review. Flag any areas where the intake description is ambiguous or where broader or narrower claim language may be strategically important.

Output the claims in plain text, numbered, followed by a brief DRAFTING NOTES section with any flags or recommendations.`

  try {
    const draft = await callGemini(CLAIMS_MODEL, prompt)

    await supabase
      .from('patents')
      .update({
        claims_draft: draft,
        filing_status: 'draft',
        updated_at: new Date().toISOString(),
      })
      .eq('id', patentId)

    console.log(`Claims draft complete for patent ${patentId}`)
  } catch (err) {
    console.error(`Claims draft failed for patent ${patentId}:`, err)
    // Don't rethrow — job is fire-and-forget
    // Mark with a placeholder so the user knows it failed
    await supabase
      .from('patents')
      .update({
        claims_draft: `[Claims draft generation failed. BoClaw will retry. Error: ${err instanceof Error ? err.message : String(err)}]`,
        filing_status: 'draft',
        updated_at: new Date().toISOString(),
      })
      .eq('id', patentId)
  }
}

// Export model string for reference in /claude briefings
export const CLAIMS_DRAFT_MODEL = CLAIMS_MODEL
export const CLARIFY_DRAFT_MODEL = CLARIFY_MODEL
