'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'

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
  provisional:     { label: 'Patent Pending',  cls: 'bg-yellow-100 text-yellow-800' },
  non_provisional: { label: 'Patent Pending',  cls: 'bg-yellow-100 text-yellow-800' },
  granted:         { label: 'Patent Granted',  cls: 'bg-green-100 text-green-800' },
  published:       { label: 'Patent Published', cls: 'bg-blue-100 text-blue-800' },
}

export default function MarketplaceClient({ listings }: { listings: MarketplaceListing[] }) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Collect all unique tags across all listings
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const l of listings) {
      for (const t of l.marketplace_tags ?? []) {
        tagSet.add(t)
      }
    }
    return Array.from(tagSet).sort()
  }, [listings])

  // AND filter — listing must have ALL selected tags
  const filtered = useMemo(() => {
    if (selectedTags.length === 0) return listings
    return listings.filter(l =>
      selectedTags.every(t => (l.marketplace_tags ?? []).includes(t))
    )
  }, [listings, selectedTags])

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  return (
    <>
      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-2 items-center mb-2">
            {allTags.map(tag => {
              const active = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="px-3 py-1 rounded-full text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear ✕
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Showing {filtered.length} of {listings.length} listing{listings.length !== 1 ? 's' : ''}
            {selectedTags.length > 0 && (
              <span className="ml-1">
                — filtered by: {selectedTags.map(t => <span key={t} className="font-semibold text-indigo-600 ml-1">#{t}</span>)}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Listings grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-lg font-medium">No listings match your filter.</p>
          <button
            onClick={() => setSelectedTags([])}
            className="mt-3 text-sm text-indigo-500 hover:underline"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(patent => {
            const brief = patent.deal_page_brief ?? patent.deal_page_summary ?? ''
            const snippet = brief.length > 120 ? brief.slice(0, 117) + '…' : brief
            const badge = STATUS_BADGE[patent.status] ?? { label: patent.status, cls: 'bg-gray-100 text-gray-600' }
            const tags = patent.marketplace_tags ?? []

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
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-gray-50">
                    {tags.slice(0, 4).map(t => (
                      <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-400 text-xs rounded-full">
                        #{t}
                      </span>
                    ))}
                    {tags.length > 4 && (
                      <span className="px-2 py-0.5 text-gray-400 text-xs">+{tags.length - 4}</span>
                    )}
                  </div>
                )}
                <div className="mt-4 text-sm font-semibold text-indigo-600 group-hover:text-indigo-800">
                  View Listing →
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
