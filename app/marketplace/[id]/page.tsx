import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import MarketplaceListingClient from './MarketplaceListingClient'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const { data } = await supabaseService
    .from('marketplace_listings')
    .select('title, summary, tech_category, patent_status')
    .eq('id', id)
    .eq('status', 'active')
    .single()

  if (!data) return { title: 'Listing Not Found | PatentPending' }

  return {
    title: `${data.title} | PatentPending Marketplace`,
    description: data.summary.slice(0, 160),
    openGraph: {
      title: data.title,
      description: data.summary.slice(0, 160),
      type: 'website',
      siteName: 'PatentPending Marketplace',
    },
  }
}

export default async function MarketplaceListingPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: listing } = await supabaseService
    .from('marketplace_listings')
    .select(`
      id, title, summary, tech_category, patent_status, listing_type,
      asking_price_usd, license_terms, featured, filing_date,
      view_count, listed_at, created_at, patent_id
    `)
    .eq('id', id)
    .eq('status', 'active')
    .single()

  if (!listing) notFound()

  // Increment view count (fire and forget)
  void supabaseService
    .from('marketplace_listings')
    .update({ view_count: (listing.view_count ?? 0) + 1 })
    .eq('id', id)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <div className="bg-[#1a1f36] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">⚖️ PatentPending</Link>
          <Link href="/marketplace" className="text-xs text-gray-300 hover:text-white">
            ← Back to Marketplace
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <MarketplaceListingClient listing={listing} />
      </div>
    </div>
  )
}
