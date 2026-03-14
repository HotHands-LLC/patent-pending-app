import { SupabaseClient } from "@supabase/supabase-js"
/**
 * lib/ai-budget.ts
 * AI token usage tracking + monthly budget checking.
 *
 * Usage:
 *   await logAiUsage(supabase, { userId, patentId, feature, tokensUsed, model })
 *   const budget = await checkAiBudget(supabase, userId)
 */

// Cost estimates per 1K tokens (conservative ballparks)
const COST_PER_1K: Record<string, number> = {
  'claude-sonnet-4-6':  0.003,
  'claude-opus-4':      0.015,
  'gemini-2.5-pro':     0.002,
  'gemini-2.5-flash':   0.0003,
  default:              0.003,
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
  /** Always true — we never hard-block AI features */
  allowed: true
  /** Non-null when usage is 80%+ of monthly budget */
  warning: string | null
  budget: number       // monthly budget in USD
  used: number         // this month's spend in USD
  remaining: number
  percentUsed: number
}

/**
 * Log AI token usage after any Gemini or Claude API call.
 * Account-level: rows are keyed by user_id. patent_id is optional metadata.
 * Non-blocking — never throws.
 */
export async function logAiUsage(
  supabase: SupabaseClient<any, any, any>,  // eslint-disable-line @typescript-eslint/no-explicit-any
  log: AiUsageLog
): Promise<void> {
  try {
    const estimatedCost = estimateCost(log.tokensUsed, log.model)
    await supabase.from('ai_token_usage').insert({
      user_id:            log.userId,
      patent_id:          log.patentId ?? null,
      feature:            log.feature,
      tokens_used:        log.tokensUsed,
      estimated_cost_usd: estimatedCost,
      model:              log.model ?? null,
    })
  } catch (err) {
    console.error('[ai-budget] logAiUsage error (non-blocking):', err)
  }
}

/**
 * Check a user's monthly AI budget status.
 *
 * ACCOUNT-LEVEL: sums all ai_token_usage rows for this user in the current
 * calendar month — NOT per-patent.
 *
 * Rules:
 *  - Complimentary tier: always allowed, no warning (immune)
 *  - 0–79%: allowed, no warning
 *  - 80–99%: allowed, soft warning
 *  - 100%+:  allowed (NEVER blocked), soft nudge
 *
 * Budget = subscription_amount * (monthly_ai_budget_pct / 100)
 */
export async function checkAiBudget(
  supabase: SupabaseClient<any, any, any>,  // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string
): Promise<BudgetStatus> {
  try {
    const { data: profile } = await supabase
      .from('patent_profiles')
      .select('monthly_ai_budget_pct, subscription_status')
      .eq('id', userId)
      .single()

    // Complimentary tier is fully immune — no budget check
    if (profile?.subscription_status === 'complimentary') {
      return { allowed: true, warning: null, budget: 0, used: 0, remaining: 0, percentUsed: 0 }
    }

    const budgetPct = profile?.monthly_ai_budget_pct ?? 10

    // Estimate MRR based on tier
    const mrr =
      profile?.subscription_status === 'pro' ? 19.99 : 0

    const budget = parseFloat(((mrr * budgetPct) / 100).toFixed(4))

    // Sum this calendar month's usage — ACCOUNT-LEVEL (all patents, all features)
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { data: rows } = await supabase
      .from('ai_token_usage')
      .select('estimated_cost_usd')
      .eq('user_id', userId)                        // account-level, NOT filtered by patent_id
      .gte('created_at', monthStart.toISOString())

    const used = parseFloat(
      ((rows ?? []).reduce((sum: number, r: { estimated_cost_usd?: number }) => sum + (r.estimated_cost_usd ?? 0), 0)).toFixed(6)
    )

    const remaining  = Math.max(0, budget - used)
    const percentUsed = budget > 0 ? Math.round((used / budget) * 100) : 0
    const ratio = budget > 0 ? used / budget : 0

    // Soft warning — NEVER block
    let warning: string | null = null
    if (ratio >= 1.0) {
      warning = "You've reached your monthly AI credit limit. Upgrade your plan to continue with unlimited access."
    } else if (ratio >= 0.8) {
      warning = "You're approaching your monthly AI credit limit. Upgrade your plan for unlimited access."
    }

    return { allowed: true, warning, budget, used, remaining, percentUsed }
  } catch (err) {
    console.error('[ai-budget] checkAiBudget error:', err)
    // On error: always allow, never surface an error to the user
    return { allowed: true, warning: null, budget: 0, used: 0, remaining: 0, percentUsed: 0 }
  }
}
