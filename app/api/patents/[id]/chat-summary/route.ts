import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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

const SUMMARY_PROMPT = `You are summarizing a patent consultation session with Pattie, an AI patent assistant.
Review the conversation and extract:
1. A 2-3 sentence summary of what was discussed
2. Any concrete suggestions made about: claims, abstract, specification, figures, tags
3. Any open questions or items the inventor needs to follow up on
4. Any specific wording or language the inventor provided about their invention

Return ONLY valid JSON: { "summary": "...", "suggestions": ["..."], "openItems": ["..."], "inventorInput": "..." }
Keep each field concise. Strip markdown. If a section has nothing, use an empty array or empty string.`

/**
 * POST /api/patents/[id]/chat-summary
 * Generates a session summary from a list of messages and saves to patent_correspondence.
 * Called non-blocking on Pattie drawer close (3+ exchanges).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let messages: { role: string; content: string }[], patentTitle: string
  try {
    const body = await req.json()
    messages    = body.messages ?? []
    patentTitle = body.patent_title ?? 'Patent'
    if (messages.length < 3) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'too_short' })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // Build conversation text
  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'Inventor' : 'Pattie'}: ${m.content}`)
    .join('\n\n')

  // ── Call Anthropic (primary) or Gemini (fallback when no Anthropic key) ──
  let rawText = ''

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SUMMARY_PROMPT,
        messages: [{ role: 'user', content: conversationText }],
      }),
    })
    if (anthropicRes.ok) {
      const data = await anthropicRes.json()
      rawText = data.content?.[0]?.text ?? ''
    } else {
      console.error('[chat-summary] Anthropic error:', await anthropicRes.text())
    }
  }

  // Gemini fallback (if no Anthropic key or Anthropic failed)
  if (!rawText && process.env.GEMINI_API_KEY) {
    const geminiPrompt = `${SUMMARY_PROMPT}\n\nConversation to summarize:\n${conversationText}`
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: geminiPrompt }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
        }),
      }
    )
    if (geminiRes.ok) {
      const gd = await geminiRes.json()
      rawText = gd.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      console.log('[chat-summary] Used Gemini fallback for summary')
    } else {
      console.error('[chat-summary] Gemini fallback error:', await geminiRes.text())
    }
  }

  // Last resort: build a simple summary without AI (always saves something)
  if (!rawText) {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    rawText = JSON.stringify({
      summary: lastAssistant
        ? `Pattie session completed. Last response: ${lastAssistant.content.slice(0, 200)}`
        : `Pattie session with ${messages.length} messages — no AI key available for summary.`,
      suggestions: [],
      openItems: [],
      inventorInput: messages.find(m => m.role === 'user')?.content?.slice(0, 200) ?? '',
    })
    console.log('[chat-summary] Used no-AI fallback — saving minimal summary')
  }

  let parsed: { summary: string; suggestions: string[]; openItems: string[]; inventorInput: string }
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    // If JSON parse fails, use raw text as summary
    parsed = { summary: rawText.slice(0, 500), suggestions: [], openItems: [], inventorInput: '' }
  }

  // Format content for correspondence
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const content = [
    `## Pattie Chat Summary — ${dateStr}`,
    `**Patent:** ${patentTitle}`,
    '',
    `### Summary`,
    parsed.summary || '(No summary)',
    '',
    parsed.suggestions?.length ? `### Suggestions\n${parsed.suggestions.map(s => `- ${s}`).join('\n')}` : '',
    parsed.openItems?.length ? `### Open Items\n${parsed.openItems.map(s => `- ${s}`).join('\n')}` : '',
    parsed.inventorInput ? `### Inventor Input\n${parsed.inventorInput}` : '',
    '',
    `*${messages.length} messages in this session*`,
  ].filter(Boolean).join('\n')

  // Save to patent_correspondence
  const { error: corrErr } = await supabaseService
    .from('patent_correspondence')
    .insert({
      patent_id:           patentId,
      owner_id:            user.id,
      title:               `Pattie Chat — ${dateStr}`,
      type:                'pattie_session',
      content,
      from_party:          'Pattie (PatentPending AI)',
      correspondence_date: new Date().toISOString().split('T')[0],
      tags:                ['pattie_session', 'ai_chat'],
    })

  if (corrErr) {
    console.error('[chat-summary] Correspondence insert error:', corrErr.message)
    return NextResponse.json({ error: corrErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, summary: parsed.summary })
}
