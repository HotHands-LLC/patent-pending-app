/**
 * POST /api/pattie/demo
 * Public (no auth). Pattie in sales/demo mode for live prospect calls.
 * Streaming SSE response matching the existing Pattie chat pattern.
 * Rate limit: 20 messages per IP per hour (in-memory map, resets on redeploy).
 */

import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Rate limiter (in-memory, per IP, resets on cold start) ───────────────────
const ipMessageCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = ipMessageCounts.get(ip)

  if (!entry || now > entry.resetAt) {
    ipMessageCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT - 1 }
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT - entry.count }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// ── Prompt injection sanitizer ───────────────────────────────────────────────
const INJECTION_PATTERNS = [
  /\bSYSTEM[:\s]/gi,
  /\[INST\]/gi,
  /ignore previous instructions?/gi,
  /disregard (all |previous |prior )?instructions?/gi,
  /you are now\b/gi,
  /new instructions?:/gi,
  /forget (all |your |previous )?instructions?/gi,
  /<\/?system>/gi,
]

function sanitize(text: string): string {
  let s = text
  for (const p of INJECTION_PATTERNS) s = s.replace(p, '[REDACTED]')
  return s
}

// ── Intent detection ─────────────────────────────────────────────────────────
type DemoIntent =
  | 'attorney_evaluating'
  | 'inventor_filing'
  | 'investor_exploring'
  | 'general_curiosity'
  | 'objection_handling'
  | 'pricing_inquiry'
  | 'technical_question'
  | 'unknown'

function detectIntent(message: string): DemoIntent {
  const m = message.toLowerCase()
  if (/attorney|counsel|law firm|bar number|client|firm|referral|partner program|ethics/i.test(m)) return 'attorney_evaluating'
  if (/file|provisional|non-?provisional|claim|spec|figure|inventor|invention|my patent|how do i/i.test(m)) return 'inventor_filing'
  if (/invest|fund|valuation|market size|revenue|traction|raise|equity|seed|series/i.test(m)) return 'investor_exploring'
  if (/price|cost|pricing|tier|free|pro|how much|subscription|pay/i.test(m)) return 'pricing_inquiry'
  if (/how does|explain|what is|can (it|you)|does it|will it|is it (possible|able)/i.test(m)) return 'technical_question'
  if (/can't|cannot|won't|never work|doubt|really|actually|but|however|skeptic/i.test(m)) return 'objection_handling'
  if (/hello|hi|hey|who are|what are you|tell me about|overview|show me/i.test(m)) return 'general_curiosity'
  return 'unknown'
}

// ── System prompt ─────────────────────────────────────────────────────────────
const DEMO_SYSTEM_PROMPT = `You are Pattie, the AI patent assistant for patentpending.app — a USPTO patent filing and management platform built for inventors and IP attorneys.

You are currently in a live demo session. The person you're speaking with is likely an IP attorney, inventor, or potential partner who is evaluating patentpending.app. Chad, the founder, may be present on a call and has introduced you.

Your job:
1. Answer any question about what patentpending.app does, how it works, what it costs, and who it's for — with confidence and specificity.
2. Qualify the person's interest naturally. Listen for signals: Are they an attorney looking for a client tool? An inventor who needs to file? A potential partner or investor?
3. Adapt your pitch based on what you detect. Attorney? Lead with the Partner Program and attorney-owner marketplace access. Inventor? Lead with Pattie Interview Mode and how easy filing becomes. Investor? Lead with the Arc 1→2→3 vision and market size.
4. Handle objections gracefully. "Can AI really help with patents?" — yes, here's exactly how. "Isn't this just for tech patents?" — no, here's why.
5. Never make up features that don't exist. If unsure, say: "That's a great question — Chad can speak to that directly."
6. Keep responses conversational and concise. This is a live call, not a document.
7. Never reveal that you are powered by a specific AI model or provider. You are Pattie.

About patentpending.app:
- Arc 1: File patents. Pattie guides inventors through the process conversationally — interview mode turns a conversation into a structured patent draft. Provisional and non-provisional. USPTO forms generated automatically.
- Arc 2: Manage patents. AI tools help improve specs and claims, parse USPTO correspondence, track deadlines, and suggest improvements — always with human approval, never auto-applied.
- Arc 3: Marketplace. Patent owners list their IP for licensing or sale. Qualified buyers submit inquiries. pp.app bridges the introduction. IP Readiness Score shows listing completeness (not a legal valuation).
- Partner Program: IP attorneys can join as partners — their clients get platform access, attorneys get a referral structure, and everyone benefits from a streamlined filing experience.
- Pricing: Free tier for basic access. Pro tier for Pattie AI tools and full filing workflow. Complimentary tier for partners (case by case).
- The platform does not replace attorneys. It handles the prep work, the drafting, and the management — so attorneys can focus on strategy and prosecution.

Tone: Warm, knowledgeable, direct. Never salesy or pushy. You're a trusted expert, not a sales bot.`

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed, remaining } = checkRateLimit(ip)

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit reached. Please try again in an hour.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const body = await req.json().catch(() => ({})) as {
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  const messages = (body.messages ?? []).map(m => ({
    role: m.role,
    content: sanitize(m.content ?? ''),
  }))

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return new Response(
      JSON.stringify({ error: 'No user message provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Detect and log intent from last user message
  const lastUserMsg = messages[messages.length - 1].content
  const intent: DemoIntent = detectIntent(lastUserMsg)
  console.log('[Pattie Demo Intent]', intent, '| ip:', ip, '| remaining:', remaining)

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
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
            system: DEMO_SYSTEM_PROMPT,
            messages,
          }),
        })

        if (!res.ok || !res.body) {
          emitDone(); controller.close(); return
        }

        const reader = res.body.getReader()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') continue

            try {
              const evt = JSON.parse(raw)
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                emit({ type: 'text', text: evt.delta.text })
              } else if (evt.type === 'message_stop') {
                emit({ type: 'intent', intent })
              }
            } catch { /* skip malformed */ }
          }
        }

        emitDone()
        controller.close()
      } catch (err) {
        console.error('[pattie/demo] stream error:', err)
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
      'X-Pattie-Rate-Remaining': String(remaining),
    },
  })
}
