/**
 * lib/ai-router.ts — Smart AI model router for cost optimization
 *
 * Routes tasks to the cheapest capable model:
 *   cheap_task      → gpt-4o-mini    (~$0.00015/1k in, $0.0006/1k out) — Q&A, summaries, notifications
 *   standard_task   → claude-sonnet-4-6 (~$0.003/1k) — drafting, Pattie dashboard
 *   critical_patent → claude-opus-4  (manual trigger only) — pre-filing review
 *   fast_summary    → gemini-2.5-flash (~$0.0001/1k) — cron outputs, radar
 *
 * AI-Router — cont.55
 */

export type AITaskType =
  | 'cheap_task'       // Q&A, notifications, simple summaries → gpt-4o-mini
  | 'standard_task'    // Drafting, Pattie dashboard, reasoning → claude-sonnet-4-6
  | 'critical_patent'  // Pre-filing review, manual only → claude-opus-4
  | 'fast_summary'     // Cron outputs, radar, quick reads → gemini-2.5-flash

export type AIProvider = 'openai' | 'anthropic' | 'gemini'

export interface AIRouteResult {
  provider: AIProvider
  model: string
  tier: 'cheap' | 'standard' | 'critical' | 'fast'
  apiUrl: string
  reason: string
  estimatedCostPer1kTokens: number // input cost in USD
}

// Model constants
const GPT_4O_MINI   = 'gpt-4o-mini'
const CLAUDE_SONNET = 'claude-sonnet-4-6'
const CLAUDE_OPUS   = 'claude-opus-4'
const GEMINI_FLASH  = 'gemini-2.5-flash'

const ROUTES: Record<AITaskType, AIRouteResult> = {
  cheap_task: {
    provider: 'openai',
    model: GPT_4O_MINI,
    tier: 'cheap',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    reason: 'Q&A / summary / notification — GPT-4o mini (cheapest capable)',
    estimatedCostPer1kTokens: 0.00015,
  },
  standard_task: {
    provider: 'anthropic',
    model: CLAUDE_SONNET,
    tier: 'standard',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    reason: 'Drafting / Pattie dashboard — Claude Sonnet 4.6',
    estimatedCostPer1kTokens: 0.003,
  },
  critical_patent: {
    provider: 'anthropic',
    model: CLAUDE_OPUS,
    tier: 'critical',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    reason: 'Pre-filing review — Claude Opus 4 (manual trigger only)',
    estimatedCostPer1kTokens: 0.015,
  },
  fast_summary: {
    provider: 'gemini',
    model: GEMINI_FLASH,
    tier: 'fast',
    apiUrl: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH}:generateContent`,
    reason: 'Cron output / radar summary — Gemini 2.5 Flash',
    estimatedCostPer1kTokens: 0.0001,
  },
}

/**
 * Route a task type to the appropriate AI model configuration.
 * Use this for all new AI calls in the app.
 */
export function routeAITask(taskType: AITaskType): AIRouteResult {
  return ROUTES[taskType]
}

/**
 * Build OpenAI-compatible request headers for a routed task.
 * Works for openai provider only.
 */
export function getOpenAIHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
  }
}

/**
 * Build Anthropic request headers for a routed task.
 */
export function getAnthropicHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
    'anthropic-version': '2023-06-01',
  }
}

/**
 * Convenience: call gpt-4o-mini for cheap tasks (Q&A, summaries, notifications).
 * Returns the completion text or throws on error.
 */
export async function callCheapTask(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 512,
): Promise<string> {
  const route = ROUTES.cheap_task
  const res = await fetch(route.apiUrl, {
    method: 'POST',
    headers: getOpenAIHeaders(),
    body: JSON.stringify({
      model: route.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[ai-router] cheap_task failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content?.trim() ?? ''
}

/**
 * Convenience: call gemini-2.5-flash for fast summaries (cron outputs, radar).
 * Returns the text or throws on error.
 */
export async function callFastSummary(
  prompt: string,
  maxTokens = 512,
): Promise<string> {
  const route = ROUTES.fast_summary
  const key = process.env.GEMINI_API_KEY ?? ''
  const res = await fetch(`${route.apiUrl}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[ai-router] fast_summary failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
}
