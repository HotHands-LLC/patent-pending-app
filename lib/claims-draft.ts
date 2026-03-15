// Claims Draft Generator — uses Gemini 2.5 Pro (legally critical)

// Called async from webhook handler after payment confirmed

const GEMINI_MODEL = 'gemini-2.5-pro' // confirmed available 2026-03-05
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

interface IntakeSession {
  id: string
  invention_name: string | null
  problem_solved: string | null
  how_it_works: string | null
  what_makes_it_new: string | null
  inventor_name: string | null
  co_inventors: string[]
  micro_entity_eligible: boolean | null
}

export async function generateClaimsDraft(
  patentId: string,
  intake: IntakeSession
): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )

  const prompt = buildClaimsPrompt(intake)

  const res = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,      // low temp for legally critical output
        maxOutputTokens: 8192,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const claimsDraft = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  if (!claimsDraft) {
    throw new Error('Gemini returned empty claims draft')
  }

  // Write to patents table
  await supabase
    .from('patents')
    .update({
      claims_draft: claimsDraft,
      filing_status: 'draft',
      updated_at: new Date().toISOString(),
    })
    .eq('id', patentId)
}

function buildClaimsPrompt(intake: IntakeSession): string {
  const inventors = [intake.inventor_name, ...(intake.co_inventors ?? [])]
    .filter(Boolean).join(', ') || 'Unknown'

  return `You are a USPTO patent claims drafting assistant. Draft a structured set of patent claims for the following invention. Output ONLY the claims — no preamble, no commentary, no markdown headers. Use standard USPTO claim numbering and formatting.

INVENTION: ${intake.invention_name ?? 'Untitled'}
INVENTOR(S): ${inventors}

PROBLEM SOLVED:
${intake.problem_solved ?? 'Not provided'}

HOW IT WORKS:
${intake.how_it_works ?? 'Not provided'}

WHAT MAKES IT NEW:
${intake.what_makes_it_new ?? 'Not provided'}

INSTRUCTIONS:
- Draft 3 independent claims (system, method, and computer-readable medium or apparatus)
- Draft 8-12 dependent claims that narrow each independent claim
- Each claim must be a single sentence ending with a period
- Independent claims must be broad — capture the core inventive concept
- Dependent claims must reference their parent with "The [system/method/apparatus] of claim X, wherein..."
- Do not include limitations not supported by the description above
- Avoid functional claiming in independent claims — use structural language
- Number claims sequentially starting from 1

Begin claims now:`
}
