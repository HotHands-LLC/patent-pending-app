/**
 * lib/claim-scorer.ts
 * P35 — Claim Strength Scorer
 *
 * Scores each claim in a patent's claims_draft for breadth, specificity,
 * and vulnerability (prior art risk) using Gemini Flash in a single batch call.
 */

const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

export interface ClaimScore {
  claimNumber: number
  claimText: string
  breadthScore: number        // 1–5: 5 = very broad
  specificityScore: number    // 1–5: 5 = highly specific / well-defined
  vulnerabilityScore: number  // 1–5: 5 = low prior art risk
  compositeScore: number      // (breadth*0.3)+(specificity*0.4)+(vulnerability*0.3)
  flags: string[]
  suggestion: string
}

export interface ClaimScorerResult {
  scores: ClaimScore[]
  scoredAt: string
  model: string
  error?: string
}

// Helper: extract non-thinking text from Gemini response
function geminiText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
}): string {
  return (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text ?? '')
    .join('')
}

/**
 * Parse claims_draft into individual claims.
 * Handles numbered claims like "1. A method..." or "1.\nA method..."
 */
export function parseClaims(claimsDraft: string): Array<{ number: number; text: string }> {
  const raw = claimsDraft.trim()
  // Split on claim boundaries: start of line followed by number + period
  const parts = raw.split(/(?=^\d+\.\s)/m).filter(s => s.trim())
  const claims: Array<{ number: number; text: string }> = []

  for (const part of parts) {
    const match = part.match(/^(\d+)\.\s+([\s\S]+)/)
    if (match) {
      claims.push({
        number: parseInt(match[1], 10),
        text: match[0].trim(),
      })
    }
  }

  // Fallback: if no numbered claims found, treat entire text as claim 1
  if (claims.length === 0 && raw.length > 0) {
    claims.push({ number: 1, text: raw })
  }

  return claims
}

/**
 * Score all claims in a batch using Gemini Flash.
 * Returns partial scores on error (best-effort).
 */
export async function scoreClaimsBatch(
  patentId: string,
  claimsDraft: string
): Promise<ClaimScorerResult> {
  const claims = parseClaims(claimsDraft)
  const scoredAt = new Date().toISOString()

  if (claims.length === 0) {
    return { scores: [], scoredAt, model: GEMINI_MODEL, error: 'No claims found' }
  }

  const claimsJson = JSON.stringify(
    claims.map(c => ({ claimNumber: c.number, claimText: c.text }))
  )

  const prompt = `You are a USPTO patent claim analyst. Score each patent claim below on three dimensions.

Return ONLY valid JSON — no markdown, no explanation, no preamble.

Response format:
{
  "scores": [
    {
      "claimNumber": <number>,
      "claimText": "<first 80 chars of claim>",
      "breadthScore": <1-5>,
      "specificityScore": <1-5>,
      "vulnerabilityScore": <1-5>,
      "flags": ["<flag1>", "<flag2>"],
      "suggestion": "<one concrete improvement>"
    }
  ]
}

SCORING GUIDE:
- breadthScore (1-5): 5=very broad/functional claiming, 1=extremely narrow/limiting
- specificityScore (1-5): 5=crystal-clear claim boundaries, 1=vague/indefinite language
- vulnerabilityScore (1-5): 5=highly novel/low prior art risk, 1=almost certainly anticipated

FLAG EXAMPLES (include relevant ones):
- "functional claiming" — independent claim defines by function not structure
- "means-plus-function" — uses "means for" without structure
- "indefinite language" — "substantially", "approximately" without antecedent
- "single embodiment" — claim reads on only one narrow implementation  
- "no antecedent basis" — reference to undefined element
- "crowded field" — technology area with dense prior art
- "dependent claim too narrow" — adds non-patentable details only
- "missing preamble" — no transition phrase (comprising/consisting)

CLAIMS TO SCORE:
${claimsJson.slice(0, 20000)}`

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[claim-scorer] Gemini error for patent ${patentId}: ${res.status} ${errText}`)
      return {
        scores: fallbackScores(claims),
        scoredAt,
        model: GEMINI_MODEL,
        error: `Gemini API error: ${res.status}`,
      }
    }

    const data = await res.json()
    const raw = geminiText(data) || '{}'
    const cleaned = raw
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    const parsed = JSON.parse(cleaned) as { scores: Array<Partial<ClaimScore>> }

    if (!Array.isArray(parsed.scores)) {
      throw new Error('Response missing scores array')
    }

    // Normalize and compute composite scores
    const scores: ClaimScore[] = parsed.scores.map((s) => {
      const breadth = clamp(Number(s.breadthScore) || 3, 1, 5)
      const specificity = clamp(Number(s.specificityScore) || 3, 1, 5)
      const vulnerability = clamp(Number(s.vulnerabilityScore) || 3, 1, 5)
      const composite = Math.round(
        (breadth * 0.3 + specificity * 0.4 + vulnerability * 0.3) * 100
      ) / 100

      // Find original claim text if Gemini truncated it
      const originalClaim = claims.find(c => c.number === s.claimNumber)

      return {
        claimNumber: s.claimNumber ?? 0,
        claimText: originalClaim?.text ?? s.claimText ?? '',
        breadthScore: breadth,
        specificityScore: specificity,
        vulnerabilityScore: vulnerability,
        compositeScore: composite,
        flags: Array.isArray(s.flags) ? s.flags : [],
        suggestion: s.suggestion ?? 'Review and strengthen claim language.',
      }
    })

    console.log(
      `[claim-scorer] ✅ scored ${scores.length} claims for patent ${patentId}`,
      `avg composite: ${(scores.reduce((a, s) => a + s.compositeScore, 0) / scores.length).toFixed(2)}`
    )

    return { scores, scoredAt, model: GEMINI_MODEL }
  } catch (err) {
    console.error(`[claim-scorer] ❌ failed for patent ${patentId}:`, err)
    return {
      scores: fallbackScores(claims),
      scoredAt,
      model: GEMINI_MODEL,
      error: String(err),
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Return neutral placeholder scores when Gemini fails */
function fallbackScores(claims: Array<{ number: number; text: string }>): ClaimScore[] {
  return claims.map(c => ({
    claimNumber: c.number,
    claimText: c.text,
    breadthScore: 3,
    specificityScore: 3,
    vulnerabilityScore: 3,
    compositeScore: 3,
    flags: [],
    suggestion: 'Scoring unavailable — retry using the Re-analyze button.',
  }))
}

/** Compute summary stats across all claim scores */
export function computeClaimSummary(scores: ClaimScore[]) {
  if (scores.length === 0) return null

  const avg = scores.reduce((a, s) => a + s.compositeScore, 0) / scores.length
  const strongest = scores.reduce((a, b) => (b.compositeScore > a.compositeScore ? b : a))
  const weakest = scores.reduce((a, b) => (b.compositeScore < a.compositeScore ? b : a))

  return {
    averageScore: Math.round(avg * 100) / 100,
    strongestClaim: strongest,
    weakestClaim: weakest,
    totalFlags: scores.reduce((a, s) => a + s.flags.length, 0),
    claimCount: scores.length,
  }
}
