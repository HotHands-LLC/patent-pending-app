import { createClient } from '@supabase/supabase-js'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import DealPageClient from './DealPageClient'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

// SSR — load patent data server-side for SEO + OG
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const { data } = await supabaseService
    .from('patents')
    .select('title, deal_page_summary, marketplace_description, marketplace_tagline, status')
    .eq('slug', slug)
    .eq('arc3_active', true)
    .single()

  if (!data) return { title: 'Patent Not Found' }

  const statusLabel = data.status === 'granted' ? 'Issued Patent'
    : data.status === 'non_provisional' ? 'Patent Pending'
    : 'Patent Provisional'

  const metaDesc = data.marketplace_tagline
    ? data.marketplace_tagline.slice(0, 160)
    : data.marketplace_description
    ? data.marketplace_description.slice(0, 160)
    : (data.deal_page_summary ?? `Licensing opportunity: ${data.title}`).slice(0, 160)

  const metaTitle = data.marketplace_tagline
    ? `${data.title} — ${data.marketplace_tagline} | PatentPending`
    : `${data.title} — ${statusLabel} | PatentPending`

  // Task 5 — Open Graph / Social Share
  return {
    title: metaTitle,
    description: metaDesc,
    openGraph: {
      title: `${data.title} — PatentPending.app`,
      description: metaDesc,
      url: `https://patentpending.app/patents/${slug}`,
      type: 'website',
      siteName: 'PatentPending',
    },
    twitter: {
      card: 'summary',
      title: `${data.title} — PatentPending.app`,
      description: metaDesc,
    },
  }
}

export default async function DealPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const { data: patent } = await supabaseService
    .from('patents')
    .select(`
      id, title, slug, status, description, inventors, tags,
      claims_draft, deal_page_summary, deal_page_market,
      licensing_exclusive, licensing_nonexclusive, licensing_field_of_use,
      arc3_active, created_at,
      marketplace_description, marketplace_tagline,
      investment_open, stage, funding_goal_usd, total_raised_usd, rev_share_available_pct,
      novelty_narrative
    `)
    .eq('slug', slug)
    .eq('arc3_active', true)
    .single()

  if (!patent) notFound()

  // Fetch claw scores (if this patent was claw-invented)
  const { data: clawRow } = await supabaseService
    .from('claw_patents')
    .select('novelty_score, commercial_score, filing_complexity, composite_score, prior_art_citations')
    .eq('patent_id', patent.id)
    .single()

  // Count total investors (anonymized)
  const { count: investorCount } = await supabaseService
    .from('patent_investments')
    .select('id', { count: 'exact', head: true })
    .eq('patent_id', patent.id)
    .eq('status', 'confirmed')

  // Extract top 3 independent claims from claims_draft
  const topClaims: string[] = []
  if (patent.claims_draft) {
    const claimMatches = patent.claims_draft.match(/\d+\.\s[^\n]+(?:\n(?!\d+\.)[^\n]+)*/g) ?? []
    const independent = claimMatches.filter((c: string) => !/\bclaim\s+\d/i.test(c))
    topClaims.push(...independent.slice(0, 3).map((c: string) => c.replace(/^\d+\.\s*/, '').trim()))
  }

  // Parse prior art citations for "Why This Is Novel" section
  const priorArtCitations: Array<{ title?: string; gap?: string; patent_number?: string }> =
    (clawRow?.prior_art_citations as Array<{ title?: string; gap?: string; patent_number?: string }>) ?? []

  return (
    <DealPageClient
      patent={{
        id: patent.id,
        title: patent.title,
        slug: patent.slug,
        status: patent.status,
        description: patent.description,
        inventors: patent.inventors ?? [],
        tags: patent.tags ?? [],
        deal_page_summary: patent.deal_page_summary,
        deal_page_market: patent.deal_page_market,
        licensing_exclusive: patent.licensing_exclusive,
        licensing_nonexclusive: patent.licensing_nonexclusive,
        licensing_field_of_use: patent.licensing_field_of_use,
        marketplace_description: patent.marketplace_description ?? null,
        marketplace_tagline: patent.marketplace_tagline ?? null,
        investment_open: patent.investment_open ?? false,
        stage: patent.stage ?? 'provisional',
        funding_goal_usd: patent.funding_goal_usd ?? 0,
        total_raised_usd: patent.total_raised_usd ?? 0,
        rev_share_available_pct: patent.rev_share_available_pct ?? 0,
        novelty_narrative: patent.novelty_narrative ?? null,
        created_at: patent.created_at,
        // Scores (investor-friendly labels handled in client)
        novelty_score: clawRow?.novelty_score ?? null,
        commercial_score: clawRow?.commercial_score ?? null,
        filing_complexity: clawRow?.filing_complexity ?? null,
        composite_score: clawRow?.composite_score ?? null,
        prior_art_citations: priorArtCitations,
        investor_count: investorCount ?? 0,
      }}
      topClaims={topClaims}
    />
  )
}
