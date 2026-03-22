import { createClient } from '@supabase/supabase-js'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import DealPageClient from './DealPageClient'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

// SSR — load patent data server-side for SEO
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

  // 54D: prefer marketplace_description for meta description (160 char truncation)
  const metaDesc = data.marketplace_description
    ? data.marketplace_description.slice(0, 160)
    : (data.deal_page_summary ?? `Licensing opportunity: ${data.title}`)

  // 54D: append tagline to title when set
  const metaTitle = data.marketplace_tagline
    ? `${data.title} — ${data.marketplace_tagline} | PatentPending`
    : `${data.title} — ${statusLabel} | PatentPending`

  return {
    title: metaTitle,
    description: metaDesc,
    openGraph: {
      title: data.title,
      description: metaDesc,
      type: 'website',
      siteName: 'PatentPending',
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
      marketplace_description, marketplace_tagline
    `)
    .eq('slug', slug)
    .eq('arc3_active', true)
    .single()

  if (!patent) notFound()

  // Extract top 3 independent claims from claims_draft
  const topClaims: string[] = []
  if (patent.claims_draft) {
    const claimMatches = patent.claims_draft.match(/\d+\.\s[^\n]+(?:\n(?!\d+\.)[^\n]+)*/g) ?? []
    // Independent claims don't reference "claim X"
    const independent = claimMatches.filter((c: string) => !/\bclaim\s+\d/i.test(c))
    topClaims.push(...independent.slice(0, 3).map((c: string) => c.replace(/^\d+\.\s*/, '').trim()))
  }

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
      }}
      topClaims={topClaims}
    />
  )
}
