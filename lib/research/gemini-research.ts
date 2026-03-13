/**
 * lib/research/gemini-research.ts
 *
 * Two-phase Gemini 2.5 Pro research loop for patent candidate discovery.
 *
 * Phase 1 — Broad sweep: find 5-8 abandoned/lapsed candidates
 * Phase 2 — Adversarial novelty pass: add risk flags + final recommendations
 *
 * Updates research_runs row in Supabase throughout.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GEMINI_PRO_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`

// ── Cost constants (Gemini 2.5 Pro, <200k tokens) ───────────────────────────
const COST_PER_M_INPUT  = 1.25
const COST_PER_M_OUTPUT = 10.00

export interface PatentCandidate {
  patent_number:           string
  title:                   string
  filing_date:             string | null
  assignee:                string | null
  abandonment_reason:      string | null
  forward_citation_count:  number | null
  technology_relevance:    number   // 1–10
  acquisition_interest:    number   // 1–10
  rationale:               string
  // Added by Phase 2
  risk_flags:              string[]
  final_recommendation:    'worth acquiring' | 'investigate further' | 'noise'
}

// ── Gemini helper ────────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_PRO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) throw new Error('Gemini returned empty response')

  // Log approximate cost
  const usage = data?.usageMetadata ?? {}
  const inputTokens  = usage.promptTokenCount ?? 0
  const outputTokens = usage.candidatesTokenCount ?? 0
  const cost = (inputTokens * COST_PER_M_INPUT + outputTokens * COST_PER_M_OUTPUT) / 1_000_000
  console.log(`[gemini-research] tokens: ${inputTokens}in/${outputTokens}out — $${cost.toFixed(4)}`)

  return text
}

// ── JSON extractor — handles markdown fences ─────────────────────────────────
function extractJSON(text: string): unknown {
  // Try direct parse
  try { return JSON.parse(text.trim()) } catch { /* fall through */ }
  // Strip markdown fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()) } catch { /* fall through */ }
  }
  // Find first [...] or {...} block
  const arrMatch = text.match(/(\[[\s\S]+\])/)
  if (arrMatch) {
    try { return JSON.parse(arrMatch[1]) } catch { /* fall through */ }
  }
  throw new Error('Could not extract JSON from Gemini response')
}

// ── Phase 1 prompt ───────────────────────────────────────────────────────────
function phase1Prompt(query: string, runType: string): string {
  const context = runType === 'patent_number'
    ? `The query "${query}" is a patent number. Research this specific patent and 4-6 related patents in the same technology family that are abandoned or lapsed.`
    : runType === 'category'
    ? `The query "${query}" is a technology category. Research the patent landscape in this category.`
    : `The query "${query}" is a keyword search across patent titles and abstracts.`

  return `You are a patent research analyst specializing in finding undervalued and abandoned patents worth acquiring.

${context}

Identify 5-8 patent candidates from USPTO public records that are:
- Abandoned or lapsed (expired due to failure to pay maintenance fees, or explicitly abandoned)
- Filed before 2020 (mature technology, meaningful forward citation history available)
- In the technology space implied by the query
- Potentially undervalued relative to their forward citation count or market relevance

For each candidate, return a JSON array with this exact structure (no extra keys):
[
  {
    "patent_number": "US7654321B2",
    "title": "Full patent title",
    "filing_date": "2012-03-15",
    "assignee": "Original Assignee Corp",
    "abandonment_reason": "Maintenance fee not paid after 3.5 year window" or null,
    "forward_citation_count": 42,
    "technology_relevance": 8,
    "acquisition_interest": 7,
    "rationale": "One-sentence explanation of why this is worth acquiring."
  }
]

IMPORTANT: Return ONLY the JSON array. No preamble, no markdown, no explanation outside the JSON.
Use real patent numbers where possible. If you are uncertain, note it in the rationale.
technology_relevance and acquisition_interest are integers 1–10.`
}

// ── Phase 2 prompt ───────────────────────────────────────────────────────────
function phase2Prompt(candidates: PatentCandidate[]): string {
  const candidateList = candidates
    .map((c, i) => `${i + 1}. ${c.patent_number}: "${c.title}" (${c.assignee ?? 'unknown assignee'})`)
    .join('\n')

  return `You are an adversarial patent analyst. Review these patent acquisition candidates and identify risks.

Candidates:
${candidateList}

For each candidate, add risk analysis. Return a JSON array with the SAME order as above:
[
  {
    "patent_number": "US7654321B2",
    "risk_flags": [
      "Technology now commoditized — smartphones standardized this approach",
      "IBM (original assignee) is litigious — potential assertion risk even post-sale",
      "FRAND risk: incorporated into 802.11 standard"
    ],
    "final_recommendation": "worth acquiring" | "investigate further" | "noise"
  }
]

Criteria for final_recommendation:
- "worth acquiring": Low risk, undervalued, clear acquisition path, no blocking IP
- "investigate further": Interesting but needs prior art search or legal review before committing
- "noise": Commoditized, risky, or not relevant enough to pursue

IMPORTANT: Return ONLY the JSON array matching the candidate order above. Be adversarial — find real risks.`
}

