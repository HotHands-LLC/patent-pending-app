import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import InvestorMarketplaceClient from './InvestorMarketplaceClient'

export const metadata: Metadata = {
  title: 'Invest in Patents | PatentPending',
  description: 'Discover early-stage patents open for investment. Earn a share of future revenue — starting from $25.',
  openGraph: {
    title: 'Invest in Patents | PatentPending',
    description: 'Discover early-stage patents open for investment. Earn a share of future revenue — starting from $25.',
    type: 'website',
    siteName: 'PatentPending',
  },
}

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

export interface InvestorListing {
  id: string
  title: string
  slug: string | null
  marketplace_tagline: string | null
  marketplace_description: string | null
  stage: string
  status: string
  funding_goal_usd: number
  total_raised_usd: number
  rev_share_available_pct: number
  investment_open: boolean
  created_at: string
  // from claw_patents join
  novelty_score: number | null
  commercial_score: number | null
  composite_score: number | null
}

export default async function MarketplacePage() {
  // Primary: investment_open with tagline
  let { data: listings } = await supabaseService
    .from('patents')
    .select(`
      id, title, slug, marketplace_tagline, marketplace_description,
      stage, status, funding_goal_usd, total_raised_usd,
      rev_share_available_pct, investment_open, created_at
    `)
    .eq('investment_open', true)
    .not('marketplace_tagline', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fallback: all investment_open if fewer than 3 with tagline
  if (!listings || listings.length < 3) {
    const { data: fallback } = await supabaseService
      .from('patents')
      .select(`
        id, title, slug, marketplace_tagline, marketplace_description,
        stage, status, funding_goal_usd, total_raised_usd,
        rev_share_available_pct, investment_open, created_at
      `)
      .eq('investment_open', true)
      .order('created_at', { ascending: false })
      .limit(50)
    listings = fallback ?? []
  }

  // Enrich with claw_patents scores (left join equivalent)
  const patentIds = (listings ?? []).map(p => p.id)
  let scoreMap: Record<string, { novelty_score: number | null; commercial_score: number | null; composite_score: number | null }> = {}
  if (patentIds.length) {
    const { data: clawRows } = await supabaseService
      .from('claw_patents')
      .select('patent_id, novelty_score, commercial_score, composite_score')
      .in('patent_id', patentIds)
    for (const r of clawRows ?? []) {
      scoreMap[r.patent_id] = {
        novelty_score: r.novelty_score,
        commercial_score: r.commercial_score,
        composite_score: r.composite_score,
      }
    }
  }

  const enriched: InvestorListing[] = (listings ?? []).map(p => ({
    ...p,
    novelty_score: scoreMap[p.id]?.novelty_score ?? null,
    commercial_score: scoreMap[p.id]?.commercial_score ?? null,
    composite_score: scoreMap[p.id]?.composite_score ?? null,
  }))

  return <InvestorMarketplaceClient listings={enriched} />
}
