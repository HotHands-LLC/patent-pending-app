import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Patent Marketplace | PatentPending',
  description: 'Discover, license, and acquire patented technologies from independent inventors.',
}

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  provisional:     { label: 'Patent Pending',  cls: 'bg-yellow-100 text-yellow-800' },
  non_provisional: { label: 'Patent Pending',  cls: 'bg-yellow-100 text-yellow-800' },
  granted:         { label: 'Patent Granted',  cls: 'bg-green-100 text-green-800' },
  published:       { label: 'Patent Published',cls: 'bg-blue-100 text-blue-800' },
}

export default async function MarketplacePage() {
  const { data: listings } = await supabaseService
    .from('patents')
    .select('id, title, marketplace_slug, deal_page_brief, deal_page_summary, status, asking_price_range, marketplace_published_at')
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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        {/* Hero header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Patent Marketplace</h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Discover, license, and acquire patented technologies from independent inventors.
          </p>
        </div>

        {/* Listings */}
        {!listings || listings.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-lg font-medium">No listings yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map(patent => {
              const brief = patent.deal_page_brief ?? patent.deal_page_summary ?? ''
              const snippet = brief.length > 120 ? brief.slice(0, 117) + '…' : brief
              const badge = STATUS_BADGE[patent.status] ?? { label: patent.status, cls: 'bg-gray-100 text-gray-600' }

              return (
                <Link
                  key={patent.id}
                  href={`/marketplace/${patent.marketplace_slug}`}
                  className="group bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {patent.asking_price_range && (
                      <span className="text-xs text-gray-400 font-medium">{patent.asking_price_range}</span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-gray-900 leading-snug mb-2 group-hover:text-indigo-700 transition-colors">
                    {patent.title}
                  </h2>
                  {snippet && (
                    <p className="text-sm text-gray-500 leading-relaxed flex-1">{snippet}</p>
                  )}
                  <div className="mt-4 text-sm font-semibold text-indigo-600 group-hover:text-indigo-800">
                    View Listing →
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-gray-200 text-center">
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
