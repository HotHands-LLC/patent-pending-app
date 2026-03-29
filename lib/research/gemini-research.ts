/**
 * lib/research/gemini-research.ts
 *
 * 3-phase Gemini 2.5 Pro research loop for patent candidate discovery.
 *
 * Phase 0 — CPC class lookup: Gemini identifies relevant CPC subclass codes,
 *            we query ODP API filtered by those codes (2000–2020), pass real
 *            patent records to Phase 1 instead of relying on Gemini memory.
 * Phase 1 — Broad sweep: rank & score CPC-filtered candidates (or fall back to
 *            Gemini knowledge if ODP returns too few results).
 * Phase 2 — Adversarial novelty pass: risk flags + final recommendations.
 *
 * Validation finding (2026-03-13): ODP keyword search returns 2.1M recency-sorted
 * results with no semantic ranking. CPC pre-filter cuts that to a meaningful pool.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GEMINI_PRO_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`

const USPTO_ODP_KEY = process.env.USPTO_ODP_API_KEY ?? ''
const ODP_SEARCH    = 'https://api.uspto.gov/api/v1/patent/applications/search'

// ── Cost constants (Gemini 2.5 Pro, <200k tokens) ───────────────────────────
const COST_PER_M_INPUT  = 1.25
const COST_PER_M_OUTPUT = 10.00

// ── Types ────────────────────────────────────────────────────────────────────
export interface CpcCode {
  cpc_code:        string  // e.g. "H04B10/11"
  description:     string
  relevance_reason: string
}

export interface OdpPatent {
  app_number:   string
  title:        string
  filing_date:  string | null
  status:       string
  assignee:     string | null
  cpc_codes:    string[]
  abstract:     string
}

export interface PatentCandidate {
  patent_number:           string
  title:                   string
  filing_date:             string | null
  assignee:                string | null
  cpc_codes:               string[]
  abandonment_reason:      string | null
  forward_citation_count:  number | null
  technology_relevance:    number   // 1–10
  acquisition_interest:    number   // 1–10
  rationale:               string
  // Phase 2 additions
  risk_flags:              string[]
  final_recommendation:    'worth acquiring' | 'investigate further' | 'noise'
  // Metadata
  source:                  'odp_filtered' | 'gemini_knowledge'
}

// ── Gemini helper ────────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_PRO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
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

  const usage = data?.usageMetadata ?? {}
  const cost  = (
    (usage.promptTokenCount ?? 0) * COST_PER_M_INPUT +
    (usage.candidatesTokenCount ?? 0) * COST_PER_M_OUTPUT
  ) / 1_000_000
  console.log(`[gemini-research] tokens in=${usage.promptTokenCount} out=${usage.candidatesTokenCount} — $${cost.toFixed(4)}`)

  return text
}

// ── JSON extractor — handles markdown fences ─────────────────────────────────
function extractJSON(text: string): unknown {
  try { return JSON.parse(text.trim()) } catch { /* fall through */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (fenced) { try { return JSON.parse(fenced[1].trim()) } catch { /* fall through */ } }
  const arrMatch = text.match(/(\[[\s\S]+\])/)
  if (arrMatch) { try { return JSON.parse(arrMatch[1]) } catch { /* fall through */ } }
  throw new Error('Could not extract JSON from Gemini response')
}

// ── Phase 0: CPC code lookup prompt ─────────────────────────────────────────
function phase0Prompt(query: string): string {
  return `You are a USPTO patent classification expert.

Given the technology query: "${query}"

Return the 2-4 most relevant CPC subclass codes that would contain patents in this technology space.
Be specific — subclass level (e.g. "H04B10/11"), not just class level (e.g. "H04B").
Prefer codes that capture the most specific aspect of the technology, not broad umbrella codes.

Return ONLY a JSON array with this exact structure:
[
  {
    "cpc_code": "H04B10/11",
    "description": "Optical transmission systems — point-to-point using free space",
    "relevance_reason": "Direct match for free-space optical communication systems"
  }
]

No preamble, no markdown, no explanation outside the JSON.`
}

