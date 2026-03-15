import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserTierInfo, isPro } from '@/lib/tier'
import { logAiUsage } from '@/lib/ai-budget'

export const maxDuration = 60

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

const SYSTEM_PROMPT = `You are a patent drafting assistant. A user has answered 6 questions about their invention.
Extract and structure their answers into a patent draft.

Return ONLY valid JSON with these exact fields:
{
  "title": "A concise, descriptive patent title (no marketing language)",
  "abstract_draft": "A 150-word technical abstract suitable for USPTO filing",
  "spec_draft": "A 400-600 word specification covering: background of the invention, summary of the invention, and detailed description. Use the user's own words where possible. Write in formal patent style.",
  "tags": ["2-4 technology category tags as lowercase strings"]
}

Rules:
- Title should be descriptive and technical, not a product name
- Abstract must be a single paragraph, under 150 words
- Spec must have clear section breaks: BACKGROUND, SUMMARY, DETAILED DESCRIPTION
- Never invent technical details not present in the user's answers
- Never add claims — claims are drafted separately
- Strip any personally identifying information from the spec`

interface InterviewAnswers {
  what_it_does: string
  problem_solved: string
  how_it_works: string
  what_makes_different: string
  inventors: string
  has_figures: boolean
}

interface DraftResult {
  title: string
  abstract_draft: string
  spec_draft: string
  tags: string[]
}

function buildUserPrompt(answers: InterviewAnswers): string {
  return `Here are the inventor's answers:

1. What does it do?
${answers.what_it_does}

2. What problem does it solve?
${answers.problem_solved}

3. How does it work?
${answers.how_it_works}

4. What makes it different?
${answers.what_makes_different}

5. Inventors:
${answers.inventors}

6. Has figures/sketches: ${answers.has_figures ? 'Yes' : 'No'}

Draft the patent based on these answers.`
}

/**
 * POST /api/pattie/interview-draft
 * Pro-only. Takes 6 interview answers, uses Claude Sonnet to generate
 * a structured patent draft (title, abstract, spec, tags), creates the
 * patent record with created_via: 'pattie_interview', returns the patent ID.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check pattie_intro_shown for first-run disclosure
  const { data: profileRow } = await supabaseService
    .from('patent_profiles')
    .select('pattie_intro_shown')
    .eq('id', user.id)
    .single()
  const introShown = (profileRow as Record<string,unknown>)?.pattie_intro_shown === true

  // Tier gate — Pro or complimentary only
  const tierInfo = await getUserTierInfo(user.id)
  if (!isPro(tierInfo, { isOwner: true, feature: 'pattie_interview' })) {
    return NextResponse.json({
      error: 'Pattie Interview Mode requires PatentPending Pro.',
      code: 'TIER_REQUIRED',
      requiredTier: 'pro',
      feature: 'pattie_interview',
    }, { status: 403 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  let answers: InterviewAnswers
  try {
    const body = await req.json()
    answers = body.answers
    if (!answers?.what_it_does) throw new Error('Missing required answer: what_it_does')
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // Call Claude Sonnet
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT + (!introShown
        ? '\nFIRST-TIME USER: After generating the patent draft JSON, also include a key "intro_note" with the value: "By the way, you can turn my suggestions on or off in your Profile settings." — but only in the JSON response, not as a separate sentence.'
        : ''),
      messages: [{ role: 'user', content: buildUserPrompt(answers) }],
    }),
  })

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    console.error('[interview-draft] Anthropic error:', errText)
    return NextResponse.json({ error: 'draft_failed' }, { status: 422 })
  }

  const anthropicData = await anthropicRes.json()
  const rawText: string = anthropicData.content?.[0]?.text ?? ''
  const inputTok  = anthropicData.usage?.input_tokens ?? 0
  const outputTok = anthropicData.usage?.output_tokens ?? 0

  // Log token usage (non-blocking)
  void logAiUsage(supabaseService, {
    userId:     user.id,
    feature:    'pattie_interview',
    tokensUsed: inputTok + outputTok,
    model:      'claude-sonnet-4-6',
  })

  // Flip pattie_intro_shown after first Pattie interaction (non-blocking)
  if (!introShown) {
    void supabaseService
      .from('patent_profiles')
      .update({ pattie_intro_shown: true })
      .eq('id', user.id)
      .then(({ error }) => { if (error) console.error('[interview-draft] intro_shown update failed:', error) })
  }

  // Parse JSON response (strip markdown fences if present)
  let draft: DraftResult
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    draft = JSON.parse(cleaned)
    if (!draft.title || !draft.spec_draft) throw new Error('Missing required fields')
  } catch (e) {
    console.error('[interview-draft] JSON parse failed:', e, '\nRaw:', rawText.slice(0, 500))
    return NextResponse.json({ error: 'draft_failed', detail: 'parse_error' }, { status: 422 })
  }

  // Extract inventor names for the inventors array
  const inventorList = answers.inventors
    ? answers.inventors.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
    : []

  // Create patent record
  const { data: patent, error: insertErr } = await supabaseService
    .from('patents')
    .insert({
      owner_id:       user.id,
      title:          draft.title,
      abstract_draft: draft.abstract_draft ?? null,
      spec_draft:     draft.spec_draft,
      tags:           Array.isArray(draft.tags) ? draft.tags : [],
      inventors:      inventorList,
      status:         'provisional',
      filing_status:  'draft',
      created_via:    'pattie_interview',
      current_phase:  1,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[interview-draft] Patent insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok:       true,
    patent_id: patent.id,
    draft: {
      title:          draft.title,
      abstract_draft: draft.abstract_draft,
      spec_draft:     draft.spec_draft,
      tags:           draft.tags,
    },
    has_figures: answers.has_figures,
    tokens: { input: inputTok, output: outputTok },
  })
}
