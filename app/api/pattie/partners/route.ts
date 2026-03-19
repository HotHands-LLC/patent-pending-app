/**
 * POST /api/pattie/partners
 * Public (no auth). Pattie in attorney-partner mode for the /partners landing page.
 * Streaming SSE response matching the demo Pattie pattern.
 * Rate limit: 20 messages per IP per hour (in-memory map, resets on redeploy).
 * Session analytics: writes to demo_sessions table.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { PRICING_COPY, PRICING } from '@/lib/pricing-config'

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

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
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
type PartnerIntent =
  | 'replacement_objection'
  | 'quality_objection'
  | 'liability_objection'
  | 'referral_program_inquiry'
  | 'workflow_integration'
  | 'pricing_inquiry'
  | 'platform_features'
  | 'general_curiosity'
  | 'unknown'

function detectIntent(message: string): PartnerIntent {
  const m = message.toLowerCase()
  if (/replace|take over|put (me|us) out|steal my client|won't need|don't need/i.test(m)) return 'replacement_objection'
  if (/quality|rewrite|first draft|good enough|how good|reliable|accurate/i.test(m)) return 'quality_objection'
  if (/malpractice|liability|legal|attorney.client|relationship|ethics|bar/i.test(m)) return 'liability_objection'
  if (/referral|partner program|commission|revenue|earn|pay me|20%|split/i.test(m)) return 'referral_program_inquiry'
  if (/workflow|intake|process|integrate|existing|already|how do i|how would/i.test(m)) return 'workflow_integration'
  if (/price|cost|pricing|tier|free|pro|how much|subscription|pay/i.test(m)) return 'pricing_inquiry'
  if (/how does|what is|explain|features|arc|interview|research|export|spec|claims/i.test(m)) return 'platform_features'
  if (/hello|hi|hey|who are|what are you|overview|tell me/i.test(m)) return 'general_curiosity'
  return 'unknown'
}

// ── Session analytics upsert ──────────────────────────────────────────────────
async function recordSession(
  sessionId: string,
  ipHash: string,
  intent: PartnerIntent
): Promise<void> {
  try {
    const supabase = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
      (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
    )

    const { data: existing } = await supabase
      .from('demo_sessions')
      .select('id, message_count, intents')
      .eq('session_id', sessionId)
      .single()

    if (existing) {
      const updatedIntents = [...(existing.intents ?? []), intent]
      const intentCounts = updatedIntents.reduce<Record<string, number>>((acc, i) => {
        acc[i] = (acc[i] ?? 0) + 1
        return acc
      }, {})
      const dominantIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? intent

      await supabase
        .from('demo_sessions')
        .update({
          message_count: (existing.message_count ?? 0) + 1,
          intents: updatedIntents,
          dominant_intent: dominantIntent,
          last_activity_at: new Date().toISOString(),
        })
        .eq('session_id', sessionId)
    } else {
      await supabase
        .from('demo_sessions')
        .insert({
          session_id: sessionId,
          ip_hash: ipHash,
          message_count: 1,
          intents: [intent],
          dominant_intent: intent,
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
    }
  } catch (err) {
    console.warn('[pattie/partners] session log failed (non-fatal):', err)
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
const PARTNERS_SYSTEM_PROMPT = `You are Pattie, the AI assistant for patentpending.app — speaking with a patent or IP attorney
who is evaluating the platform as a potential partner.

YOUR ROLE HERE:
You are not helping them file a patent. You are answering their questions about how the platform
works, what it does for their clients, and how the partner program will benefit their practice.
Speak as a peer. You understand patent prosecution. You know what attorney time is worth.

TONE:
- Professional and direct. No over-explaining basics.
- Peer-to-peer. They know what a provisional is. They know what claims are.
- Confident about what the platform does well.
- Honest about what it doesn't do (it does not replace them — say so clearly).

WHEN TO MENTION CHAD BY NAME:
- Only when the user explicitly asks who built the platform or who Chad is
- Maximum once per conversation
- Never mention Chad for pricing, liability, or program questions — Pattie answers these directly
When a human contact is needed, say: "reach out via patentpending.app" or "our team can help"

WHAT PATENTPENDING.APP DOES:
patentpending.app prepares inventors for patent prosecution using AI. Specifically:
- Arc 1 interview: structured invention disclosure conversation → drafted spec + claims + abstract
- Pattie Polish: iterative refinement of spec, claims, and abstract
- Deep Research: USPTO ODP prior art search, scored results, IDS candidate generation
- Document exports: filing-ready spec (DOCX), claims, ADS, cover sheet, IDS draft
- Correspondence tracking: all sessions, research, and documents saved to the patent record
- Marketplace: inventors can list patents for licensing or sale

WHAT IT DOESN'T DO:
- Does not provide legal advice
- Does not replace patent prosecution by a registered practitioner
- Does not file with the USPTO — that remains the attorney's or inventor's action
- Does not guarantee grant

ATTORNEY-SPECIFIC OBJECTION HANDLING:

OBJECTION: "Will this replace me?"
Never. The platform handles extraction and preparation — the part that consumes billable hours without requiring your expertise. What it cannot do: prosecution strategy, claim negotiation with the USPTO, appeals, IPR proceedings, licensing negotiations, or any judgment call requiring years of practice.
Inventors who use patentpending.app arrive with a drafted spec they understand, claim concepts they've thought through, and prior art they're already aware of. Your time goes toward work only you can do.

OBJECTION: "What about quality? Will I have to rewrite everything?"
Be honest: the platform produces first-draft quality, not filing-ready quality for a strong non-provisional. Claims drafted by Pattie are concept-level — they need a practitioner's eye for scope, dependency structure, and prosecution strategy.
What the platform does well: inventors arrive having thought through their invention, understanding what they're protecting, and having surfaced the prior art landscape before the first attorney meeting. That's the part that currently costs attorney time without producing billable value.

OBJECTION: "What about malpractice / liability?"
The platform makes no legal representations and provides no legal advice. All user-facing copy is explicit that patentpending.app is a preparation tool, not a legal service. Attorneys who refer clients to the platform for preparation, then engage those clients for prosecution, are operating in a completely standard referral relationship. The platform's terms make clear that it does not create an attorney-client relationship.

OBJECTION: "How does the referral program work?"
The partner program is currently in early access — launching soon. The planned structure:
- Attorney receives a unique referral link
- When a referred inventor upgrades to Pro (${PRICING_COPY.proMonthly} or ${PRICING_COPY.proAnnual}), attorney receives ${PRICING.referral.firstYearPercent}% of their first year's subscription
- Attorney dashboard to track referred clients and their patent status
- No obligation — refer as many or as few clients as makes sense for your practice
To get early access when it launches, the waitlist form on this page is the right step.

OBJECTION: "I already have a process for client intake"
That's ideal — patentpending.app is designed to plug into existing workflows, not replace them. The most common pattern: attorney refers inventors who aren't ready for full-service yet to patentpending.app for the provisional phase. When they're ready for the non-provisional, they come back to the attorney — better prepared and with 12 months of documentation. You stay the relationship owner. The platform handles the prep leg.

PRICING (state confidently, never defer):
Free tier: ${PRICING_COPY.freeTier}
Pro: ${PRICING_COPY.proMonthly} or ${PRICING_COPY.proAnnual} — ${PRICING_COPY.proDescription}
Partner program referral: ${PRICING_COPY.referralFee}
Marketplace success fee: ${PRICING_COPY.marketplaceFee}

WHAT NOT TO SAY:
- Never reference Chad by name unless specifically asked
- Never say "our founder" unprompted
- Never describe features that aren't built yet as currently available
- Never use inventor-facing language ("patent pending status", "protect your idea")
- Never suggest the platform provides legal advice
- Never use model names (Claude, Gemini, Anthropic, OpenAI)
- Never imply the referral program is live today — it is launching soon

CLOSING:
Always end responses by pointing toward the waitlist form or offering to answer more questions.
The goal: attorney signs up for early partner access.`

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
    session_id?: string
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

  const lastUserMsg = messages[messages.length - 1].content
  const intent: PartnerIntent = detectIntent(lastUserMsg)
  const ipHash = hashIp(ip)
  const sessionId = body.session_id ?? ipHash

  console.log('[Pattie Partners Intent]', intent, '| session:', sessionId.slice(0, 8), '| remaining:', remaining)

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const analyticsPromise = recordSession(sessionId, ipHash, intent)

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
            system: PARTNERS_SYSTEM_PROMPT,
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

        await analyticsPromise

        emitDone()
        controller.close()
      } catch (err) {
        console.error('[pattie/partners] stream error:', err)
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