// ── Phase 0: Query ODP API with CPC code ─────────────────────────────────────
async function fetchOdpByCpc(
  cpcCode: string,
  maxRows = 30,
): Promise<OdpPatent[]> {
  if (!USPTO_ODP_KEY) {
    console.warn('[phase0] USPTO_ODP_API_KEY not set — skipping ODP query')
    return []
  }

  // ODP field search: cpcInventiveFlattened supports prefix match with *
  // Strip trailing * if present, then append — ODP uses exact or prefix
  const code = cpcCode.replace(/\*+$/, '')
  const q    = `cpcInventiveFlattened:${code}`

  const params = new URLSearchParams({
    q,
    rows:                '30',
    // Date range filter: filed 2000–2020 (mature, citable history)
    'dateRangeField':    'filingDate',
    'dateRangeStart':    '2000-01-01',
    'dateRangeEnd':      '2020-12-31',
  })

  try {
    const res = await fetch(`${ODP_SEARCH}?${params}`, {
      headers: { 'X-API-KEY': USPTO_ODP_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn(`[phase0] ODP returned ${res.status} for CPC ${code}`)
      return []
    }
    const data = await res.json()
    const bag: unknown[] = data?.patentFileWrapperDataBag ?? []
    const results: OdpPatent[] = []

    for (const item of bag) {
      const p    = item as Record<string, unknown>
      const meta = (p.applicationMetaData ?? {}) as Record<string, unknown>

      // Title
      const title = String(meta.inventionTitle ?? '')
      if (!title) continue

      // App number
      const appNum = String(p.applicationNumberText ?? '')

      // Filing date
      const filing = String(meta.filingDate ?? meta.effectiveFilingDate ?? '').split('T')[0] || null

      // Status — filter to abandoned/lapsed only
      const status = String(meta.applicationStatusDescriptionText ?? '').toLowerCase()

      // Assignee
      const applicants = (meta.applicantBag as Record<string, unknown>)?.applicant
      const assigneeRaw = Array.isArray(applicants)
        ? (applicants[0] as Record<string, unknown>)?.organizationNameText
        : (applicants as Record<string, unknown>)?.organizationNameText
      const assignee = assigneeRaw ? String(assigneeRaw) : null

      // CPC codes
      const cpcBag = meta.cpcClassificationBag as Record<string, unknown> | null
      const cpcArr = cpcBag?.cpcClassification
      const cpcCodes: string[] = []
      if (Array.isArray(cpcArr)) {
        for (const c of cpcArr) {
          const sym = (c as Record<string, unknown>)?.cpcClassificationText ?? (c as Record<string, unknown>)?.cpcSymbol
          if (sym) cpcCodes.push(String(sym).slice(0, 12))
        }
      }

      // Abstract — from eventDataBag
      let abstract = ''
      const events = p.eventDataBag as unknown[]
      if (Array.isArray(events)) {
        for (const ev of events) {
          if ((ev as Record<string, unknown>)?.abstractText) {
            abstract = String((ev as Record<string, unknown>).abstractText).slice(0, 300)
            break
          }
        }
      }

      results.push({ app_number: appNum, title, filing_date: filing, status, assignee, cpc_codes: cpcCodes, abstract })
    }

    console.log(`[phase0] CPC ${code} → ${results.length} patents from ODP (of ${bag.length} returned)`)
    return results

  } catch (err) {
    console.warn(`[phase0] ODP fetch failed for CPC ${code}:`, err)
    return []
  }
}

// ── Phase 1 prompt — CPC-grounded (real ODP data) ───────────────────────────
function phase1GroundedPrompt(query: string, cpcCodes: CpcCode[], odp: OdpPatent[]): string {
  const cpcList = cpcCodes.map(c => `  ${c.cpc_code} — ${c.description}`).join('\n')
  const patentList = odp.slice(0, 50).map((p, i) =>
    `${i + 1}. App# ${p.app_number} | Filed: ${p.filing_date ?? '?'} | "${p.title}" | Assignee: ${p.assignee ?? 'unknown'} | Status: ${p.status || 'unknown'}${p.abstract ? ` | Abstract: ${p.abstract.slice(0, 120)}…` : ''}`
  ).join('\n')

  return `You are a patent research analyst specializing in finding undervalued and abandoned patents worth acquiring.

Query: "${query}"
CPC classes identified: 
${cpcList}

Below are ${odp.length} real patents retrieved from the USPTO ODP API, filtered to these CPC classes (filed 2000–2020).
Select and score the 5-8 most promising candidates for acquisition. Prioritize:
- Abandoned or lapsed status (maintenance fee failure, explicit abandonment)
- High forward citation potential despite abandonment
- Specific, non-commoditized claims with remaining commercial value
- Small/individual assignees (less legal risk post-acquisition)

Patents from ODP:
${patentList}

Return a JSON array with this exact structure:
[
  {
    "patent_number": "App# from above (use the application number as-is)",
    "title": "exact title from above",
    "filing_date": "YYYY-MM-DD",
    "assignee": "as listed",
    "cpc_codes": ["H04B10/11"],
    "abandonment_reason": "maintenance fee lapsed" or null if status unclear,
    "forward_citation_count": null,
    "technology_relevance": 8,
    "acquisition_interest": 7,
    "rationale": "One sentence: why this specific patent is worth acquiring."
  }
]

IMPORTANT: Use ONLY patents from the list above. Return ONLY the JSON array.
technology_relevance and acquisition_interest are integers 1–10.`
}

// ── Phase 1 prompt — fallback (Gemini knowledge, no ODP data) ───────────────
function phase1FallbackPrompt(query: string, runType: string, cpcCodes: CpcCode[]): string {
  const cpcNote = cpcCodes.length > 0
    ? `CPC classes to focus on: ${cpcCodes.map(c => c.cpc_code).join(', ')}`
    : ''

  const context = runType === 'patent_number'
    ? `"${query}" is a patent number — research this patent and 4-6 related patents in the same family.`
    : `"${query}" is a ${runType === 'category' ? 'technology category' : 'keyword query'}.`

  return `You are a patent research analyst specializing in finding undervalued and abandoned patents worth acquiring.

${context}
${cpcNote}

(NOTE: USPTO ODP API returned insufficient results for CPC filtering. Using your training knowledge.)

Identify 5-8 patent candidates from USPTO public records that are:
- Abandoned or lapsed (failure to pay maintenance fees, or explicitly abandoned)
- Filed before 2020 (mature technology)
- Potentially undervalued relative to their forward citation count
- In CPC classes: ${cpcCodes.map(c => c.cpc_code).join(', ') || 'implied by the query'}

For each candidate, return a JSON array:
[
  {
    "patent_number": "US7654321B2",
    "title": "Full patent title",
    "filing_date": "2012-03-15",
    "assignee": "Original Assignee Corp",
    "cpc_codes": ["H04B10/11"],
    "abandonment_reason": "Maintenance fee not paid after 3.5 year window",
    "forward_citation_count": 42,
    "technology_relevance": 8,
    "acquisition_interest": 7,
    "rationale": "One sentence: why this specific patent is worth acquiring."
  }
]

IMPORTANT: Return ONLY the JSON array. Use real patent numbers where possible.`
}

// ── Phase 2 prompt — adversarial novelty pass ────────────────────────────────
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
    "final_recommendation": "worth acquiring"
  }
]

