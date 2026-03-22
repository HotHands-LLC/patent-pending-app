'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { InvestorListing } from './page'

const STAGE_LABELS: Record<string, string> = {
  provisional: 'Provisional',
  non_provisional: 'Non-Provisional',
  development: 'Development',
  licensing: 'Licensing',
  granted: 'Granted',
}

const STAGE_COLORS: Record<string, string> = {
  provisional: 'bg-blue-100 text-blue-800',
  non_provisional: 'bg-indigo-100 text-indigo-800',
  development: 'bg-purple-100 text-purple-800',
  licensing: 'bg-amber-100 text-amber-800',
  granted: 'bg-green-100 text-green-800',
}

type SortKey = 'newest' | 'score' | 'funded'
type StageFilter = 'all' | 'provisional' | 'non_provisional' | 'development' | 'licensing' | 'granted'

function FundingBar({ raised, goal }: { raised: number; goal: number }) {
  if (!goal) return null
  // Values are in cents
  const raisedDollars = raised / 100
  const goalDollars = goal / 100
  const pct = Math.min(100, Math.round((raised / goal) * 100))
  return (
    <div className="mt-3">
      <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span className="font-medium text-gray-700">${raisedDollars.toLocaleString()} raised</span>
        <span>of ${goalDollars.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function InvestorMarketplaceClient({ listings }: { listings: InvestorListing[] }) {
  const [stage, setStage] = useState<StageFilter>('all')
  const [sort, setSort] = useState<SortKey>('newest')

  const filtered = useMemo(() => {
    let result = stage === 'all' ? listings : listings.filter(l => l.stage === stage)
    if (sort === 'score') {
      result = [...result].sort((a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0))
    } else if (sort === 'funded') {
      result = [...result].sort((a, b) => {
        const pctA = a.funding_goal_usd > 0 ? a.total_raised_usd / a.funding_goal_usd : 0
        const pctB = b.funding_goal_usd > 0 ? b.total_raised_usd / b.funding_goal_usd : 0
        return pctB - pctA
      })
    }
    // newest is default (already ordered by created_at desc from server)
    return result
  }, [listings, stage, sort])

  const STAGES: Array<{ key: StageFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'provisional', label: 'Provisional' },
    { key: 'non_provisional', label: 'Non-Provisional' },
    { key: 'development', label: 'Development' },
    { key: 'licensing', label: 'Licensing' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <div className="bg-[#1a1f36] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">⚖️ PatentPending</Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs text-gray-300 hover:text-white">Sign In</Link>
            <Link href="/signup" className="text-xs bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 rounded-lg font-semibold">Start Investing</Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-[#1a1f36] text-white pb-16 pt-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full mb-4 border border-emerald-500/30">
            💰 Invest from $25
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            Invest in the<br className="hidden sm:block" /> Next Big Patent
          </h1>
          <p className="text-lg text-gray-300 max-w-xl mx-auto mb-8">
            Back early-stage inventions and earn a share of future revenue. No patent expertise required.
          </p>
          <a
            href="#listings"
            className="inline-block px-8 py-3.5 bg-emerald-500 text-white font-bold text-base rounded-xl hover:bg-emerald-400 transition-colors shadow-sm"
          >
            Browse Inventions ↓
          </a>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white border-b border-gray-100 py-10 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { icon: '🔍', title: 'Browse Inventions', desc: 'Find patents open for investment. Filter by stage, score, or funding progress.' },
            { icon: '💵', title: 'Invest from $25', desc: 'Commit any amount. Your stake is proportional to your investment vs. total raised.' },
            { icon: '📈', title: 'Earn Revenue Share', desc: 'When the patent generates licensing fees or sales, investors receive their proportional share.' },
          ].map(s => (
            <div key={s.title}>
              <div className="text-3xl mb-3">{s.icon}</div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Listings */}
      <div id="listings" className="max-w-6xl mx-auto px-4 py-10">

        {/* Filter + sort bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 items-start sm:items-center justify-between">
          {/* Stage filter */}
          <div className="flex flex-wrap gap-2">
            {STAGES.map(s => (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  stage === s.key
                    ? 'bg-[#1a1f36] text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Sort:</span>
            {([['newest', 'Newest'], ['score', 'Highest Score'], ['funded', 'Most Funded']] as [SortKey, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  sort === k
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-5">
          {filtered.length} invention{filtered.length !== 1 ? 's' : ''} open for investment
        </p>

        {filtered.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <div className="text-5xl mb-4">🔬</div>
            <p className="text-lg font-medium">No patents match this filter yet.</p>
            <button onClick={() => setStage('all')} className="mt-3 text-sm text-indigo-500 hover:underline">
              Show all
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(patent => {
              const dealHref = patent.slug ? `/patents/${patent.slug}` : null
              const stageBadge = STAGE_COLORS[patent.stage] ?? 'bg-gray-100 text-gray-600'
              const tagline = patent.marketplace_tagline
              const desc = patent.marketplace_description?.slice(0, 120)

              const card = (
                <div className="group bg-white rounded-2xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all flex flex-col p-5 h-full">
                  {/* Badges row */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${stageBadge}`}>
                      {STAGE_LABELS[patent.stage] ?? patent.stage}
                    </span>
                    {patent.composite_score != null && (
                      <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-full">
                        {patent.composite_score}/100
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h2 className="text-sm font-bold text-gray-900 leading-snug mb-1 group-hover:text-emerald-700 transition-colors">
                    {patent.title}
                  </h2>

                  {/* Tagline */}
                  {tagline && (
                    <p className="text-xs text-gray-500 italic mb-2 leading-relaxed">{tagline}</p>
                  )}
                  {!tagline && desc && (
                    <p className="text-xs text-gray-500 mb-2 leading-relaxed">{desc}{patent.marketplace_description && patent.marketplace_description.length > 120 ? '…' : ''}</p>
                  )}

                  {/* Funding bar */}
                  <div className="mt-auto">
                    <FundingBar raised={patent.total_raised_usd} goal={patent.funding_goal_usd} />

                    {/* Rev share note */}
                    {patent.rev_share_available_pct > 0 && (
                      <p className="text-xs text-emerald-600 mt-2">
                        {patent.rev_share_available_pct}% revenue share available to investors
                      </p>
                    )}

                    {/* CTA */}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        Invest from $25 →
                      </span>
                    </div>
                  </div>
                </div>
              )

              return dealHref ? (
                <Link key={patent.id} href={dealHref} className="flex flex-col">
                  {card}
                </Link>
              ) : (
                <div key={patent.id} className="flex flex-col">
                  {card}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Risk footer */}
      <div className="border-t border-gray-200 bg-white py-8 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            <strong className="text-gray-500">Risk Disclosure:</strong> Investing in early-stage intellectual property carries significant risk. Returns are not guaranteed. Patent applications may not be granted. This is not a securities offering.
          </p>
          <p className="text-xs text-gray-300 mt-2">
            Managed by <a href="https://patentpending.app" className="text-indigo-400 hover:underline">PatentPending.app</a>
          </p>
        </div>
      </div>
    </div>
  )
}
