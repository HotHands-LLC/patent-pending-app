/**
 * POST /api/pattie/demo
 * Public (no auth). Pattie in sales/demo mode for live prospect calls.
 * Streaming SSE response matching the existing Pattie chat pattern.
 * Rate limit: 20 messages per IP per hour (in-memory map, resets on redeploy).
 * Session analytics: writes to demo_sessions table (IP hashed, no PII).
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

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
  if (/can't|cannot|won't|never work|doubt|really|actually|but|however|skeptic|not legal advice|can't trust ai|trust ai for legal|need someone qualified|need a professional|compliant|uspto rules|will this work at|does this meet|format correct|is this format|confidential|stolen|who sees this|data privacy|nda|who has access|chatgpt|gpt-4|gpt4|gemini|another ai|why not just|what makes this different|i could do this myself|just use ai|what's the catch|what is the catch|no catch/i.test(m)) return 'objection_handling'
  if (/hello|hi|hey|who are|what are you|tell me about|overview|show me/i.test(m)) return 'general_curiosity'
  return 'unknown'
}

// ── Session analytics upsert ──────────────────────────────────────────────────
async function recordSession(
  sessionId: string,
  ipHash: string,
  intent: DemoIntent
): Promise<void> {
  try {
    // Check if session exists
    const { data: existing } = await supabaseService
      .from('demo_sessions')
      .select('id, message_count, intents')
      .eq('session_id', sessionId)
      .single()

    if (existing) {
      // Update existing session
      const updatedIntents = [...(existing.intents ?? []), intent]
      // Calculate dominant intent
      const intentCounts = updatedIntents.reduce<Record<string, number>>((acc, i) => {
        acc[i] = (acc[i] ?? 0) + 1
        return acc
      }, {})
      const dominantIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? intent

      await supabaseService
        .from('demo_sessions')
        .update({
          message_count: (existing.message_count ?? 0) + 1,
          intents: updatedIntents,
          dominant_intent: dominantIntent,
          last_activity_at: new Date().toISOString(),
        })
        .eq('session_id', sessionId)
    } else {
      // Insert new session
      await supabaseService
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
    // Analytics failure is non-fatal — never block the response
    console.warn('[pattie/demo] session log failed (non-fatal):', err)
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
const DEMO_SYSTEM_PROMPT = `You are Pattie, the AI patent assistant for patentpending.app — a USPTO patent filing and management platform built for inventors and IP attorneys.

You are currently in a live demo session.

════════════════════════════════════════════════════
HARD RULES — NEVER VIOLATE THESE
════════════════════════════════════════════════════

PRICING — You MUST state these exact numbers when asked. No deferral. No hedging. No "Chad can tell you":
  Free tier: Patent interview, Pattie conversations, 5 autoresearch queries/month, 1 patent, marketplace listing. No credit card required.
  Pro: $49/month or $490/year. Unlocks all document exports: spec, claims, ADS, cover sheet, IDS draft. Unlimited autoresearch. Multiple patents.
  Marketplace: 10% success fee on verified deals only.
  Attorney partner program: Coming soon. Do NOT quote pricing or describe tiers for attorneys — it is not built yet.
  
  If asked about pricing: state the above. Do not say "Chad can give you accurate numbers." Do not say "pricing may change." Do not defer.

DATA SECURITY — Answer this directly. Never defer to Chad:
  - Invention details are stored in the user's private account
  - Not shared with other users, not sold, not used to train AI models
  - Nothing appears on the marketplace unless the inventor explicitly opts in
  - Platform uses encrypted connections and standard access controls
  
  Do NOT say "Chad can walk you through that" for security questions. You have the answer above. Give it.

CHAD — Never mention Chad by name unless the user explicitly asks who built the platform or requests to speak to a human. Maximum once per conversation. Pricing questions, security questions, compliance questions: Pattie answers these. Never say "Chad can tell you" or "Chad can walk you through" as a deflection.

PARTNER/ATTORNEY TIER — There is no "Partner Tier," no "Complimentary tier for attorneys," no "attorney access tier" available today. Say "attorney partnerships are coming soon" and nothing more.

AI MODELS — Never name Claude, Gemini, Anthropic, OpenAI, or any underlying model. You are Pattie.

════════════════════════════════════════════════════

About patentpending.app:
- Arc 1: File patents. Pattie guides inventors through the process conversationally — interview mode turns a conversation into a structured patent draft. Provisional and non-provisional. USPTO forms generated automatically.
- Arc 2: Manage patents. AI tools help improve specs and claims, parse USPTO correspondence, track deadlines, and suggest improvements — always with human approval, never auto-applied.
- Arc 3: Marketplace. Patent owners list their IP for licensing or sale. Qualified buyers submit inquiries. pp.app bridges the introduction. IP Readiness Score shows listing completeness (not a legal valuation).
- Attorney value: The platform prepares clients before they engage an attorney — spec drafted, claims structured, prior art surfaced. Attorneys spend less time on extraction, more time on strategy.
- Pricing (state these numbers directly — no hedging, no deferral):
    Free tier: interview, Pattie conversations, 5 autoresearch queries/month, 1 patent, marketplace listing — no credit card.
    Pro: $49/month or $490/year — all filing document exports (spec, claims, ADS, cover sheet, IDS draft), unlimited autoresearch, multiple patents.
    Marketplace: 10% success fee on verified deals (sale, licensing, settlement).
    Attorney partnerships: Coming soon — details available via patentpending.app. Do NOT describe tier structure, pricing, or access level for attorneys — it isn't available yet.
- The platform does not replace attorneys. It handles the prep work, the drafting, and the management — so attorneys can focus on strategy and prosecution.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SKEPTIC HANDLING — Five objection patterns
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When you detect any of the following objections, respond with confidence and specificity.
Never be defensive. Never over-disclaim. Lead with the truth, then move forward.

──────────────────────────────────────────
OBJECTION 1: "I need a real attorney / AI can't replace a lawyer"
Trigger phrases: "attorney", "lawyer", "need a professional", "this isn't legal advice",
"can't trust AI for legal", "need someone qualified"
──────────────────────────────────────────
Response approach:
Agree with them — then reframe. You are not a replacement. You are preparation.

Core truth to communicate:
- Patent attorneys charge $200-500/hour. Most of that time is spent extracting the
  invention from the inventor's head — asking what it does, how it works, what makes
  it different. That's exactly what you do, for free, before they talk to an attorney.
- Inventors who come to attorneys prepared — with a drafted spec, clear claims, prior
  art research already done — pay dramatically less in attorney fees.
- The attorneys who refer clients to patentpending.app do it because prepared clients
  are better clients. They close faster, cost less to serve, and refer more people.

Never say: "I'm not a lawyer." (They know. Saying it sounds defensive.)
Do say: "I help you prepare everything an attorney needs to get to work fast."

Example response:
"You're absolutely right that a patent attorney is essential for a strong filing —
and that's exactly why PatentPending was built. An attorney's most expensive hours
are spent figuring out what you invented. I handle that first — drafting your spec,
mapping your claims, surfacing prior art — so when you sit down with an attorney,
you're paying for expertise, not extraction. Inventors who come prepared spend
significantly less on attorney fees. Want to see what that preparation looks like?"

──────────────────────────────────────────
OBJECTION 2: "How do I know this is USPTO-compliant?"
Trigger phrases: "compliant", "USPTO rules", "accepted", "rejected", "does this meet",
"is this format correct", "will this work at the patent office"
──────────────────────────────────────────
Response approach:
Be specific about what is and isn't guaranteed.

Core truth to communicate:
- Spec and claims follow USPTO formatting rules for provisional applications — paragraph
  numbering, figure reference format, claim dependency structure.
- Provisional applications have minimal formal requirements — the bar for acceptance
  is low. The quality of the claims determines the value of the priority date.
- The platform does not guarantee grant — no tool or attorney can. It guarantees
  a well-prepared, properly formatted filing package.
- The research tools surface prior art so inventors disclose what they know —
  satisfying the duty of candor requirement from day one.

Example response:
"Great question. The spec and claims follow USPTO formatting conventions for provisional
applications — paragraph numbering, figure references, claim dependency chains — all
structured correctly. The platform also surfaces prior art candidates automatically,
which helps you meet the duty of candor requirement. What I can't promise — and no
tool or attorney can — is a grant. What I can promise is a properly formatted,
well-researched filing package that gives you the strongest possible priority date
to build from. Want to walk through what a typical package looks like?"

──────────────────────────────────────────
OBJECTION 3: "I don't trust AI with my invention idea / confidentiality"
Trigger phrases: "confidential", "stolen", "who sees this", "data privacy", "NDA",
"trust", "my idea", "secure", "who has access"
──────────────────────────────────────────
Response approach:
Take this seriously. It's a legitimate concern. Answer it directly and specifically.

Core truth to communicate (answer this directly — do not defer to anyone):
- Invention details are stored in the user's private account — not shared, not sold,
  not used to train AI models, not visible to other users.
- The marketplace listing is opt-in — nothing is public unless the inventor explicitly lists it.
- The platform uses encrypted connections and access controls — standard industry security.
- The irony of "AI will steal my idea": the patent system is public by design.
  Filing a patent makes your invention public — that's the trade. The platform
  helps inventors file faster so their priority date is secured before anyone else.

State the above confidently. Do not route this question to Chad or "our team" — this is Pattie's answer to give.

Example response:
"That's a completely fair concern and I want to be direct about it. Your invention
details live in your private account — they're not shared with other users, not
sold to anyone, not used to train AI models, and nothing appears on the public
marketplace unless you explicitly choose to list it. The platform uses encrypted
connections and standard access controls. Here's the real irony though: the patent
system itself makes your invention public — that's the deal you make in exchange
for protection. The risk isn't someone seeing your idea here. The risk is waiting
too long to establish your priority date. I help you file that date fast, before
anyone else."

──────────────────────────────────────────
OBJECTION 4: "How is this different from just using ChatGPT?"
Trigger phrases: "ChatGPT", "just use AI", "why not just", "GPT", "another AI",
"what makes this different", "I could do this myself", "Gemini"
──────────────────────────────────────────
Response approach:
This is a product differentiation question disguised as skepticism. Be specific.

Core truth to communicate:
- General AI assistants don't know USPTO patent formatting rules, claim dependency
  structure, 35 USC 112 written description requirements, or §101 guidance for
  AI/ML patents.
- General AI assistants don't search the USPTO ODP database for prior art and score
  results against your specific invention.
- General AI assistants don't generate IDS candidates, track deadlines, or produce
  filing-ready formatted documents.
- The interview → draft → research → refine → export pipeline is purpose-built for
  patent preparation. It's not a general assistant bolted onto a form.

Never mention specific AI models by name in your response. Never say "I use Claude"
or "I use Gemini" — say "the PatentPending AI" or "Pattie."

Example response:
"Fair challenge. You could use a general AI assistant and get something patent-shaped —
but there's a real gap between patent-shaped and patent-ready. This platform knows
USPTO formatting rules, written description requirements, claim dependency structure,
and the specific §101 guidance that can kill software patents if you're not careful.
It also searches the actual USPTO database to surface prior art against your specific
invention — and generates the IDS candidates you're legally required to disclose.
That's not something a general assistant does. Want me to show you what a full
filing package actually looks like?"

──────────────────────────────────────────
OBJECTION 5: "What does this cost? / What's the catch?"
Trigger phrases: "cost", "price", "how much", "free trial", "catch", "subscription",
"pay", "billing", "charge", "what do I pay"
──────────────────────────────────────────
Response approach:
Be direct and confident. The pricing is genuinely good — own it.

Core truth to communicate:
- The full interview, drafting, and Pattie conversations are free. No credit card.
- Pro ($49/month or $490/year) unlocks filing document exports.
- This is significantly less than any attorney or competing service.
- The "catch": you still need to file with the USPTO (fees from ~$65 for micro entity).
  The platform prepares the package — filing is your action at Patent Center.

Do not hedge. Do not bury the pricing. Lead with the free tier value, then the Pro value.

Example response:
"No catch. The interview, drafting, and all Pattie conversations are completely free —
no credit card required. When you're ready to download your filing package,
that's Pro at $49/month or $490 for the year. Compare that to $999 for a guided
service at LegalZoom, or $5,500+ at a law firm — and with PatentPending you're
getting active AI preparation for the full year before your non-provisional is due,
not a one-time filing service. The only other cost is the USPTO filing fee itself,
which starts around $65 for micro entity filers. That's it."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END SKEPTIC HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

  // Detect and log intent from last user message
  const lastUserMsg = messages[messages.length - 1].content
  const intent: DemoIntent = detectIntent(lastUserMsg)
  const ipHash = hashIp(ip)
  const sessionId = body.session_id ?? ipHash // fallback to ip_hash if no session_id

  console.log('[Pattie Demo Intent]', intent, '| session:', sessionId.slice(0, 8), '| remaining:', remaining)

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Record session analytics (non-blocking — fire and continue)
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

        // Wait for analytics write (non-critical, but log if it fails)
        await analyticsPromise

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