final_recommendation values:
- "worth acquiring": Low risk, undervalued, clear acquisition path, no blocking IP
- "investigate further": Interesting but needs prior art search or legal review
- "noise": Commoditized, risky, or not relevant enough to pursue

Return ONLY the JSON array. Be adversarial — find real risks.`
}

// ── Summary prompt ────────────────────────────────────────────────────────────
function summaryPrompt(query: string, candidates: PatentCandidate[], cpcCodes: CpcCode[], usedOdp: boolean): string {
  const worthAcquiring = candidates.filter(c => c.final_recommendation === 'worth acquiring')
  const investigate    = candidates.filter(c => c.final_recommendation === 'investigate further')

  return `You are a patent portfolio analyst. Write a 3-5 sentence executive summary of this research run.

Query: "${query}"
CPC classes searched: ${cpcCodes.map(c => c.cpc_code).join(', ') || '(none — fallback mode)'}
Data source: ${usedOdp ? 'USPTO ODP API (CPC-filtered, 2000–2020)' : 'Gemini training knowledge (ODP returned insufficient results)'}
Total candidates analyzed: ${candidates.length}
Worth acquiring: ${worthAcquiring.length} (${worthAcquiring.map(c => c.patent_number).join(', ') || 'none'})
Investigate further: ${investigate.length}

