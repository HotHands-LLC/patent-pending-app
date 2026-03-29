'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface MarketplaceLead {
  id: string
  patent_id: string
  full_name: string
  email: string
  company: string | null
  phone: string | null
  interest_type: string
  why_statement: string
  status: 'pending' | 'approved' | 'rejected' | 'introduced'
  owner_notified_at: string | null
  introduced_at: string | null
  created_at: string
  // Joined
  patent_title: string
  patent_slug: string | null
}

interface MarketplaceListing {
  id: string
  title: string
  tech_category: string | null
  patent_status: string
  listing_type: string
  asking_price_usd: number | null
  status: string
  featured: boolean
  view_count: number
  listed_at: string | null
  created_at: string
}

interface MarketplaceOffer {
  id: string
  listing_id: string
  buyer_name: string
  buyer_email: string
  buyer_company: string | null
  offer_type: string
  offer_amount_usd: number | null
  message: string
  status: string
  pp_app_fee_pct: number
  created_at: string
  // joined
  listing_title?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const INTEREST_BADGES: Record<string, string> = {
  license:  'bg-blue-100 text-blue-800',
  acquire:  'bg-purple-100 text-purple-800',
  invest:   'bg-green-100 text-green-800',
  partner:  'bg-yellow-100 text-yellow-800',
  other:    'bg-gray-100 text-gray-600',
}

const STATUS_BADGES: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  approved:   'bg-green-100 text-green-800',
  rejected:   'bg-red-100 text-red-800',
  introduced: 'bg-blue-100 text-blue-800',
  active:     'bg-green-100 text-green-800',
  draft:      'bg-gray-100 text-gray-600',
  sold:       'bg-purple-100 text-purple-800',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPrice(usd: number | null) {
  if (!usd) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(usd)
}

type Tab = 'listings' | 'offers' | 'leads'

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminMarketplacePage() {
  const router = useRouter()
  const [tab, setTab]               = useState<Tab>('listings')
  const [leads, setLeads]           = useState<MarketplaceLead[]>([])
  const [listings, setListings]     = useState<MarketplaceListing[]>([])
  const [offers, setOffers]         = useState<MarketplaceOffer[]>([])
  const [loading, setLoading]       = useState(true)
  const [authToken, setAuthToken]   = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast]           = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const token = session.access_token
      setAuthToken(token)

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single()

