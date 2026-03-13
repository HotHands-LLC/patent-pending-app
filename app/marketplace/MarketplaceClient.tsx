'use client'

import Link from 'next/link'
import { useState, useMemo, useRef } from 'react'

interface MarketplaceListing {
  id: string
  title: string
  marketplace_slug: string | null
  deal_page_brief: string | null
  deal_page_summary: string | null
  status: string
  asking_price_range: string | null
  marketplace_published_at: string | null
  marketplace_tags: string[] | null
  ip_readiness_score: number | null
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  provisional:     { label: 'Patent Pending',   cls: 'bg-yellow-100 text-yellow-800' },
  non_provisional: { label: 'Patent Pending',   cls: 'bg-yellow-100 text-yellow-800' },
  granted:         { label: 'Patent Granted ✓', cls: 'bg-green-100 text-green-800' },
  published:       { label: 'Patent Published', cls: 'bg-blue-100 text-blue-800' },
}

const HOW_IT_WORKS = [
  {
    num: '1',
    title: 'Browse Listings',
    desc: 'Explore patents available for licensing or acquisition across a range of industries and technologies.',
  },
  {
    num: '2',
    title: 'Submit an Inquiry',
    desc: 'Tell us your interest. All submissions are reviewed. Your contact information stays confidential.',
  },
  {
    num: '3',
    title: 'Get Introduced',
    desc: 'PatentPending connects you directly with the patent holder once your inquiry is approved.',
  },
]

export default function MarketplaceClient({ listings }: { listings: MarketplaceListing[] }) {
  const [query, setQuery] = useState('')
  const listingsRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return listings
    return listings.filter(l => {
      const haystack = [
        l.title,
        l.deal_page_brief ?? '',
        l.deal_page_summary ?? '',
        ...(l.marketplace_tags ?? []),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [listings, query])

  function scrollToListings(e: React.MouseEvent) {
    e.preventDefault()
    listingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      {/* ── A: Hero ─────────────────────────────────────────────────── */}
      <div className="text-center py-16 px-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-4">
          Discover &amp; License<br className="hidden sm:block" /> Patented Technology
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
          Browse patent portfolios available for licensing, acquisition, or partnership.
        </p>
        <a
          href="#listings"
          onClick={scrollToListings}
          className="inline-block px-8 py-3.5 bg-indigo-600 text-white font-bold text-base rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
        >
          Browse Listings ↓
        </a>
      </div>

      {/* ── B: How It Works ─────────────────────────────────────────── */}
      <div className="bg-white border-y border-gray-100 py-12 px-4 mb-12">
        <h2 className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-8">
          How It Works
        </h2>
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {HOW_IT_WORKS.map(step => (
            <div key={step.num} className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600 text-white font-extrabold text-lg mb-4">
                {step.num}
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── C + D: Search + Listings ─────────────────────────────────── */}
      <div ref={listingsRef} id="listings" className="scroll-mt-8">

        {/* Search bar */}
        <div className="mb-6">
          <div className="relative max-w-xl">
            <span className="absolute inset-y-0 left-3.5 flex items-center text-gray-400 pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search patents by keyword, technology, or application…"
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-3.5 flex items-center text-gray-400 hover:text-gray-600 text-sm"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Listing count */}
        <p className="text-xs text-gray-400 mb-5">
          {query
            ? `${filtered.length} of ${listings.length} patent${listings.length !== 1 ? 's' : ''} match your search`
            : `${listings.length} patent${listings.length !== 1 ? 's' : ''} available`
          }
        </p>

        {/* Grid */}
        {listings.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-lg font-medium">No listings yet. Check back soon.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-base font-medium">No listings match your search.</p>
            <button
              onClick={() => setQuery('')}
              className="mt-3 text-sm text-indigo-500 hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(patent => {
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
      </div>
    </>
  )
}
