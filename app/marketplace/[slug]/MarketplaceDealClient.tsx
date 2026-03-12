'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
interface DealPatent {
  id: string
  title: string
  marketplace_slug: string | null
  status: string
  filing_status: string | null
  inventors: string[] | null
  tags: string[] | null
  description: string | null
  deal_page_brief: string | null
  deal_page_summary: string | null
  deal_page_market: string | null
  license_types: string[] | null
  asking_price_range: string | null
  licensing_exclusive: boolean | null
  licensing_nonexclusive: boolean | null
  licensing_field_of_use: boolean | null
  provisional_app_number: string | null
  provisional_filed_at: string | null
  nonprov_deadline_at: string | null
  marketplace_published_at: string | null
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  provisional:     { label: 'Patent Pending',  cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
  non_provisional: { label: 'Patent Pending',  cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
  granted:         { label: 'Patent Granted ✓', cls: 'bg-green-100 text-green-800 border border-green-300' },
  published:       { label: 'Patent Published', cls: 'bg-blue-100 text-blue-800 border border-blue-300' },
}

// Provisional filed badge overrides status badge
function FilingBadge({ patent }: { patent: DealPatent }) {
  const isProvisionalFiled = patent.filing_status === 'provisional_filed' || patent.filing_status === 'nonprov_filed'
  const badge = STATUS_BADGE[patent.status] ?? { label: patent.status, cls: 'bg-gray-100 text-gray-600 border border-gray-200' }

  if (isProvisionalFiled) {
    return (
      <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
        Patent Pending
      </span>
    )
  }
  if (patent.status === 'granted') {
    return (
      <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-100 text-green-800 border border-green-300">
        Patent Granted ✓
      </span>
    )
  }
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge.cls}`}>
      {badge.label}
    </span>
  )
}

const LICENSE_LABELS: Record<string, string> = {
  exclusive:     'Exclusive License',
  'non-exclusive': 'Non-Exclusive License',
  'field-of-use':  'Field-of-Use License',
  acquisition:   'Full Acquisition',
}

const USE_CASES = [
  {
    icon: '🔒',
    title: 'Secure Facility Communications',
    desc: 'Eliminate RF interference in electromagnetically sensitive environments — hospitals, defense, clean rooms.',
  },
  {
    icon: '📡',
    title: 'IoT Device Pairing',
    desc: 'Proximity-triggered pairing via modulated light pulse — no Bluetooth, no RF, no cross-device interference.',
  },
  {
    icon: '🆔',
    title: 'Proximity Authentication',
    desc: 'Line-of-sight verification for physical access control where passive RF-based credentials are vulnerable.',
  },
]

const INTEREST_TYPES = ['License', 'Acquire', 'Partner', 'Invest', 'Other']

// ── Component ─────────────────────────────────────────────────────────────────
export default function MarketplaceDealClient({ patent }: { patent: DealPatent }) {
  const [form, setForm] = useState({
    name: '', email: '', company: '', interest_type: '', message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef<HTMLDivElement>(null)

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim() || !form.interest_type) {
      setError('Full name, email, and interest type are required.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/marketplace/inquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketplace_slug: patent.marketplace_slug,
          ...form,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed.'); return }
      setSubmitted(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const brief = patent.deal_page_brief ?? patent.deal_page_summary ?? patent.description ?? ''
  const firstSentence = brief.split(/(?<=[.!?])\s/)[0] ?? brief.slice(0, 200)

  const filedAt = patent.provisional_filed_at
    ? new Date(patent.provisional_filed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const licenseTypes = patent.license_types ??
    [
      patent.licensing_exclusive && 'exclusive',
      patent.licensing_nonexclusive && 'non-exclusive',
      patent.licensing_field_of_use && 'field-of-use',
      'acquisition',
    ].filter(Boolean) as string[]

  const licenseText = licenseTypes
    .map(t => LICENSE_LABELS[t] ?? t)
    .join(', ')

  const inventors = patent.inventors ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Nav bar ───────────────────────────────────────────────────── */}
      <div className="bg-[#1a1f36] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/marketplace" className="font-bold text-lg">⚖️ PatentPending</Link>
          <Link href="/marketplace" className="text-xs text-gray-400 hover:text-white transition-colors">
            ← Back to Marketplace
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">

        {/* ── Section 1: Hero ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <FilingBadge patent={patent} />
            {patent.provisional_app_number && (
              <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2.5 py-1 rounded-full">
                App# {patent.provisional_app_number}
              </span>
            )}
            {filedAt && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                Filed {filedAt}
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
            {patent.title}
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-3xl mb-6">{firstSentence}</p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={scrollToForm}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Inquire About Licensing →
            </button>
            <button
              disabled
              title="Coming soon"
              className="px-6 py-3 border border-gray-300 text-gray-400 rounded-xl font-bold text-sm cursor-not-allowed"
            >
              Download 1-Pager ↓
            </button>
          </div>
        </div>

        {/* ── Section 2: Technology Brief ───────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">The Technology</h2>
          <p className="text-gray-600 leading-relaxed mb-5">{brief}</p>
          {licenseTypes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {licenseTypes.map(t => (
                <span key={t} className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100 capitalize">
                  {LICENSE_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 3: Use Case Cards ─────────────────────────────────── */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Potential Applications</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {USE_CASES.map(uc => (
              <div key={uc.title} className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="text-3xl mb-3">{uc.icon}</div>
                <h3 className="text-sm font-bold text-gray-900 mb-1.5">{uc.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 4: Deal Terms ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Deal Structure</h2>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Asking Price</span>
            <span className="text-xl font-extrabold text-gray-900">{patent.asking_price_range ?? 'Open to offers'}</span>
          </div>
          {licenseText && (
            <p className="text-sm text-gray-600 mb-4">
              Available for{' '}<strong>{licenseText}.</strong>
            </p>
          )}
          <p className="text-xs text-gray-400">
            All inquiries are confidential. Patent owner retains all rights until an agreement is executed.
          </p>
        </div>

        {/* ── Section 5: About This Patent ──────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">About This Patent</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {patent.provisional_app_number && (
              <>
                <dt className="font-semibold text-gray-500">Application No.</dt>
                <dd className="text-gray-900 font-mono">{patent.provisional_app_number}</dd>
              </>
            )}
            {filedAt && (
              <>
                <dt className="font-semibold text-gray-500">Filed</dt>
                <dd className="text-gray-900">{filedAt}</dd>
              </>
            )}
            <dt className="font-semibold text-gray-500">Assignee</dt>
            <dd className="text-gray-900">Hot Hands IP, LLC</dd>
            {inventors.length > 0 && (
              <>
                <dt className="font-semibold text-gray-500">Inventor(s)</dt>
                <dd className="text-gray-900">{inventors.join(', ')}</dd>
              </>
            )}
          </dl>
          <div className="mt-4">
            <a
              href="https://patentcenter.uspto.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
            >
              View on USPTO →
            </a>
          </div>
        </div>

        {/* ── Section 6: Inquiry Form ───────────────────────────────────── */}
        <div id="inquiry-form" ref={formRef} className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Get In Touch</h2>
          <p className="text-sm text-gray-500 mb-6">
            All inquiries are confidential. We respond within 2 business days.
          </p>

          {submitted ? (
            <div className="text-center py-10">
              <div className="text-5xl mb-3">✅</div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">Inquiry Received</h3>
              <p className="text-sm text-gray-500">
                Thank you — we&apos;ll be in touch within 2 business days.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Company / Organization</label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Acme Corp"
                  />
                </div>
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
                <label className="block text-xs font-semibold text-gray-500 mb-1">I&apos;m interested in *</label>
                <select
                  value={form.interest_type}
                  onChange={e => setForm(f => ({ ...f, interest_type: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Select an option…</option>
                  {INTEREST_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Message (optional)</label>
                <textarea
                  rows={4}
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Tell us about your interest and intended use…"
                />
              </div>

              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Sending…' : 'Send Inquiry →'}
              </button>
            </form>
          )}
        </div>

      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="mt-12 pb-8 text-center">
        <p className="text-xs text-gray-400">
          Listing managed by{' '}
          <a href="https://patentpending.app" className="text-indigo-500 hover:underline">PatentPending.app</a>
          {' '}· Patent information subject to change.
        </p>
      </footer>
    </div>
  )
}
