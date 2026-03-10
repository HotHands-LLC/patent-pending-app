import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

/**
 * POST /api/patents/[id]/chat
 * Streams a Pattie response using Anthropic claude-sonnet-4-6.
 * Read-only: never writes to any DB field.
 * System prompt is server-side only — never exposed to client.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 503 })
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  const body = await req.json()
  const messages: { role: 'user' | 'assistant'; content: string }[] = body.messages ?? []
  if (!messages.length) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 })
  }

  // ── Fetch patent data ─────────────────────────────────────────────────────
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, title, spec_draft, claims_draft, current_phase, entity_size, inventors')
    .eq('id', patentId)
    .single()

  if (!patent) return new Response(JSON.stringify({ error: 'Patent not found' }), { status: 404 })
  if (patent.owner_id !== user.id) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

  // Fetch last 5 correspondence titles (titles only — not full content)
  const { data: corrItems } = await supabaseService
    .from('patent_correspondence')
    .select('correspondence_type, created_at')
    .eq('patent_id', patentId)
    .order('created_at', { ascending: false })
    .limit(5)

  const correspondenceTitles = corrItems?.length
    ? corrItems.map(c => `• ${c.correspondence_type} (${new Date(c.created_at).toLocaleDateString()})`).join('\n')
    : 'None yet.'

  // ── Build system prompt ───────────────────────────────────────────────────
  const inventorsList = Array.isArray(patent.inventors) && patent.inventors.length
    ? patent.inventors.join(', ')
    : 'Not specified'

  const currentStep = patent.current_phase ?? 'unknown'

  const systemPrompt = `You are Pattie, the friendly and knowledgeable assistant for PatentPending — an app that helps inventors file and manage their own patents.

You are helping the inventor with their patent: "${patent.title}"

Here is their current specification draft:
---
${patent.spec_draft ?? 'Not yet written.'}
---

Here is their current claims draft:
---
${patent.claims_draft ?? 'Not yet written.'}
---

Filing progress: Step ${currentStep} of 9
Entity size: ${(patent as Record<string, unknown>).entity_size ?? 'not set'}
Inventors: ${inventorsList}
Recent correspondence items:
${correspondenceTitles}

Your role:
- Help the inventor understand their patent, their claims, and the filing process
- Explain USPTO requirements in plain English
- Offer suggestions and observations when asked
- Be warm, encouraging, and never condescending
- Keep responses concise unless asked to elaborate
- Do NOT make up legal advice — you are an AI assistant, not a licensed attorney
- Do NOT write to any fields or take any actions — you are read-only

If the inventor asks you to "apply" or "update" something, acknowledge it warmly and let them know that Pattie's write capabilities are coming soon — for now, they can copy your suggestion and paste it into the relevant field.

Always stay focused on THIS patent unless the user clearly wants to discuss something else.`

  // Log first 100 chars for debugging (remove before prod if desired)
  console.log('[pattie/chat] system prompt[:100]:', systemPrompt.slice(0, 100))

  // ── Call Anthropic streaming ──────────────────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  })

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text()
    console.error('[pattie/chat] Anthropic error:', errText)
    return new Response(JSON.stringify({ error: 'AI service error' }), { status: 502 })
  }

  // ── Proxy the SSE stream to client ────────────────────────────────────────
  // We translate Anthropic SSE events → simple text/event-stream with just the delta text
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body!.getReader()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                continue
              }
              try {
                const parsed = JSON.parse(data)
                // Anthropic streaming: content_block_delta event carries text
                if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                  const text = parsed.delta.text
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                }
                // message_stop signals completion
                if (parsed.type === 'message_stop') {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                }
              } catch {
                // skip malformed JSON lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
