import { createClient } from '@supabase/supabase-js'

export type UserTier = 'free' | 'pro'

export interface SubscriptionInfo {
  tier: UserTier
  stripe_customer_id: string | null
  subscription_status: string
  subscription_period_end: string | null
}

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Get the subscription tier for a given user ID.
 * Returns 'pro' if subscription_status === 'pro' and period hasn't expired.
 * Returns 'free' otherwise.
 */
export async function getUserTier(userId: string): Promise<UserTier> {
  const info = await getUserSubscription(userId)
  if (
    info.subscription_status === 'pro' &&
    (info.subscription_period_end === null ||
      new Date(info.subscription_period_end) > new Date())
  ) {
    return 'pro'
  }
  return 'free'
}

/**
 * Full subscription info for a user.
 */
export async function getUserSubscription(userId: string): Promise<SubscriptionInfo> {
  const { data } = await supabaseService
    .from('patent_profiles')
    .select('stripe_customer_id, subscription_status, subscription_period_end')
    .eq('id', userId)
    .single()

  return {
    tier: (data?.subscription_status === 'pro' ? 'pro' : 'free') as UserTier,
    stripe_customer_id: data?.stripe_customer_id ?? null,
    subscription_status: data?.subscription_status ?? 'free',
    subscription_period_end: data?.subscription_period_end ?? null,
  }
}

/**
 * Feature gate constants — what Pro tier unlocks.
 */
export const PRO_FEATURES = {
  deep_research_pass: true,
  claude_refinement_pass: true,
  unlimited_revisions: true, // free = 2/patent
  mission_control: true,
} as const

export const FREE_REVISION_LIMIT = 2
