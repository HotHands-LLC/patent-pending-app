// lib/claims-score.ts
// Generates a Filing Readiness Score for a patent's claims draft via Gemini.
// Called async after claims_status becomes 'complete'.
// Stores result in patents.claims_score (jsonb).

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

export interface ClaimsScore {
  independent_claims_count: number
  dependent_claims_count: number
  novelty_score: number           // 1–10
  novelty_rationale: string
  provisional_ready: boolean
  provisional_rationale: string
  top_strength: string
  top_gap: string | null
}

// Helper: extract non-thinking text (gemini-2.5 thinking models emit thought:true parts)
function geminiText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
}): string {
  return (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text ?? '')
    .join('')
}

export async function scoreClaimsDraft(
  patentId: string,
  claimsDraft: string
): Promise<ClaimsScore | null> {
  const prompt = `Analyze these patent claims and return ONLY valid JSON — no markdown, no explanation.

{
  "independent_claims_count": number,
  "dependent_claims_count": number,
  "novelty_score": number (1-10),
  "novelty_rationale": "one sentence explaining the score",
  "provisional_ready": boolean,
  "provisional_rationale": "one sentence",
  "top_strength": "one sentence describing the strongest aspect of these claims",
  "top_gap": "one sentence describing the biggest gap or weakness, or null if none"
}

CLAIMS:
${claimsDraft.slice(0, 12000)}`

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!res.ok) {
      console.error(`[claims-score] Gemini error for patent ${patentId}: ${res.status}`)
      return null
    }

    const data = await res.json()
    const raw = geminiText(data) || '{}'
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned) as ClaimsScore

    // Sanity-check required fields
    if (typeof parsed.independent_claims_count !== 'number') {
      throw new Error('Missing independent_claims_count')
    }

    console.log(`[claims-score] ✅ scored patent ${patentId} — novelty: ${parsed.novelty_score}/10, ready: ${parsed.provisional_ready}`)
    return parsed
  } catch (err) {
    console.error(`[claims-score] ❌ failed for patent ${patentId}:`, err)
    return null
  }
}
