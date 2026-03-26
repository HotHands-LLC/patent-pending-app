/**
 * lib/llm-router.ts — Smart LLM task router
 * Routes tasks to the cheapest capable model.
 * Fast tasks → Gemini Flash (~$0.0001/1k)
 * Standard tasks → Sonnet/Gemini Pro (~$0.003/1k)
 * Deep tasks → Gemini 2.5 Pro (~$0.015/1k)
 *
 * LLM-Task-Router — cont.54
 */

export type TaskType =
  | 'quick_analysis'
  | 'content_generation'
  | 'radar_reply'
  | 'pattie_chat'
  | 'claims_refinement'
  | 'spec_polish'
  | 'prior_art_research'
  | 'code_generation'
  | 'session_summary'

export type LLMProvider = 'anthropic' | 'gemini'

export interface RouteResult {
  provider: LLMProvider
  model: string
  tier: 'fast' | 'standard' | 'deep'
  apiUrl: string
  reason: string
}

const GEMINI_FLASH  = 'gemini-2.5-flash'
const GEMINI_PRO    = 'gemini-2.5-pro'  // was gemini-2.5-pro — use flash for standard too
const CLAUDE_HAIKU  = 'claude-haiku-4-5'
const CLAUDE_SONNET = 'claude-sonnet-4-6'

export function routeTask(taskType: TaskType, anthropicBlocked = false): RouteResult {
  const geminiFlash: RouteResult = {
    provider: 'gemini', model: GEMINI_FLASH, tier: 'fast',
    apiUrl: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH}:generateContent`,
    reason: 'Fast task — Gemini Flash',
  }
  const geminiPro: RouteResult = {
    provider: 'gemini', model: GEMINI_PRO, tier: 'deep',
    apiUrl: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_PRO}:generateContent`,
    reason: 'Deep research — Gemini Pro',
  }
  const claudeSonnet: RouteResult = {
    provider: 'anthropic', model: CLAUDE_SONNET, tier: 'standard',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    reason: 'Reasoning task — Claude Sonnet',
  }
  const geminiStandard: RouteResult = {
    provider: 'gemini', model: GEMINI_FLASH, tier: 'standard',
    apiUrl: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH}:generateContent`,
    reason: 'Anthropic blocked — Gemini fallback',
  }

  const routes: Record<TaskType, RouteResult> = {
    quick_analysis:    geminiFlash,
    content_generation: geminiFlash,
    radar_reply:       geminiFlash,
    session_summary:   geminiFlash,
    prior_art_research: geminiPro,
    pattie_chat:       anthropicBlocked ? geminiStandard : claudeSonnet,
    claims_refinement: anthropicBlocked ? geminiStandard : claudeSonnet,
    spec_polish:       anthropicBlocked ? geminiStandard : claudeSonnet,
    code_generation:   anthropicBlocked ? geminiStandard : claudeSonnet,
  }

  return routes[taskType]
}

/** Check if Anthropic is currently blocked in DB */
export async function isAnthropicBlocked(): Promise<boolean> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
    const { data } = await svc.from('llm_budget_config').select('is_blocked, blocked_until').eq('provider', 'anthropic').single()
    if (!data?.is_blocked) return false
    if (data.blocked_until && new Date(data.blocked_until) < new Date()) return false
    return true
  } catch { return false }
}
