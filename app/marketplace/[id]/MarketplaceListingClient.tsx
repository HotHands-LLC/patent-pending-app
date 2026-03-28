'use client'

import { useState } from 'react'

interface MarketplaceListing {
  id: string
  title: string
  summary: string
  tech_category: string | null
  patent_status: string
  listing_type: string
  asking_price_usd: number | null
  license_terms: string | null
  featured: boolean
  filing_date: string | null
  view_count: number
  listed_at: string | null
  created_at: string
  patent_id: string | null
}

interface InquireFormState {
  buyer_name: string
  buyer_email: string
  buyer_company: string
  offer_type: string
  offer_amount_usd: string
  message: string
}

const OFFER_TYPES = [
  { value: 'license',  label: 'License' },
  { value: 'acquire',  label: 'Full Acquisition' },
  { value: 'partner',  label: 'Partnership' },
  { value: 'invest',   label: 'Investment' },
  { value: 'inquiry',  label: 'General Inquiry' },
]

const LISTING_TYPE_LABEL: Record<string, string> = {
  license:            'License Available',
  acquire:            'For Acquisition',
  license_or_acquire: 'License or Acquire',
}

const PATENT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  'Provisional Filed':  { label: 'Provisional Filed',  cls: 'bg-amber-100 text-amber-800' },
  'Provisional Pending':{ label: 'Provisional Pending',cls: 'bg-yellow-100 text-yellow-800' },
  'Non-Provisional':    { label: 'Non-Provisional',    cls: 'bg-blue-100 text-blue-800' },
  'Granted':            { label: 'Patent Granted ✓',  cls: 'bg-green-100 text-green-800' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtPrice(usd: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(usd)
}

export default function MarketplaceListingClient({ listing }: { listing: MarketplaceListing }) {
  const [form, setForm] = useState<InquireFormState>({
    buyer_name: '',
    buyer_email: '',
    buyer_company: '',
    offer_type: 'inquiry',
    offer_amount_usd: '',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const badge = PATENT_STATUS_BADGE[listing.patent_status] ?? { label: listing.patent_status, cls: 'bg-gray-100 text-gray-600' }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/marketplace/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_name: form.buyer_name.trim(),
          buyer_email: form.buyer_email.trim().toLowerCase(),
          buyer_company: form.buyer_company.trim() || null,
          offer_type: form.offer_type,
          offer_amount_usd: form.offer_amount_usd ? parseInt(form.offer_amount_usd.replace(/\D/g, ''), 10) : null,
          message: form.message.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Submission failed. Please try again.')
      }

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* ── Left: Listing details ── */}
      <div className="lg:col-span-2 space-y-6">
        {/* Header */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
            {listing.tech_category && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                {listing.tech_category}
              </span>
            )}
            {listing.featured && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800">
                ⭐ Featured
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight mb-2">
            {listing.title}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <span className="font-semibold text-indigo-700">
              {LISTING_TYPE_LABEL[listing.listing_type] ?? listing.listing_type}
            </span>
            {listing.asking_price_usd && (
              <span className="font-bold text-gray-900">
                Asking: {fmtPrice(listing.asking_price_usd)}
              </span>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">About this Patent</h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">{listing.summary}</p>
        </div>

        {/* Timeline / Details */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Patent Details</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-semibold text-gray-500 mb-0.5">Patent Status</dt>
              <dd className="text-sm font-bold text-gray-900">{listing.patent_status}</dd>
            </div>
            {listing.filing_date && (
              <div>
                <dt className="text-xs font-semibold text-gray-500 mb-0.5">Filing Date</dt>
                <dd className="text-sm text-gray-900">{fmtDate(listing.filing_date)}</dd>
              </div>
            )}
            {listing.asking_price_usd && (
              <div>
                <dt className="text-xs font-semibold text-gray-500 mb-0.5">Asking Price</dt>
                <dd className="text-sm font-bold text-green-700">{fmtPrice(listing.asking_price_usd)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold text-gray-500 mb-0.5">Deal Type</dt>
              <dd className="text-sm text-gray-900">{LISTING_TYPE_LABEL[listing.listing_type] ?? listing.listing_type}</dd>
            </div>
            {listing.listed_at && (
              <div>
                <dt className="text-xs font-semibold text-gray-500 mb-0.5">Listed</dt>
                <dd className="text-sm text-gray-900">{fmtDate(listing.listed_at)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold text-gray-500 mb-0.5">Views</dt>
              <dd className="text-sm text-gray-900">{listing.view_count.toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        {/* License terms if present */}
        {listing.license_terms && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">License Terms</h2>
            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{listing.license_terms}</p>
          </div>
        )}

        {/* Platform fee notice */}
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-sm text-blue-800">
          <strong>Transaction Fee:</strong> PatentPending.app charges a 12% fee on completed transactions.
          All parties are connected by our team after inquiry review.
        </div>
      </div>

      {/* ── Right: Inquiry form ── */}
      <div className="lg:col-span-1">
        <div className="sticky top-6 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          {submitted ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Inquiry Received</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Our team will review your inquiry and reach out within 2 business days.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-bold text-gray-900 mb-1">Submit an Inquiry</h2>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Interested in this patent? Tell us about yourself and we'll connect you with the inventor.
              </p>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={form.buyer_name}
                    onChange={e => setForm(f => ({ ...f, buyer_name: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={form.buyer_email}
                    onChange={e => setForm(f => ({ ...f, buyer_email: e.target.value }))}
                    placeholder="jane@company.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Company</label>
                  <input
                    type="text"
                    value={form.buyer_company}
                    onChange={e => setForm(f => ({ ...f, buyer_company: e.target.value }))}
                    placeholder="Acme Corp (optional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Interest Type *</label>
                  <select
                    required
                    value={form.offer_type}
                    onChange={e => setForm(f => ({ ...f, offer_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  >
                    {OFFER_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Offer Amount (USD)</label>
                  <input
                    type="text"
                    value={form.offer_amount_usd}
                    onChange={e => setForm(f => ({ ...f, offer_amount_usd: e.target.value }))}
                    placeholder="e.g. 150000 (optional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Message *</label>
                  <textarea
                    required
                    rows={4}
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Tell us why you're interested and how you plan to use this technology…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {submitting ? 'Submitting…' : 'Submit Inquiry →'}
                </button>

                <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                  Your contact info is kept private until both parties agree to connect.
                  PatentPending charges 12% on completed transactions.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