Top picks:
${worthAcquiring.slice(0, 3).map(c => `- ${c.patent_number}: ${c.title} — ${c.rationale}`).join('\n') || '(none flagged as worth acquiring)'}

Write a concise, opinionated summary. Mention specific patents by number. Note the quality of this technology space for acquisition. Keep it under 150 words.`
}

// ── Patent analysis: extract core invention + queries + CPC codes from claims ─
function patentAnalysisExtractPrompt(
  claimsDraft: string,
  analysisType: string,
): string {
  const typeInstructions: Record<string, string> = {
    prior_art:   'Focus on finding prior art — what existed before this invention was filed.',
    competitive: 'Focus on competitive landscape — who holds patents in adjacent technology spaces.',
    acquisition: 'Focus on acquisition targets — abandoned or lapsed patents in the same CPC classes.',
  }
  const typeNote = typeInstructions[analysisType] ?? typeInstructions.prior_art

  return `You are a USPTO patent classification expert analyzing a patent application.

Given these patent claims:
${claimsDraft.slice(0, 4000)}

Your task is to identify the CORE inventive concept — not peripheral elements, not dependent claim details.

Ask yourself: "What is the single most novel thing this patent protects?"
Look at independent claim 1. That is the broadest claim and defines the invention.
Dependent claims add detail — do NOT use them to define the core concept.

${typeNote}

Return as JSON only:
{
  "core_invention": "One sentence: the primary novel concept from independent claim 1 — what makes this invention different from everything before it",
  "primary_use_case": "Who uses this and what problem does it solve (one sentence)",
  "queries": [
    "most specific query targeting the primary mechanism of claim 1",
    "medium specificity query — broader but still on-target",
    "broad category query for the technology space"
  ],
  "cpc_codes": [
    { "cpc_code": "G06F3/01", "description": "...", "relevance_reason": "directly covers the primary mechanism from claim 1" }
  ],
  "primary_query": "the single best USPTO search query derived from independent claim 1"
}

