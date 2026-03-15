import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

const GEMINI_FLASH_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`
const GEMINI_PRO_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`

async function geminiText(url: string, prompt: string, maxTokens = 8192): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Gemini error')
  const parts = json.candidates?.[0]?.content?.parts ?? []
  return parts.filter((p: { thought?: boolean; text?: string }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('')
}

// POST /api/patents/[id]/draft-spec
// Generates a USPTO-style provisional specification from claims + intake answers.
// Stores result in patents.spec_draft. Returns the draft.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )

  // ── Load patent + intake session ──────────────────────────────────────────
  const { data: patent } = await serviceClient
    .from('patents')
    .select('id, owner_id, title, description, claims_draft, spec_draft, intake_session_id')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!patent.claims_draft) {
    return NextResponse.json({ error: 'Claims draft required before generating specification. Generate claims first.' }, { status: 400 })
  }

  // Load intake session for richer context
  let intakeContext = ''
  if (patent.intake_session_id) {
    const { data: intake } = await serviceClient
      .from('patent_intake_sessions')
      .select('invention_name, problem_solved, how_it_works, what_makes_it_new, target_market, prior_art_notes, inventor_notes')
      .eq('id', patent.intake_session_id)
      .single()

    if (intake) {
      intakeContext = [
        intake.problem_solved && `Problem being solved: ${intake.problem_solved}`,
        intake.how_it_works && `How it works: ${intake.how_it_works}`,
        intake.what_makes_it_new && `What makes it new: ${intake.what_makes_it_new}`,
        intake.target_market && `Target market: ${intake.target_market}`,
        intake.prior_art_notes && `Prior art notes: ${intake.prior_art_notes}`,
        intake.inventor_notes && `Inventor notes: ${intake.inventor_notes}`,
      ].filter(Boolean).join('\n')
    }
  }

  if (!intakeContext && patent.description) {
    intakeContext = patent.description
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  const prompt = `You are a USPTO patent attorney drafting a professional provisional patent specification.

TITLE: ${patent.title}

INVENTION CONTEXT:
${intakeContext || 'No additional context provided.'}

PATENT CLAIMS (use these to derive what must be described):
${patent.claims_draft}

Write a complete USPTO-style provisional patent specification with these exact sections in this order:

FIELD OF THE INVENTION
BACKGROUND OF THE INVENTION
SUMMARY OF THE INVENTION
BRIEF DESCRIPTION OF THE DRAWINGS
DETAILED DESCRIPTION OF THE PREFERRED EMBODIMENTS

Requirements:
- Professional USPTO patent language throughout
- Each section labeled exactly as shown above (all caps)
- Background: explain the technical problem, limitations of existing solutions, and the technical field in detail (minimum 200 words)
- Summary: summarize ALL claims broadly, using language like "In one embodiment..." and "The invention provides..."
- Drawings: Reference FIG. 1 through at least FIG. 4 as descriptive placeholders; describe what each figure shows
- Detailed Description: minimum 3 distinct embodiments thoroughly described; reference the figures; include any technical specifications implied by the claims
- Learning curve / user experience details if present in claims
- Do NOT include abstract, claims section, or title page — those are separate USPTO documents
- Minimum 1,200 words
- Output the specification text only, no preamble or commentary`

  console.log(`[draft-spec] Generating spec for patent ${patentId}...`)

  let specDraft: string
  try {
    // Try Pro first for better quality; fall back to Flash on timeout
    specDraft = await geminiText(GEMINI_PRO_URL, prompt, 8192)
  } catch (e) {
    console.warn('[draft-spec] Pro failed, falling back to Flash:', e)
    specDraft = await geminiText(GEMINI_FLASH_URL, prompt, 8192)
  }

  if (!specDraft || specDraft.length < 500) {
    return NextResponse.json({ error: 'Specification generation failed — please try again' }, { status: 500 })
  }

  // ── Save to DB ─────────────────────────────────────────────────────────────
  await serviceClient
    .from('patents')
    .update({ spec_draft: specDraft, updated_at: new Date().toISOString() })
    .eq('id', patentId)

  // ── Log AI usage ───────────────────────────────────────────────────────────
  const approxInputTokens = Math.round((prompt.length + (patent.claims_draft?.length ?? 0)) / 4)
  const approxOutputTokens = Math.round(specDraft.length / 4)
  await serviceClient.from('ai_usage_log').insert({
    user_id: user.id,
    patent_id: patentId,
    action: 'draft_spec',
    model: 'gemini-2.5-pro',
    input_tokens: approxInputTokens,
    output_tokens: approxOutputTokens,
    cost_usd: (approxInputTokens * 0.00000125 + approxOutputTokens * 0.000010), // Gemini 2.5 Pro pricing approx
    metadata: { title: patent.title, spec_length: specDraft.length },
  })

  console.log(`[draft-spec] ✅ Spec generated: ${specDraft.length} chars for ${patentId}`)

  return NextResponse.json({
    spec_draft: specDraft,
    length: specDraft.length,
    word_count: specDraft.split(/\s+/).length,
  })
}
