import { SupabaseClient } from "@supabase/supabase-js"
/**
 * lib/ai-budget.ts
 * AI token usage tracking + monthly budget checking.
 *
 * Usage:
 *   await logAiUsage(supabase, { userId, patentId, feature, tokensUsed, model })
 *   const budget = await checkAiBudget(supabase, userId)
 */

import { createClient } from '@supabase/supabase-js'

// Cost estimates per 1K tokens (conservative ballparks — adjust as models change)
const COST_PER_1K: Record<string, number> = {
  'claude-sonnet-4-6':           0.003,   // $3/M input, $15/M output — avg ~$0.003/1K
  'claude-opus-4':               0.015,
  'gemini-2.5-pro':              0.002,   // ~$2/M (estimate)
  'gemini-2.5-flash':            0.0003,
  default:                       0.003,
}

function estimateCost(tokens: number, model?: string): number {
  const rate = COST_PER_1K[model ?? 'default'] ?? COST_PER_1K.default
  return parseFloat(((tokens / 1000) * rate).toFixed(6))
}

export interface AiUsageLog {
  userId: string
  patentId?: string | null
  feature: string
  tokensUsed: number
  model?: string
}

export interface BudgetStatus {
  budget: number       // monthly budget in USD
  used: number         // this month's spend in USD
  remaining: number
  overBudget: boolean
  percentUsed: number
}

/**
 * Log AI token usage after any Gemini or Claude API call.
 * Non-blocking — never throws; errors are swallowed and logged.
 */
export async function logAiUsage(
  supabase: SupabaseClient<any, any, any>,
  log: AiUsageLog
): Promise<void> {
  try {
    const estimatedCost = estimateCost(log.tokensUsed, log.model)
    await supabase.from('ai_token_usage').insert({
      user_id:           log.userId,
      patent_id:         log.patentId ?? null,
      feature:           log.feature,
      tokens_used:       log.tokensUsed,
      estimated_cost_usd: estimatedCost,
      model:             log.model ?? null,
    })
  } catch (err) {
    console.error('[ai-budget] logAiUsage error (non-blocking):', err)
  }
}

/**
 * Check whether a user is over their monthly AI budget.
 * Budget = subscription_amount * (monthly_ai_budget_pct / 100)
 * Default: 10% of subscription MRR.
 */
export async function checkAiBudget(
  supabase: SupabaseClient<any, any, any>,
  userId: string
): Promise<BudgetStatus> {
  try {
    // Get profile for budget_pct + Stripe subscription amount
    const { data: profile } = await supabase
      .from('patent_profiles')
      .select('monthly_ai_budget_pct, subscription_status, stripe_customer_id')
      .eq('id', userId)
      .single()

    const budgetPct = profile?.monthly_ai_budget_pct ?? 10

    // Estimate MRR based on subscription tier
    const mrr =
      profile?.subscription_status === 'pro' ? 19.99 :
      profile?.subscription_status === 'complimentary' ? 19.99 :
      0

    const budget = parseFloat(((mrr * budgetPct) / 100).toFixed(4))

    // Sum this calendar month's usage
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { data: rows } = await supabase
      .from('ai_token_usage')
      .select('estimated_cost_usd')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())

    const used = parseFloat(
      ((rows ?? []).reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0)).toFixed(6)
    )

    const remaining = Math.max(0, budget - used)
    const overBudget = budget > 0 && used >= budget
    const percentUsed = budget > 0 ? Math.round((used / budget) * 100) : 0

    return { budget, used, remaining, overBudget, percentUsed }
  } catch (err) {
    console.error('[ai-budget] checkAiBudget error:', err)
    return { budget: 0, used: 0, remaining: 0, overBudget: false, percentUsed: 0 }
  }
}
