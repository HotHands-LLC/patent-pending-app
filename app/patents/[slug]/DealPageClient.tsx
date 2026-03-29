'use client'
import { useState } from 'react'
import Link from 'next/link'

interface DealPatent {
  id: string
  title: string
  slug: string
  status: string
  description: string | null
  inventors: string[]
  tags: string[]
  deal_page_summary: string | null
  deal_page_market: string | null
  licensing_exclusive: boolean
  licensing_nonexclusive: boolean
  licensing_field_of_use: boolean
  marketplace_description?: string | null
  marketplace_tagline?: string | null
  investment_open?: boolean | null
  stage?: string | null
  funding_goal_usd?: number | null
  total_raised_usd?: number | null
  rev_share_available_pct?: number | null
  stage_value_usd?: number | null
  novelty_narrative?: string | null
  created_at?: string | null
  novelty_score?: number | null
  commercial_score?: number | null
  filing_complexity?: number | null
  composite_score?: number | null
  prior_art_citations?: unknown[] | null
  investor_count?: number | null
  key_differentiator?: string | null
}

interface Props {
  patent: DealPatent
  topClaims: string[]
}

const STATUS_LABELS: Record<string, string> = {
  provisional: 'Provisional Patent',
  non_provisional: 'Patent Pending',
  published: 'Patent Published',
  granted: 'Issued Patent',
  abandoned: 'Abandoned',
}

const STATUS_COLORS: Record<string, string> = {
  provisional: 'bg-blue-100 text-blue-800',
  non_provisional: 'bg-indigo-100 text-indigo-800',
  published: 'bg-purple-100 text-purple-800',
  granted: 'bg-green-100 text-green-800',
  abandoned: 'bg-gray-100 text-gray-500',
}

export default function DealPageClient({ patent, topClaims }: Props) {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name || !form.email || !form.message) {
      setError('Name, email, and message are required.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patent_id: patent.id, ...form }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed'); return }
      setSubmitted(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const licensingOptions = [
    patent.licensing_exclusive && 'Exclusive License',
    patent.licensing_nonexclusive && 'Non-Exclusive License',
    patent.licensing_field_of_use && 'Field-of-Use License',
    'Outright Sale / Acquisition',
  ].filter(Boolean) as string[]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a1f36] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">⚖️ PatentPending</Link>
          <span className="text-xs text-gray-400">Patent Licensing Marketplace</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Hero */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_COLORS[patent.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABELS[patent.status] ?? patent.status}
            </span>
            {patent.tags.map(t => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">{t}</span>
            ))}
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
            {patent.title}
          </h1>
          {patent.deal_page_summary ? (
            <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">{patent.deal_page_summary}</p>
          ) : patent.description ? (
            <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">{patent.description.slice(0, 400)}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column — main content */}
          <div className="lg:col-span-2 space-y-6">

            {/* Market Opportunity */}
            {patent.deal_page_market && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">📈 Market Opportunity</h2>
                <p className="text-gray-600 leading-relaxed">{patent.deal_page_market}</p>
              </div>
            )}

            {/* Key Claims */}
            {topClaims.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">🔑 Key Claims</h2>
                <div className="space-y-3">
                  {topClaims.map((claim, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-sm text-gray-700 leading-relaxed pt-0.5">{claim}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Licensing Terms */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">📋 Available Licensing Terms</h2>
              <div className="space-y-2">
                {licensingOptions.map(opt => (
                  <div key={opt} className="flex items-center gap-3">
                    <span className="text-green-500 text-lg">✓</span>
                    <span className="text-gray-700">{opt}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4">
                All licensing structures negotiable. Submit an inquiry to discuss terms.
              </p>
            </div>

          </div>

          {/* Right column — inquiry form */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 sticky top-6">
              {patent.inventors.length > 0 && (
                <div className="mb-5 pb-4 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Inventor(s)</div>
                  <div className="text-sm font-medium text-gray-800">{patent.inventors.join(', ')}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Represented by PatentPending Agency</div>
                </div>
              )}

              {submitted ? (
                <div className="text-center py-6">
                  <div className="text-5xl mb-3">✅</div>
                  <h3 className="font-bold text-gray-900 mb-2">Inquiry Received</h3>
                  <p className="text-sm text-gray-500">
                    We&apos;ll be in touch within 2 business days. Keep an eye on {form.email}.
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="font-bold text-gray-900 mb-4 text-center">Submit Licensing Inquiry</h3>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Jane Smith"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Email *</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="jane@company.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Company</label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Acme Corp"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Message *</label>
                      <textarea
                        rows={4}
                        value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        placeholder="Tell us about your interest and intended use..."
                      />
                    </div>

                    {error && <p className="text-xs text-red-600">{error}</p>}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {submitting ? 'Submitting...' : 'Submit Licensing Inquiry →'}
                    </button>

                    <p className="text-xs text-gray-400 text-center">
                      Represented by Hot Hands LLC · 20% agency commission on deals originated here
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            Patent information and availability subject to change.
            This page is managed by <a href="https://patentpending.app" className="text-indigo-500 hover:underline">PatentPending.app</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
