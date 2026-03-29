import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import MarketplaceDealClient from './MarketplaceDealClient'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const { data } = await supabaseService
    .from('patents')
    .select('title, deal_page_brief, deal_page_summary, status')
    .eq('marketplace_slug', slug)
    .eq('marketplace_enabled', true)
    .single()

  if (!data) return { title: 'Patent Not Found | PatentPending' }

  const statusLabel = data.status === 'granted' ? 'Issued Patent' : 'Patent Pending'
  const desc = data.deal_page_brief ?? data.deal_page_summary ?? `Licensing opportunity: ${data.title}`

  return {
    title: `${data.title} — ${statusLabel} | PatentPending Marketplace`,
    description: desc.slice(0, 160),
    openGraph: {
      title: data.title,
      description: desc.slice(0, 160),
      type: 'website',
      siteName: 'PatentPending Marketplace',
    },
  }
}

export default async function MarketplaceDealPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const { data: patent } = await supabaseService
    .from('patents')
    .select(`
      id, title, marketplace_slug, status, filing_status,
      inventors, tags, marketplace_tags, description,
      deal_page_brief, deal_page_summary, deal_page_market,
      license_types, asking_price_range,
      licensing_exclusive, licensing_nonexclusive, licensing_field_of_use,
      provisional_app_number, provisional_filed_at, nonprov_deadline_at,
      marketplace_published_at, created_at,
      ip_readiness_score, spec_draft, claims_draft, abstract_draft, figures,
      youtube_embed_url, marketplace_views, marketplace_inquiries, deal_structure_type
    `)
    .eq('marketplace_slug', slug)
    .eq('marketplace_enabled', true)
    .single()

  if (!patent) notFound()

  // Increment view count (fire and forget)
  void supabaseService.from('patents').update({
    marketplace_views: ((patent as Record<string, unknown>).marketplace_views as number ?? 0) + 1
  }).eq('id', patent.id)

  return <MarketplaceDealClient patent={patent} />
}
