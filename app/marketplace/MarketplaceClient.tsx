'use client'

import Link from 'next/link'
import { useState, useMemo, useRef } from 'react'
import MarketplaceInquiryModal from '@/components/MarketplaceInquiryModal'

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
  deal_structure_type: string | null
  rev_share_available_pct: number | null
  stage_value_usd: number | null
  cpc_codes: string[] | null
  figures: unknown[] | null
  marketplace_views: number | null
  marketplace_inquiries: number | null
  owner_verified: boolean
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  provisional:     { label: 'Patent Pending',   cls: 'bg-amber-100 text-amber-800' },
  non_provisional: { label: 'Patent Pending',   cls: 'bg-blue-100 text-blue-800' },
  granted:         { label: 'Patent Granted ✓', cls: 'bg-green-100 text-green-800' },
  published:       { label: 'Patent Published', cls: 'bg-blue-100 text-blue-800' },
  pending:         { label: 'Pending',           cls: 'bg-gray-100 text-gray-600' },
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

// ── ScoreRing ─────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const filled = (score / 100) * circumference
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle
          cx="20" cy="20" r={radius} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 20 20)"
        />
        <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <span className="text-[9px] text-gray-400 mt-0.5">Score</span>
    </div>
  )
}

// ── DealBox ───────────────────────────────────────────────────────────────────
function DealBox({ dealType, revSharePct, stageValue, askingPrice }: {
  dealType: string | null
  revSharePct: number | null
  stageValue: number | null
  askingPrice: string | null
}) {
  if (!dealType || dealType === 'inquiry') {
    return (
      <div className="text-xs px-2.5 py-1 rounded-lg bg-gray-50 text-gray-500 border border-gray-100 inline-block">
        Inquiry Only
      </div>
    )
  }
  if (dealType === 'equity') {
    return (
      <div className="text-xs px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-100 inline-block font-semibold">
        {revSharePct ? `${revSharePct}% Equity` : 'Equity Deal'}
        {stageValue ? ` · $${stageValue.toLocaleString()}` : ''}
      </div>
    )
  }
  if (dealType === 'revshare') {
    return (
      <div className="text-xs px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-100 inline-block font-semibold">
        {revSharePct ? `${revSharePct}% Rev Share` : 'Rev Share'}
      </div>
    )
  }
  if (dealType === 'fixed') {
    const price = stageValue ? `$${stageValue.toLocaleString()}` : askingPrice ?? 'Fixed Price'
    return (
      <div className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 inline-block font-semibold">
        {price}
      </div>
    )
  }
  return null
}

// ── StatBar ───────────────────────────────────────────────────────────────────
function StatBar({ views, inquiries, publishedAt }: {
  views: number | null
  inquiries: number | null
  publishedAt: string | null
}) {
  const listedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null
  return (
    <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-2">
      {views != null && <span>👁 {views} view{views !== 1 ? 's' : ''}</span>}
      {inquiries != null && inquiries > 0 && <span>💬 {inquiries} inquir{inquiries !== 1 ? 'ies' : 'y'}</span>}
      {listedDate && <span>📅 Listed {listedDate}</span>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MarketplaceClient({ listings }: { listings: MarketplaceListing[] }) {
  const [query, setQuery] = useState('')
  const [inquiryTarget, setInquiryTarget] = useState<{ id: string; title: string; dealType: string | null } | null>(null)
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
        ...(l.cpc_codes ?? []),
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
              const score = patent.ip_readiness_score ?? 0
              const figCount = (patent.figures as unknown[] | null)?.length ?? 0

              return (
                <Link
                  key={patent.id}
                  href={`/marketplace/${patent.marketplace_slug}`}
                  className="group bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col"
                >
                  {/* Top row: badge + score ring */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex flex-col gap-1.5">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full w-fit ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {patent.owner_verified && (
                        <span className="text-[10px] text-green-600 font-semibold flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Verified Inventor
                        </span>
                      )}
                    </div>
                    {score > 0 && <ScoreRing score={score} />}
                  </div>

                  {/* Title */}
                  <h2 className="text-base font-bold text-gray-900 leading-snug mb-2 group-hover:text-indigo-700 transition-colors">
                    {patent.title}
                  </h2>

                  {/* Snippet */}
                  {snippet && (
                    <p className="text-sm text-gray-500 leading-relaxed flex-1">{snippet}</p>
                  )}

                  {/* Tags */}
                  {patent.marketplace_tags && patent.marketplace_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {patent.marketplace_tags.slice(0, 4).map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Deal box */}
                  <div className="mt-3">
                    <DealBox
                      dealType={patent.deal_structure_type}
                      revSharePct={patent.rev_share_available_pct}
                      stageValue={patent.stage_value_usd}
                      askingPrice={patent.asking_price_range}
                    />
                  </div>

                  {/* Figure count */}
                  {figCount > 0 && (
                    <div className="mt-1.5 text-[10px] text-gray-400">
                      🖼 {figCount} figure{figCount !== 1 ? 's' : ''}
                    </div>
                  )}

                  {/* StatBar */}
                  <StatBar
                    views={patent.marketplace_views}
                    inquiries={patent.marketplace_inquiries}
                    publishedAt={patent.marketplace_published_at}
                  />

                  {/* CTA row */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-indigo-600 group-hover:text-indigo-800">
                      View Listing →
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        setInquiryTarget({ id: patent.id, title: patent.title, dealType: patent.deal_structure_type })
                      }}
                      className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      {patent.deal_structure_type === 'fixed' ? 'Buy Now' : 'Inquire'}
                    </button>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Inquiry modal */}
      {inquiryTarget && (
        <MarketplaceInquiryModal
          patentId={inquiryTarget.id}
          patentTitle={inquiryTarget.title}
          dealType={inquiryTarget.dealType}
          onClose={() => setInquiryTarget(null)}
        />
      )}
    </>
  )
}