      if (!profile?.is_admin) { router.replace('/dashboard'); return }
      fetchAll(token)
    })
  }, [router])

  // ── Fetch all data ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (token: string) => {
    setLoading(true)
    try {
      // Fetch leads (existing endpoint)
      const leadsRes = await fetch('/api/admin/marketplace/leads', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (leadsRes.ok) {
        const data = await leadsRes.json()
        setLeads(data.leads ?? [])
      }

      // Fetch marketplace_listings directly via service client
      const listingsRes = await fetch('/api/admin/marketplace/listings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (listingsRes.ok) {
        const data = await listingsRes.json()
        setListings(data.listings ?? [])
        setOffers(data.offers ?? [])
      }
    } catch (e) {
      console.error('[admin/marketplace] fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Lead actions ──────────────────────────────────────────────────────────
  async function handleLeadAction(leadId: string, action: 'approve' | 'reject') {
    if (!authToken) return
    setActioningId(leadId)
    try {
      const res = await fetch(`/api/admin/marketplace/leads/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(await res.text())
      setToast(action === 'approve' ? '✅ Approved — intro emails sending…' : '❌ Lead rejected')
      setTimeout(() => setToast(null), 4000)
      fetchAll(authToken)
    } catch (e) {
      console.error('[admin/marketplace] lead action error:', e)
      setToast('Error — check console')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setActioningId(null)
    }
  }

  // ── Feature toggle ────────────────────────────────────────────────────────
  async function toggleFeatured(listing: MarketplaceListing) {
    if (!authToken) return
    setTogglingId(listing.id)
    try {
      const res = await fetch(`/api/admin/marketplace/listings/${listing.id}/feature`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ featured: !listing.featured }),
      })
      if (!res.ok) throw new Error(await res.text())
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, featured: !l.featured } : l))
      setToast(listing.featured ? '⭐ Unfeatured' : '⭐ Marked as featured!')
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      console.error('[admin/marketplace] feature toggle error:', e)
      setToast('Error toggling featured')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setTogglingId(null)
    }
  }

  // ── Counts ────────────────────────────────────────────────────────────────
  const pendingLeads   = leads.filter(l => l.status === 'pending').length
  const activeListings = listings.filter(l => l.status === 'active').length
  const pendingOffers  = offers.filter(o => o.status === 'pending').length
  const approvedLeads  = leads.filter(l => l.status === 'approved').length
  const introducedLeads = leads.filter(l => l.status === 'introduced').length
  const rejectedLeads  = leads.filter(l => l.status === 'rejected').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1a1f36] text-white px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-xs text-gray-300 hover:text-white">← Admin</Link>
          <span className="text-sm text-gray-500">|</span>
          <span className="font-bold">🎯 Marketplace</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace" target="_blank" className="text-xs text-indigo-300 hover:text-white">
            View Public ↗
          </Link>
          <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded font-bold">ADMIN</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active Listings', count: activeListings, color: 'green' },
            { label: 'Pending Offers', count: pendingOffers, color: 'yellow' },
            { label: 'Pending Leads', count: pendingLeads, color: 'amber' },
            { label: 'Introduced', count: introducedLeads, color: 'blue' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`text-2xl font-extrabold ${
                s.color === 'green' ? 'text-green-600' :
                s.color === 'yellow' ? 'text-yellow-600' :
                s.color === 'amber' ? 'text-amber-600' :
                'text-blue-600'
              }`}>
                {s.count}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tab nav ── */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {([
            ['listings', `Listings (${listings.length})`],
            ['offers', `Offers (${offers.length})`],
            ['leads', `Legacy Leads (${leads.length})`],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : (
          <>
            {/* ── Listings Tab ── */}
            {tab === 'listings' && (
              <div>
                {listings.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-lg font-medium">No marketplace listings yet.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Title</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Category</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Type</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Price</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Views</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Feature</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {listings.map(listing => (
                          <tr key={listing.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                href={`/marketplace/${listing.id}`}
                                target="_blank"
                                className="text-indigo-600 hover:underline font-medium max-w-[200px] block truncate"
                                title={listing.title}
                              >
                                {listing.title}
                              </Link>
                              {listing.featured && (
                                <span className="text-[10px] text-yellow-600 font-semibold">⭐ Featured</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {listing.tech_category ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
                                  {listing.tech_category}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 capitalize">
                              {listing.listing_type.replace(/_/g, ' ')}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                              {fmtPrice(listing.asking_price_usd)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {listing.view_count.toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_BADGES[listing.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {listing.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleFeatured(listing)}
                                disabled={togglingId === listing.id}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 ${
                                  listing.featured
                                    ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                    : 'bg-gray-100 text-gray-600 hover:bg-yellow-100 hover:text-yellow-800'
                                }`}
                              >
                                {togglingId === listing.id ? '…' : listing.featured ? '⭐ Unfeature' : 'Feature'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Offers Tab ── */}
            {tab === 'offers' && (
              <div>
                {offers.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <div className="text-4xl mb-3">📬</div>
                    <p className="text-lg font-medium">No offers yet.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Listing</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Buyer</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Type</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Amount</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">pp.app Fee</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {offers.map(offer => (
                          <tr key={offer.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                href={`/marketplace/${offer.listing_id}`}
                                target="_blank"
                                className="text-indigo-600 hover:underline font-medium max-w-[160px] block truncate"
                                title={offer.listing_title ?? offer.listing_id}
                              >
                                {offer.listing_title ?? offer.listing_id.slice(0, 8) + '…'}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{offer.buyer_name}</div>
                              {offer.buyer_company && (
                                <div className="text-xs text-gray-400">{offer.buyer_company}</div>
                              )}
                              <a href={`mailto:${offer.buyer_email}`} className="text-xs text-indigo-500 hover:underline">
                                {offer.buyer_email}
                              </a>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${INTEREST_BADGES[offer.offer_type] ?? 'bg-gray-100 text-gray-600'}`}>
                                {offer.offer_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                              {fmtPrice(offer.offer_amount_usd)}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {offer.pp_app_fee_pct}%
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_BADGES[offer.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {offer.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                              {fmtDate(offer.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Legacy Leads Tab ── */}
            {tab === 'leads' && (
              <div>
                {leads.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-lg font-medium">No marketplace leads yet.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Patent</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Lead</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Interest</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Why (tap)</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Submitted</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {leads.map(lead => {
                          const canAct = lead.status === 'pending' || lead.status === 'approved'
                          const isActioning = actioningId === lead.id
                          const whySnippet = lead.why_statement.length > 100
                            ? lead.why_statement.slice(0, 97) + '…'
                            : lead.why_statement
                          const isExpanded = expandedId === lead.id

                          return (
                            <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                {lead.patent_slug ? (
                                  <Link
                                    href={`/marketplace/${lead.patent_slug}`}
                                    target="_blank"
                                    className="text-indigo-600 hover:underline font-medium max-w-[160px] block truncate"
                                    title={lead.patent_title}
                                  >
                                    {lead.patent_title}
                                  </Link>
                                ) : (
                                  <span className="text-gray-700 font-medium max-w-[160px] block truncate" title={lead.patent_title}>
                                    {lead.patent_title}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{lead.full_name}</div>
                                {lead.company && <div className="text-xs text-gray-400">{lead.company}</div>}
                                <a href={`mailto:${lead.email}`} className="text-xs text-indigo-500 hover:underline">{lead.email}</a>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${INTEREST_BADGES[lead.interest_type] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {lead.interest_type}
                                </span>
                              </td>
                              <td className="px-4 py-3 max-w-[220px]">
                                <button
                                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                                  className="text-left text-gray-600 hover:text-gray-900 text-xs leading-relaxed"
                                  title={lead.why_statement}
                                >
                                  {isExpanded ? lead.why_statement : whySnippet}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {fmtDate(lead.created_at)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_BADGES[lead.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {lead.status}
                                </span>
                                {lead.introduced_at && (
                                  <div className="text-xs text-gray-400 mt-0.5">{fmtDate(lead.introduced_at)}</div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {canAct && lead.status !== 'introduced' && (
                                  <div className="flex gap-2">
                                    {lead.status === 'pending' && (
                                      <button
                                        onClick={() => handleLeadAction(lead.id, 'approve')}
                                        disabled={isActioning}
                                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                                      >
                                        {isActioning ? '…' : 'Approve'}
                                      </button>
                                    )}
                                    {(lead.status === 'pending' || lead.status === 'approved') && (
                                      <button
                                        onClick={() => handleLeadAction(lead.id, 'reject')}
                                        disabled={isActioning}
                                        className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors border border-red-200"
                                      >
                                        {isActioning ? '…' : 'Reject'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
