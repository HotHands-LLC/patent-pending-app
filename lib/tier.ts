/**
 * lib/tier.ts — Tier utility for server-side feature gating
 *
 * Tier hierarchy:
 *   free        → 1 patent, limited features
 *   pro         → 10 patents, all features except Marketplace has 1-listing cap
 *   complimentary → unlimited patents + unlimited Marketplace listings
 *   attorney    → is_attorney flag (separate from subscription_status)
 *                 On patents they OWN: gets basic Pro access (pattie, claims, zip)
 *                 No Marketplace, no Stripe prompt
 *                 Correspondence: full write access
 *                 Patent count limit: 1 (same as free)
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type SubscriptionStatus = 'free' | 'pro' | 'complimentary'

export interface TierInfo {
  subscription_status: SubscriptionStatus
  is_attorney: boolean
}

/** Fetch tier info for a user from patent_profiles */
export async function getUserTierInfo(userId: string): Promise<TierInfo> {
  const { data } = await supabaseService
    .from('patent_profiles')
    .select('subscription_status, is_attorney')
    .eq('id', userId)
    .single()
  return {
    subscription_status: (data?.subscription_status ?? 'free') as SubscriptionStatus,
    is_attorney: data?.is_attorney ?? false,
  }
}

/**
 * Returns true if user has Pro-level access for a given feature context.
 * context.isOwner: true when the user owns the patent being accessed.
 * context.feature: optional — some features (marketplace) don't extend to attorneys.
 */
export function isPro(
  info: TierInfo,
  context?: { isOwner?: boolean; feature?: TierFeature }
): boolean {
  // Full Pro and Complimentary always pass
  if (info.subscription_status === 'pro' || info.subscription_status === 'complimentary') return true
  // Attorney gets basic Pro on their OWN patents (not marketplace)
  if (info.is_attorney && context?.isOwner) return true
  return false
}

export type TierFeature =
  | 'pattie'
  | 'pattie_interview'
  | 'claims_edit'
  | 'zip_download'
  | 'correspondence_write'
  | 'marketplace_list'
  | 'cover_sheet_export'
  | 'ids_draft_export'

/**
 * Patent count limits per tier.
 * Attorney: capped at 1 (same as free) — they pay or get comped for more.
 */
const PATENT_LIMITS: Record<SubscriptionStatus | 'attorney', number> = {
  free: 1,
  pro: 10,
  complimentary: Infinity,
  attorney: 1,
}

export function getPatentLimit(info: TierInfo): number {
  if (info.subscription_status === 'pro' || info.subscription_status === 'complimentary') {
    return PATENT_LIMITS[info.subscription_status]
  }
  return 1 // free and attorney both capped at 1
}

/** Count the user's existing owned patents */
export async function countUserPatents(userId: string): Promise<number> {
  const { count } = await supabaseService
    .from('patents')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
  return count ?? 0
}

/** Standard 403 response for feature tier blocks */
export function tierRequiredResponse(feature: TierFeature): NextResponse {
  return NextResponse.json({
    error: 'This feature requires PatentPending Pro.',
    code: 'TIER_REQUIRED',
    requiredTier: 'pro',
    feature,
  }, { status: 403 })
}

/** Standard 403 response for patent count limit */
export function patentLimitResponse(current: number, max: number): NextResponse {
  return NextResponse.json({
    error: `You've reached your patent limit (${current}/${max}). Upgrade to Pro to manage up to 10 patents.`,
    code: 'PATENT_LIMIT',
    current,
    max,
    requiredTier: 'pro',
  }, { status: 403 })
}

/** Standard 403 response for marketplace listing limit (Pro: 1 max) */
export function marketplaceLimitResponse(): NextResponse {
  return NextResponse.json({
    error: 'Pro accounts can list one patent on the Marketplace. Upgrade to Complimentary for unlimited listings.',
    code: 'MARKETPLACE_LIMIT',
    current: 1,
    max: 1,
  }, { status: 403 })
}
