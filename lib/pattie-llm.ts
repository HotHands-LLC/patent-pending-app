/**
 * lib/pattie-llm.ts — Unified Pattie LLM wrapper with Anthropic → Gemini fallback
 *
 * Rule: Pattie chat must NEVER show an error to users due to API limits.
 * If Anthropic is blocked, silently fall back to Gemini.
 *
 * Pattie-Uptime-Guard — cont.54
 */
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

/** Check if a provider is known-blocked (fast DB lookup) */
async function isProviderBlocked(provider: 'anthropic' | 'gemini'): Promise<boolean> {
  try {
    const { data } = await getSvc()
      .from('llm_budget_config')
      .select('is_blocked, blocked_until')
      .eq('provider', provider)
      .single()
    if (!data?.is_blocked) return false
    if (data.blocked_until && new Date(data.blocked_until) < new Date()) {
      // Block expired — auto-clear
      await getSvc().from('llm_budget_config').update({ is_blocked: false, blocked_until: null }).eq('provider', provider)
      return false
    }
    return true
  } catch { return false }
}

/** Mark a provider as blocked until a given date */
async function markBlocked(provider: string, until: Date, error: string) {
  try {
    await getSvc().from('llm_budget_config').update({
      is_blocked: true, blocked_until: until.toISOString(), last_error: error.slice(0, 300), updated_at: new Date().toISOString(),
    }).eq('provider', provider)
  } catch { /* non-blocking */ }
}

function isLimitError(message: string): boolean {
  return message.includes('usage limits') || message.includes('rate limit') || message.includes('overloaded') || message.includes('quota')
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

/**
 * Generate a Pattie response with automatic Anthropic → Gemini fallback.
 * Returns a streaming Response if stream=true, or text if stream=false.
 */
export async function callPattieWithFallback(opts: {
  messages: ChatMessage[]
  systemPrompt: string
  stream?: boolean
  maxTokens?: number
}): Promise<{ stream: ReadableStream | null; text: string; provider: 'anthropic' | 'gemini'; fallback: boolean }> {
  const { messages, systemPrompt, stream = false, maxTokens = 1024 } = opts
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY

  const anthropicBlocked = await isProviderBlocked('anthropic')

  // Try Anthropic first (unless known-blocked)
  if (anthropicKey && !anthropicBlocked) {
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, stream, system: systemPrompt, messages }),
      })

      if (res.ok) {
        if (stream) return { stream: res.body, text: '', provider: 'anthropic', fallback: false }
        const d = await res.json()
        return { stream: null, text: d?.content?.[0]?.text ?? '', provider: 'anthropic', fallback: false }
      }

      // Check if it's a limit error
      const errText = await res.text()
      if (isLimitError(errText)) {
        // Block for 24h and fall through to Gemini
        const until = new Date(Date.now() + 24 * 3600000)
        await markBlocked('anthropic', until, errText.slice(0, 200))
        console.warn('[pattie-llm] Anthropic limit hit — falling back to Gemini')
      } else {
        throw new Error(`Anthropic error ${res.status}: ${errText.slice(0, 100)}`)
      }
    } catch (e) {
      const msg = (e as Error).message ?? ''
      if (!isLimitError(msg)) throw e // re-throw non-limit errors
    }
  }

  // Gemini fallback
  if (!geminiKey) throw new Error('Both Anthropic and Gemini unavailable')

  const geminiMessages = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
  const body = JSON.stringify({
    contents: geminiMessages,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  })

  const res = await fetch(`${GEMINI_API_BASE}?key=${geminiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  })

  if (!res.ok) throw new Error(`Gemini fallback error ${res.status}`)
  const d = await res.json()
  const text = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return { stream: null, text, provider: 'gemini', fallback: true }
}
