/**
 * POST /api/pattie/dashboard
 * Authenticated. Pattie as command interface — knows the user's patents,
 * deadlines, marketplace listings. Routes intent to actions.
 *
 * Returns: SSE stream + intent + optional navigate_to field
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

// ── Auth intent type ──────────────────────────────────────────────────────────
type AuthIntent =
  | 'new_patent'
  | 'open_patent'
  | 'check_deadline'
  | 'prior_art_search'
  | 'marketplace_action'
  | 'file_action'
  | 'general_question'
  | 'unknown'

function detectAuthIntent(message: string): AuthIntent {
  const m = message.toLowerCase()
  if (/new patent|start a patent|create a patent|file a new|new invention|have an idea/i.test(m)) return 'new_patent'
  if (/file|submit.*uspto|non.?provisional|official filing|aia|form|generate.*form/i.test(m)) return 'file_action'
  if (/deadline|due|expire|urgent|days left|when is/i.test(m)) return 'check_deadline'
  if (/prior art|search.*patent|existing patent|novelty|prior|uspto.*search/i.test(m)) return 'prior_art_search'
  if (/marketplace|list.*sale|license|sell|ip.*sale|deal page/i.test(m)) return 'marketplace_action'
  if (/show|open|view|look at|my .* patent|review .* patent|check.*patent/i.test(m)) return 'open_patent'
  return 'general_question'
}

// Fuzzy title match — returns patent id if found
function fuzzyMatchPatent(
  message: string,
  patents: Array<{ id: string; title: string }>
): string | null {
  const m = message.toLowerCase()
  // Try exact substring first
  for (const p of patents) {
    if (m.includes(p.title.toLowerCase())) return p.id
  }
  // Try individual words from message against title words
  const words = m.split(/\s+/).filter(w => w.length > 4)
  for (const p of patents) {
    const titleWords = p.title.toLowerCase().split(/\s+/)
    const matches = words.filter(w => titleWords.some(tw => tw.includes(w) || w.includes(tw)))
    if (matches.length >= 2) return p.id
  }
  return null
}

// Injection sanitizer
const INJECTION_PATTERNS = [
  /\bSYSTEM[:\s]/gi, /\[INST\]/gi,
  /ignore previous instructions?/gi,
  /disregard (all |previous |prior )?instructions?/gi,
  /you are now\b/gi, /new instructions?:/gi,
  /forget (all |your |previous )?instructions?/gi,
  /<\/?system>/gi,
]
function sanitize(text: string): string {
  let s = text
  for (const p of INJECTION_PATTERNS) s = s.replace(p, '[REDACTED]')
  return s
}

export async function POST(req: NextRequest) {
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    priming?: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  const userMessages = (body.messages ?? []).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: sanitize(m.content ?? ''),
  }))

  const lastUserMsg = userMessages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? ''

  // ── Load user context ─────────────────────────────────────────────────────
  const [
    { data: patents },
    { data: profile },
    { data: ppProfile },
  ] = await Promise.all([
    supabaseService
      .from('patents')
      .select('id, title, status, filing_status, nonprov_deadline_at, marketplace_enabled')
      .eq('owner_id', user.id)
      .neq('status', 'research_import')
      .neq('status', 'on_hold')  // on_hold patents excluded from Pattie proactive suggestions
      .order('updated_at', { ascending: false })
      .limit(20),
    supabaseService.from('profiles').select('display_name, subscription_status').eq('id', user.id).single(),
    supabaseService.from('patent_profiles').select('name_first, subscription_status').eq('id', user.id).single(),
  ])

  const firstName = ppProfile?.name_first || profile?.display_name?.split(' ')[0] || 'there'
  const tier = profile?.subscription_status ?? ppProfile?.subscription_status ?? 'free'
  const patentList = patents ?? []
  const listings = patentList.filter(p => p.marketplace_enabled)

  // Upcoming deadlines (within 60 days)
  const now = new Date()
  const urgentPatents = patentList.filter(p => {
    if (!p.nonprov_deadline_at) return false
    const days = Math.ceil((new Date(p.nonprov_deadline_at).getTime() - now.getTime()) / 86400000)
    return days >= 0 && days <= 60
  }).map(p => {
    const days = Math.ceil((new Date(p.nonprov_deadline_at!).getTime() - now.getTime()) / 86400000)
    return { title: p.title, days, deadline: p.nonprov_deadline_at }
  })

  // Intent detection + navigate_to
  const intent: AuthIntent = detectAuthIntent(lastUserMsg)
  let navigateTo: string | null = null

  if (intent === 'new_patent') navigateTo = '/dashboard/patents/new'
  if (intent === 'marketplace_action') navigateTo = '/marketplace'
  if (intent === 'prior_art_search') navigateTo = '/admin/research'
  if (intent === 'open_patent') {
    const matchedId = fuzzyMatchPatent(lastUserMsg, patentList.map(p => ({ id: p.id, title: p.title })))
    if (matchedId) navigateTo = `/dashboard/patents/${matchedId}`
  }

  // Build context-aware system prompt
  const patentSummary = patentList.length > 0
    ? patentList.map(p => `- "${p.title}" (${p.status}${p.nonprov_deadline_at ? `, deadline: ${p.nonprov_deadline_at.split('T')[0]}` : ''})`).join('\n')
    : 'No patents yet.'

  const deadlineSummary = urgentPatents.length > 0
    ? urgentPatents.map(p => `- "${p.title}": ${p.days} days (${p.deadline?.split('T')[0]})`).join('\n')
    : 'No urgent deadlines.'

  const systemPrompt = `You are Pattie, the AI patent assistant for patentpending.app.

You are now in an authenticated session with ${firstName}, an inventor and platform user.

USER CONTEXT:
- Name: ${firstName}
- Account tier: ${tier}
- Patent count: ${patentList.length}
- Marketplace listings: ${listings.length}
- Patents:
${patentSummary}
- Upcoming deadlines (next 60 days):
${deadlineSummary}

YOUR ROLE:
1. Be proactive. If there are urgent deadlines, mention them naturally in your first response even if not asked.
2. Route user intent to action. When they want to work on a specific patent, navigate there. When they want to file, start the flow.
3. Keep responses short and action-oriented. This is a command interface, not an essay.
4. Never reveal technical architecture, model names, or internals. You are Pattie.
5. If user asks to "file" anything officially (generate AIA forms, submit to USPTO): confirm they want to proceed before navigating.

CAPABILITIES YOU CAN ROUTE TO:
- New patent → /dashboard/patents/new
- Open patent → /dashboard/patents/[id]
- Marketplace → /marketplace or /dashboard/patents/[id] (settings tab)
- Prior art search → /admin/research (if admin) or explain how to request

Tone: Direct, efficient, warm. You know this user. Act like their co-pilot, not their assistant.`

  // Handle context priming from homepage handoff
  const primingMessages = (body.priming ?? []).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Build full messages array: priming → conversation
  let allMessages = [...primingMessages, ...userMessages]

  // If priming present, prepend a natural transition as first assistant message
  if (primingMessages.length > 0 && userMessages.length > 0 && userMessages[0].role === 'user') {
    // Insert transition before the first new user message
    allMessages = [
      ...primingMessages,
      { role: 'assistant' as const, content: `Welcome — continuing from where we left off. I can see your patent portfolio now. ${urgentPatents.length > 0 ? `⚠️ You have ${urgentPatents.length} deadline${urgentPatents.length > 1 ? 's' : ''} coming up.` : ''}` },
      ...userMessages,
    ]
  }

  if (!allMessages.length || allMessages[allMessages.length - 1].role !== 'user') {
    return new Response(JSON.stringify({ error: 'No user message' }), { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503 })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      const emitDone = () =>
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            stream: true,
            system: systemPrompt,
            messages: allMessages,
          }),
        })

        if (!res.ok || !res.body) { emitDone(); controller.close(); return }

        const reader = res.body.getReader()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') continue
            try {
              const evt = JSON.parse(raw)
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                emit({ type: 'text', text: evt.delta.text })
              } else if (evt.type === 'message_stop') {
                emit({ type: 'meta', intent, navigate_to: navigateTo })
              }
            } catch { /* skip */ }
          }
        }

        emitDone()
        controller.close()
      } catch (err) {
        console.error('[pattie/dashboard] stream error:', err)
        emitDone()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