// ── Summary prompt ───────────────────────────────────────────────────────────
function summaryPrompt(query: string, candidates: PatentCandidate[]): string {
  const worthAcquiring = candidates.filter(c => c.final_recommendation === 'worth acquiring')
  const investigate    = candidates.filter(c => c.final_recommendation === 'investigate further')

  return `You are a patent portfolio analyst. Write a 3-5 sentence executive summary of this patent research run.

Query: "${query}"
Total candidates analyzed: ${candidates.length}
Worth acquiring: ${worthAcquiring.length} (${worthAcquiring.map(c => c.patent_number).join(', ') || 'none'})
Investigate further: ${investigate.length}

Top picks:
${worthAcquiring.slice(0, 3).map(c => `- ${c.patent_number}: ${c.title} — ${c.rationale}`).join('\n') || '(none flagged as worth acquiring)'}

Write a concise, opinionated summary. Mention specific patents by number. Note the overall quality of this technology space for acquisition. Keep it under 150 words.`
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function runGeminiResearch(
  runId: string,
  query: string,
  runType: string
): Promise<void> {
  const updateRun = (fields: Record<string, unknown>) =>
    supabaseService.from('research_runs').update(fields).eq('id', runId)

  try {
    // Mark running
    await updateRun({ status: 'running' })

    // ── Phase 1: Broad sweep ──────────────────────────────────────────────
    console.log(`[research:${runId}] Phase 1 start — query: "${query}"`)
    const phase1Text = await callGemini(phase1Prompt(query, runType))
    let candidates: PatentCandidate[]

    try {
      const raw = extractJSON(phase1Text) as PatentCandidate[]
      candidates = Array.isArray(raw) ? raw : []
      if (candidates.length === 0) throw new Error('Phase 1 returned empty array')
    } catch (e) {
      throw new Error(`Phase 1 JSON parse failed: ${e}. Raw: ${phase1Text.slice(0, 300)}`)
    }

    // Ensure required fields with defaults
    candidates = candidates.map(c => ({
      patent_number:          String(c.patent_number ?? ''),
      title:                  String(c.title ?? ''),
      filing_date:            c.filing_date ?? null,
      assignee:               c.assignee ?? null,
      abandonment_reason:     c.abandonment_reason ?? null,
      forward_citation_count: c.forward_citation_count ?? null,
      technology_relevance:   Number(c.technology_relevance ?? 5),
      acquisition_interest:   Number(c.acquisition_interest ?? 5),
      rationale:              String(c.rationale ?? ''),
      risk_flags:             [],
      final_recommendation:   'investigate further' as const,
    }))

    console.log(`[research:${runId}] Phase 1 complete — ${candidates.length} candidates`)

    // ── Phase 2: Adversarial novelty pass ─────────────────────────────────
    console.log(`[research:${runId}] Phase 2 start`)
    const phase2Text = await callGemini(phase2Prompt(candidates))
    let riskResults: Array<{
      patent_number: string
      risk_flags: string[]
      final_recommendation: PatentCandidate['final_recommendation']
    }>

    try {
      const raw = extractJSON(phase2Text) as typeof riskResults
      riskResults = Array.isArray(raw) ? raw : []
    } catch {
      // Phase 2 fail is non-fatal — keep Phase 1 results with default recommendations
      console.warn(`[research:${runId}] Phase 2 JSON parse failed — using defaults`)
      riskResults = []
    }

    // Merge Phase 2 into candidates by patent_number or array index
    candidates = candidates.map((c, i) => {
      const risk = riskResults.find(r => r.patent_number === c.patent_number) ?? riskResults[i]
      if (risk) {
        return {
          ...c,
          risk_flags:           Array.isArray(risk.risk_flags) ? risk.risk_flags : [],
          final_recommendation: risk.final_recommendation ?? c.final_recommendation,
        }
      }
      return c
    })

    const worthCount = candidates.filter(c => c.final_recommendation === 'worth acquiring').length
    console.log(`[research:${runId}] Phase 2 complete — ${worthCount} flagged "worth acquiring"`)

    // ── Summary ───────────────────────────────────────────────────────────
    let summary = ''
    try {
      summary = await callGemini(summaryPrompt(query, candidates))
      summary = summary.trim()
    } catch {
      summary = `Research complete. ${candidates.length} candidates analyzed; ${worthCount} flagged as "worth acquiring".`
    }

    // ── Finalize ──────────────────────────────────────────────────────────
    await updateRun({
      status:       'complete',
      candidates:   candidates,
      summary,
      completed_at: new Date().toISOString(),
    })

    console.log(`[research:${runId}] Complete ✅`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[research:${runId}] Failed: ${msg}`)
    await updateRun({
      status:       'failed',
      summary:      `Research run failed: ${msg}`,
      completed_at: new Date().toISOString(),
    })
  }
}
