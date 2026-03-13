import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import type { Metadata } from 'next'
import MarketplaceClient from './MarketplaceClient'

export const metadata: Metadata = {
  title: 'Patent Marketplace | PatentPending',
  description: 'Discover, license, and acquire patented technologies from independent inventors.',
}

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function MarketplacePage() {
  const { data: listings } = await supabaseService
    .from('patents')
    .select('id, title, marketplace_slug, deal_page_brief, deal_page_summary, status, asking_price_range, marketplace_published_at, marketplace_tags, ip_readiness_score')
    .eq('marketplace_enabled', true)
    .not('marketplace_published_at', 'is', null)
    .order('marketplace_published_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a1f36] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">⚖️ PatentPending</Link>
          <span className="text-xs text-gray-400">Patent Licensing Marketplace</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <MarketplaceClient listings={listings ?? []} />

        <div className="mt-12 pb-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            All listings managed by{' '}
            <a href="https://patentpending.app" className="text-indigo-500 hover:underline">PatentPending.app</a>
            {' '}· Patent information subject to change.
          </p>
        </div>
      </div>
    </div>
  )
}
