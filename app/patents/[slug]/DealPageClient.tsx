'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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
  // 54D — Pattie-generated marketplace content
  marketplace_description: string | null
  marketplace_tagline: string | null
  // 56A — Investment layer
  investment_open: boolean
  stage: string
  funding_goal_usd: number
  total_raised_usd: number
  rev_share_available_pct: number
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

const STAGE_LABELS: Record<string, string> = {
  provisional: 'Provisional', non_provisional: 'Non-Provisional',
  development: 'Development', licensing: 'Licensing', granted: 'Granted',
}
const STAGE_ORDER = ['provisional', 'non_provisional', 'development', 'licensing', 'granted']

export default function DealPageClient({ patent, topClaims }: Props) {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // 56A — Investment state
  const searchParams = useSearchParams()
  const [investToast, setInvestToast]     = useState(searchParams?.get('invested') === 'true')
  const [investAmount, setInvestAmount]   = useState(100)
  const [investLoading, setInvestLoading] = useState(false)
  const [investError, setInvestError]     = useState('')
  const [myStake, setMyStake]             = useState<{ amount_usd: number; rev_share_pct: number } | null>(null)
  const [authToken, setAuthToken]         = useState('')

  useEffect(() => {
    if (investToast) {
      const t = setTimeout(() => setInvestToast(false), 6000)
      return () => clearTimeout(t)
    }
  }, [investToast])

  useEffect(() => {
    // Load auth session + check if current user has a stake
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setAuthToken(session.access_token)
      // Fetch user's investment in this patent
      supabase
        .from('patent_investments')
        .select('amount_usd, rev_share_pct')
        .eq('patent_id', patent.id)
        .eq('investor_user_id', session.user.id)
        .eq('status', 'confirmed')
        .then(({ data }) => {
          if (data?.length) {
            const totalAmt = data.reduce((s, r) => s + r.amount_usd, 0)
            const totalPct = data.reduce((s, r) => s + Number(r.rev_share_pct), 0)
            setMyStake({ amount_usd: totalAmt, rev_share_pct: totalPct })
          }
        })
    })
  }, [patent.id])

  async function handleInvest() {
    setInvestLoading(true); setInvestError('')
    try {
      const res = await fetch(`/api/patents/${patent.id}/invest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ amount_cents: Math.round(investAmount * 100) }),
      })
      const data = await res.json()
      if (!res.ok) { setInvestError(data.error ?? 'Investment failed'); return }
      if (data.url) window.location.href = data.url
    } catch {
      setInvestError('Network error — please try again.')
    } finally {
      setInvestLoading(false)
    }
  }

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

  const fundingPct = patent.funding_goal_usd > 0
    ? Math.min(100, Math.round((patent.total_raised_usd / patent.funding_goal_usd) * 100))
    : 0
  const perHundredRevPct = patent.funding_goal_usd > 0 && patent.rev_share_available_pct > 0
    ? ((100 / patent.funding_goal_usd) * patent.rev_share_available_pct * 100).toFixed(2)
    : '0'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 56A — Invested toast */}
      {investToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          🎉 Investment confirmed — you now hold a revenue share stake in this patent.
        </div>
      )}
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
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-2">
            {patent.title}
          </h1>
          {/* 54D: Pattie-generated tagline — directly below title */}
          {patent.marketplace_tagline && (
            <p className="text-base text-gray-500 italic mb-3 max-w-2xl">{patent.marketplace_tagline}</p>
          )}
          {patent.deal_page_summary ? (
            <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">{patent.deal_page_summary}</p>
          ) : patent.description ? (
            <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">{patent.description.slice(0, 400)}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column — main content */}
          <div className="lg:col-span-2 space-y-6">

            {/* 54D: Pattie-generated marketplace description — above technical spec */}
            {patent.marketplace_description && (
              <div className="bg-white rounded-2xl border border-purple-200 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-bold text-gray-900">About This Invention</h2>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full border border-purple-200">✨ Pattie</span>
                </div>
                <p className="text-gray-600 leading-relaxed">{patent.marketplace_description}</p>
              </div>
            )}

            {/* 56A — Investment card */}
            {patent.investment_open && (
              <div className="bg-white rounded-2xl border border-emerald-300 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-gray-900">💰 Invest in This Patent</h2>
                  <span className="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                    {STAGE_LABELS[patent.stage] ?? patent.stage}
                  </span>
                </div>

                {/* Funding bar */}
                {patent.funding_goal_usd > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>${(patent.total_raised_usd / 100).toLocaleString()} raised</span>
                      <span>Goal: ${(patent.funding_goal_usd / 100).toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className="bg-emerald-500 h-2.5 rounded-full transition-all"
                           style={{ width: `${fundingPct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{fundingPct}% funded</p>
                  </div>
                )}

                {/* Rev share terms */}
                <div className="bg-emerald-50 rounded-xl p-3 mb-4 text-sm text-emerald-800">
                  <p>Investors share <strong>{patent.rev_share_available_pct}%</strong> of future revenue, proportional to investment.</p>
                  {patent.funding_goal_usd > 0 && (
                    <p className="text-xs mt-1 text-emerald-600">≈ {perHundredRevPct}% revenue share per $100 invested</p>
                  )}
                </div>

                {/* My stake chip */}
                {myStake && (
                  <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-medium text-indigo-800">
                    <span>⚡ Your Stake:</span>
                    <span>${(myStake.amount_usd / 100).toLocaleString()} invested · {Number(myStake.rev_share_pct).toFixed(2)}% rev share</span>
                  </div>
                )}

                {/* Amount input + invest button */}
                {!myStake && (
                  <>
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          min={25}
                          max={10000}
                          step={25}
                          value={investAmount}
                          onChange={e => setInvestAmount(Math.max(25, Math.min(10000, Number(e.target.value))))}
                          className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                      <button
                        onClick={handleInvest}
                        disabled={investLoading || !authToken}
                        className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {investLoading ? 'Loading…' : 'Invest Now'}
                      </button>
                    </div>
                    {!authToken && (
                      <p className="text-xs text-gray-400">
                        <Link href="/login" className="text-indigo-600 hover:underline">Sign in</Link> to invest
                      </p>
                    )}
                    {investError && <p className="text-xs text-red-600 mt-1">{investError}</p>}
                    <p className="text-xs text-gray-400 mt-2">$25 minimum · $10,000 maximum per patent · Stripe-secured</p>
                  </>
                )}
              </div>
            )}

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
                      Represented by PatentPending Agency · 10% commission on deals originated here
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