IMPORTANT:
- core_invention must come from independent claim 1, not a dependent claim
- Do NOT extract peripheral elements (sensors, materials, packaging) as the core concept
- queries[0] must be directly searchable in USPTO and return relevant prior art
- Return ONLY the JSON object, no preamble`
}

// ── Main export ───────────────────────────────────────────────────────────────
export interface PatentAnalysisOptions {
  patentId?:    string
  analysisType?: 'prior_art' | 'competitive' | 'acquisition'
}

// ── IDS candidate auto-population ────────────────────────────────────────────
/**
 * For each candidate with technology_relevance >= 65 (score out of 10, so >= 6.5 mapped),
 * or acquisition_interest >= 65, check if an IDS candidate already exists and insert if not.
 * Uses patent_id from the run (for patent_analysis runs).
 */
async function autoPopulateIdsCandidates(
  runId: string,
  patentId: string | undefined,
  candidates: PatentCandidate[]
): Promise<void> {
  if (!patentId || candidates.length === 0) return

  // Map 1–10 score to 0–100 for >= 65 threshold
  const highScoreCandidates = candidates.filter(
    c => (c.technology_relevance * 10) >= 65 || (c.acquisition_interest * 10) >= 65
  )

  if (highScoreCandidates.length === 0) return

  console.log(`[research:${runId}] Auto-populating ${highScoreCandidates.length} IDS candidates for patent ${patentId}`)

  for (const c of highScoreCandidates) {
    const appNum = c.patent_number ?? ''
    if (!appNum) continue

    // Check if already exists
    const { data: existing } = await supabaseService
      .from('research_ids_candidates')
      .select('id')
      .eq('patent_id', patentId)
      .eq('application_number', appNum)
      .maybeSingle()

    if (existing) continue

    await supabaseService.from('research_ids_candidates').insert({
      patent_id:          patentId,
      research_result_id: null,
      application_number: appNum,
      patent_number:      appNum,
      title:              c.title,
      filing_date:        c.filing_date ?? null,
      cpc_codes:          c.cpc_codes ?? [],
      status:             'pending',
      relevance_notes:    `Auto-added from research run. Rec: ${c.final_recommendation}. ${c.rationale?.slice(0, 120) ?? ''}`,
      added_by:           'auto',
    }).then(({ error }) => {
      if (error) console.warn(`[research:${runId}] IDS candidate insert error for ${appNum}:`, error.message)
    })
  }
}

export async function runGeminiResearch(
  runId: string,
  query: string,
  runType: string,
  options?: PatentAnalysisOptions
): Promise<void> {
  const updateRun = (fields: Record<string, unknown>) =>
    supabaseService.from('research_runs').update(fields).eq('id', runId)

  try {
    await updateRun({ status: 'running' })

    // ── Patent Analysis pre-pass: extract query + CPC codes from claims ────
    if (runType === 'patent_analysis' && options?.patentId) {
      const analysisType = options.analysisType ?? 'prior_art'
      console.log(`[research:${runId}] Patent Analysis mode — fetching claims for ${options.patentId}`)

      const { data: patent } = await supabaseService
        .from('patents')
        .select('title, claims_draft, abstract_draft')
        .eq('id', options.patentId)
        .single()

      if (patent?.claims_draft) {
        try {
          const extractText = await callGemini(patentAnalysisExtractPrompt(patent.claims_draft, analysisType))
          const extracted = extractJSON(extractText) as {
            core_invention?:  string
            primary_use_case?: string
            queries?:         string[]
            cpc_codes?:       CpcCode[]
            primary_query?:   string
          }

          const coreInvention  = extracted?.core_invention  ?? null
          const primaryUseCase = extracted?.primary_use_case ?? null

          // Override Phase 0 entirely — we have patent-specific CPC codes + query
          const extractedCpcCodes = Array.isArray(extracted?.cpc_codes) ? extracted.cpc_codes as CpcCode[] : []
          const primaryQuery      = extracted?.primary_query ?? extracted?.queries?.[0] ?? query

          console.log(`[research:${runId}] Patent Analysis — core_invention: "${coreInvention}"`)
          console.log(`[research:${runId}] Patent Analysis — primary query: "${primaryQuery}", CPCs: ${extractedCpcCodes.map(c => c.cpc_code).join(', ')}`)

          // Update the run with the derived query + core_invention for debugging
          const displayQuery = `${patent.title} — ${analysisType.replace(/_/g, ' ')}: ${primaryQuery}`
          await updateRun({
            query: displayQuery,
            // Store as extra metadata on the summary field (pre-result, overwritten later)
            summary: coreInvention ? `Core invention: ${coreInvention}${primaryUseCase ? ` | Use case: ${primaryUseCase}` : ''}` : null,
          })

          // Skip Phase 0 and go straight to ODP with extracted CPC codes
          let odpCandidates: OdpPatent[] = []
          if (extractedCpcCodes.length > 0) {
            const fetches = await Promise.allSettled(
              extractedCpcCodes.slice(0, 4).map(c => fetchOdpByCpc(c.cpc_code))
            )
            for (const result of fetches) {
              if (result.status === 'fulfilled') odpCandidates.push(...result.value)
            }
            const seen = new Set<string>()
            odpCandidates = odpCandidates.filter(p => {
              if (seen.has(p.app_number)) return false
              seen.add(p.app_number)
              return true
            })
          }

          const usedOdp = odpCandidates.length >= 5
          console.log(`[research:${runId}] Patent Analysis — ${odpCandidates.length} ODP candidates`)

          // Phase 1 with patent context injected
          const phase1Text = await callGemini(
            usedOdp
              ? phase1GroundedPrompt(primaryQuery, extractedCpcCodes, odpCandidates)
              : phase1FallbackPrompt(primaryQuery, analysisType, extractedCpcCodes)
          )

          let candidates: PatentCandidate[]
          try {
            const raw = extractJSON(phase1Text) as PatentCandidate[]
            candidates = Array.isArray(raw) ? raw : []
            if (candidates.length === 0) throw new Error('Phase 1 empty')
          } catch (e) {
            throw new Error(`Phase 1 JSON parse failed: ${e}`)
          }

          candidates = candidates.map(c => ({
            patent_number:          String(c.patent_number ?? ''),
            title:                  String(c.title ?? ''),
            filing_date:            c.filing_date ?? null,
            assignee:               c.assignee ?? null,
            cpc_codes:              Array.isArray(c.cpc_codes) ? c.cpc_codes : [],
            abandonment_reason:     c.abandonment_reason ?? null,
            forward_citation_count: c.forward_citation_count ?? null,
            technology_relevance:   Number(c.technology_relevance ?? 5),
            acquisition_interest:   Number(c.acquisition_interest ?? 5),
            rationale:              String(c.rationale ?? ''),
            risk_flags:             [],
            final_recommendation:   'investigate further' as const,
            source:                 usedOdp ? 'odp_filtered' : 'gemini_knowledge',
          }))

          // Phase 2 adversarial
          let riskResults: Array<{
            patent_number: string; risk_flags: string[]
            final_recommendation: PatentCandidate['final_recommendation']
          }> = []
          try {
            riskResults = extractJSON(await callGemini(phase2Prompt(candidates))) as typeof riskResults
          } catch { /* non-fatal */ }

          candidates = candidates.map((c, i) => {
            const risk = riskResults.find(r => r.patent_number === c.patent_number) ?? riskResults[i]
            return risk
              ? { ...c, risk_flags: Array.isArray(risk.risk_flags) ? risk.risk_flags : [], final_recommendation: risk.final_recommendation ?? c.final_recommendation }
              : c
          })

          let summary = ''
          try {
            summary = (await callGemini(summaryPrompt(primaryQuery, candidates, extractedCpcCodes, usedOdp))).trim()
          } catch {
            const worthCount = candidates.filter(c => c.final_recommendation === 'worth acquiring').length
            summary = `Patent analysis for "${patent.title}" (${analysisType.replace('_', ' ')}) complete. ${candidates.length} candidates analyzed; ${worthCount} flagged as worth acquiring.`
          }

          // Prepend core_invention to summary so it surfaces in UI
          const fullSummary = [
            coreInvention  ? `**Core invention:** ${coreInvention}` : null,
            primaryUseCase ? `**Use case:** ${primaryUseCase}` : null,
            summary || null,
          ].filter(Boolean).join('\n\n')

          await updateRun({
            status:       'complete',
            candidates,
            summary:      fullSummary,
            completed_at: new Date().toISOString(),
          })

          // Auto-populate IDS candidates for high-score results
          await autoPopulateIdsCandidates(runId, options?.patentId, candidates)

          console.log(`[research:${runId}] ✅ Patent Analysis complete — core: "${coreInvention}" | CPCs: ${extractedCpcCodes.map(c => c.cpc_code).join(', ')} | ${candidates.length} candidates`)
          return

        } catch (e) {
          console.warn(`[research:${runId}] Patent Analysis extraction failed: ${e}. Falling back to standard loop.`)
          // Fall through to standard loop below
        }
      } else {
        console.warn(`[research:${runId}] Patent ${options.patentId} has no claims_draft — using title as query`)
      }
    }

    // ── Phase 0: CPC class lookup ──────────────────────────────────────────
    console.log(`[research:${runId}] Phase 0 — CPC lookup for: "${query}"`)
    let cpcCodes: CpcCode[] = []

    try {
      const p0Text = await callGemini(phase0Prompt(query))
      const raw = extractJSON(p0Text)
      if (Array.isArray(raw) && raw.length > 0) {
        cpcCodes = raw as CpcCode[]
        console.log(`[research:${runId}] Phase 0 — ${cpcCodes.length} CPC codes: ${cpcCodes.map(c => c.cpc_code).join(', ')}`)
      }
    } catch (e) {
      console.warn(`[research:${runId}] Phase 0 CPC lookup failed: ${e}. Continuing without CPC filter.`)
    }

    // ── Phase 0: ODP fetch for each CPC code ──────────────────────────────
    let odpCandidates: OdpPatent[] = []
    if (cpcCodes.length > 0) {
      const fetches = await Promise.allSettled(
        cpcCodes.slice(0, 4).map(c => fetchOdpByCpc(c.cpc_code))
      )
      for (const result of fetches) {
        if (result.status === 'fulfilled') odpCandidates.push(...result.value)
      }
      // Deduplicate by app_number
      const seen = new Set<string>()
      odpCandidates = odpCandidates.filter(p => {
        if (seen.has(p.app_number)) return false
        seen.add(p.app_number)
        return true
      })
      console.log(`[research:${runId}] Phase 0 — ${odpCandidates.length} unique ODP candidates after dedup`)
    }

    const usedOdp = odpCandidates.length >= 5

    // ── Phase 1: Broad sweep ──────────────────────────────────────────────
    console.log(`[research:${runId}] Phase 1 — ${usedOdp ? 'grounded (ODP data)' : 'fallback (Gemini knowledge)'}`)

    const phase1Text = await callGemini(
      usedOdp
        ? phase1GroundedPrompt(query, cpcCodes, odpCandidates)
        : phase1FallbackPrompt(query, runType, cpcCodes)
    )

    let candidates: PatentCandidate[]
    try {
      const raw = extractJSON(phase1Text) as PatentCandidate[]
      candidates = Array.isArray(raw) ? raw : []
      if (candidates.length === 0) throw new Error('Phase 1 returned empty array')
    } catch (e) {
      throw new Error(`Phase 1 JSON parse failed: ${e}. Raw: ${phase1Text.slice(0, 300)}`)
    }

    candidates = candidates.map(c => ({
      patent_number:          String(c.patent_number ?? ''),
      title:                  String(c.title ?? ''),
      filing_date:            c.filing_date ?? null,
      assignee:               c.assignee ?? null,
      cpc_codes:              Array.isArray(c.cpc_codes) ? c.cpc_codes : [],
      abandonment_reason:     c.abandonment_reason ?? null,
      forward_citation_count: c.forward_citation_count ?? null,
      technology_relevance:   Number(c.technology_relevance ?? 5),
      acquisition_interest:   Number(c.acquisition_interest ?? 5),
      rationale:              String(c.rationale ?? ''),
      risk_flags:             [],
      final_recommendation:   'investigate further' as const,
      source:                 usedOdp ? 'odp_filtered' : 'gemini_knowledge',
    }))

    console.log(`[research:${runId}] Phase 1 complete — ${candidates.length} candidates (source: ${usedOdp ? 'ODP' : 'Gemini knowledge'})`)

    // ── Phase 2: Adversarial novelty pass ─────────────────────────────────
    console.log(`[research:${runId}] Phase 2 — adversarial pass`)
    let riskResults: Array<{
      patent_number:        string
      risk_flags:           string[]
      final_recommendation: PatentCandidate['final_recommendation']
    }> = []

    try {
      const raw = extractJSON(await callGemini(phase2Prompt(candidates)))
      riskResults = Array.isArray(raw) ? raw as typeof riskResults : []
    } catch {
      console.warn(`[research:${runId}] Phase 2 JSON parse failed — keeping Phase 1 results with default recommendations`)
    }

    candidates = candidates.map((c, i) => {
      const risk = riskResults.find(r => r.patent_number === c.patent_number) ?? riskResults[i]
      return risk
        ? { ...c, risk_flags: Array.isArray(risk.risk_flags) ? risk.risk_flags : [], final_recommendation: risk.final_recommendation ?? c.final_recommendation }
        : c
    })

    const worthCount = candidates.filter(c => c.final_recommendation === 'worth acquiring').length
    console.log(`[research:${runId}] Phase 2 complete — ${worthCount} "worth acquiring"`)

    // ── Summary ───────────────────────────────────────────────────────────
    let summary = ''
    try {
      summary = (await callGemini(summaryPrompt(query, candidates, cpcCodes, usedOdp))).trim()
    } catch {
      summary = `Research complete. ${candidates.length} candidates analyzed (${usedOdp ? 'ODP CPC-filtered' : 'Gemini knowledge'}); ${worthCount} flagged as "worth acquiring".`
    }

    await updateRun({
      status:       'complete',
      candidates,
      summary,
      completed_at: new Date().toISOString(),
    })

    // Auto-populate IDS candidates for patent_analysis runs
    await autoPopulateIdsCandidates(runId, options?.patentId, candidates)

    console.log(`[research:${runId}] ✅ Complete — CPC: ${cpcCodes.map(c => c.cpc_code).join(', ') || 'none'} | source: ${usedOdp ? 'ODP' : 'fallback'} | candidates: ${candidates.length} | worth: ${worthCount}`)

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
