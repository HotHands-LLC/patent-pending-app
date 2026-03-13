'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { computeIpReadinessScore } from '@/lib/ip-readiness'

// ── Types ─────────────────────────────────────────────────────────────────────
interface DealPatent {
  id: string
  title: string
  marketplace_slug: string | null
  status: string
  filing_status: string | null
  inventors: string[] | null
  tags: string[] | null
  marketplace_tags: string[] | null
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
  ip_readiness_score: number | null
  spec_draft: string | null
  claims_draft: string | null
  abstract_draft: string | null
  figures: unknown[] | null
  youtube_embed_url: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  provisional:     { label: 'Patent Pending',   cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
  non_provisional: { label: 'Patent Pending',   cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
  granted:         { label: 'Patent Granted ✓', cls: 'bg-green-100 text-green-800 border border-green-300' },
  published:       { label: 'Patent Published', cls: 'bg-blue-100 text-blue-800 border border-blue-300' },
}

// ── YouTube embed helper ──────────────────────────────────────────────────────
function getYouTubeEmbedUrl(url: string): string {
  try {
    const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    return match ? `https://www.youtube.com/embed/${match[1]}` : ''
  } catch {
    return ''
  }
}

const LICENSE_LABELS: Record<string, string> = {
  exclusive:       'Exclusive License',
  'non-exclusive': 'Non-Exclusive License',
  'field-of-use':  'Field-of-Use License',
  acquisition:     'Full Acquisition',
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

const INTEREST_OPTIONS = [
  { value: 'license',  label: 'License' },
  { value: 'acquire',  label: 'Acquire' },
  { value: 'partner',  label: 'Partner' },
  { value: 'invest',   label: 'Invest' },
  { value: 'other',    label: 'Other' },
]

// ── Filing badge ──────────────────────────────────────────────────────────────
function FilingBadge({ patent }: { patent: DealPatent }) {
  const isProvisionalFiled = patent.filing_status === 'provisional_filed' || patent.filing_status === 'nonprov_filed'
  if (isProvisionalFiled || patent.status === 'provisional' || patent.status === 'non_provisional') {
    return <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">Patent Pending</span>
  }
  if (patent.status === 'granted') {
    return <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-100 text-green-800 border border-green-300">Patent Granted ✓</span>
  }
  const badge = STATUS_BADGE[patent.status] ?? { label: patent.status, cls: 'bg-gray-100 text-gray-600 border border-gray-200' }
  return <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
}

// ── Gated Inquiry Modal ───────────────────────────────────────────────────────
function InquiryModal({
  patent,
  onClose,
}: {
  patent: DealPatent
  onClose: () => void
}) {
  const [form, setForm] = useState({
    full_name: '', email: '', company: '', phone: '',
    interest_type: '', why_statement: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [firstName, setFirstName]   = useState('')
  const [error, setError]           = useState('')
  const whyLen = form.why_statement.trim().length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Full name and email are required.')
      return
    }
    if (!form.interest_type) {
      setError('Please select your interest type.')
      return
    }
    if (whyLen < 50) {
      setError('Please tell us more about your interest (50 characters minimum).')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/marketplace/inquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: patent.marketplace_slug,
          ...form,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Submission failed — please try again.')
        return
      }
      setFirstName(data.firstName ?? form.full_name.split(' ')[0])
      setSubmitted(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Register Your Interest</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{patent.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          {submitted ? (
            /* ── Step 2: Confirmation ────────────────────────────────────── */
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="font-bold text-gray-900 text-xl mb-3">Inquiry Received</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Thank you, <strong>{firstName}</strong>. Your inquiry has been submitted to the
                PatentPending marketplace team for review.
              </p>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                If approved, we will introduce you to the patent holder directly.
                You&apos;ll hear from us within 2 business days.
              </p>
              <p className="text-xs text-gray-400 leading-relaxed bg-gray-50 rounded-xl p-3">
                🔒 Your inquiry is confidential. Your contact information will not be shared
                with the patent holder without your consent.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2.5 bg-[#1a1f36] text-white rounded-xl text-sm font-semibold hover:bg-[#2d3561] transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            /* ── Step 1: Form ────────────────────────────────────────────── */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Jane Smith"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="jane@company.com"
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Company / Organization</label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Acme Corp"
                    autoComplete="organization"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="+1 (555) 000-0000"
                    autoComplete="tel"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">I am interested in… *</label>
                <select
                  value={form.interest_type}
                  onChange={e => setForm(f => ({ ...f, interest_type: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option value="">Select an option…</option>
                  {INTEREST_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Why are you interested? *
                  <span className={`ml-2 font-normal ${whyLen < 50 ? 'text-amber-500' : 'text-green-600'}`}>
                    {whyLen}/50 min
                  </span>
                </label>
                <textarea
                  rows={4}
                  value={form.why_statement}
                  onChange={e => setForm(f => ({ ...f, why_statement: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  placeholder="Briefly describe your interest in this technology and how you intend to use or commercialize it. (2–3 sentences minimum)"
                />
                <p className="text-xs text-gray-400 mt-1">
                  This helps the patent team evaluate your inquiry. Your information is confidential.
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Submitting…' : 'Submit Inquiry →'}
                </button>
                <p className="text-xs text-gray-400 text-center mt-2">
                  🔒 PatentPending acts as intermediary. Your contact info is never shared without your consent.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarketplaceDealClient({ patent }: { patent: DealPatent }) {
  const [showModal, setShowModal] = useState(false)

  const brief = patent.deal_page_brief ?? patent.deal_page_summary ?? patent.description ?? ''
  const firstSentence = brief.split(/(?<=[.!?])\s/)[0] ?? brief.slice(0, 200)

  const filedAt = patent.provisional_filed_at
    ? new Date(patent.provisional_filed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const licenseTypes = patent.license_types ??
    ([
      patent.licensing_exclusive && 'exclusive',
      patent.licensing_nonexclusive && 'non-exclusive',
      patent.licensing_field_of_use && 'field-of-use',
      'acquisition',
    ].filter(Boolean) as string[])

  const licenseText = licenseTypes
    .map(t => LICENSE_LABELS[t] ?? t)
    .join(', ')

  const inventors = patent.inventors ?? []
  const embedUrl = patent.youtube_embed_url ? getYouTubeEmbedUrl(patent.youtube_embed_url) : ''

  return (
    <>
      {showModal && (
        <InquiryModal patent={patent} onClose={() => setShowModal(false)} />
      )}

      <div className="min-h-screen bg-gray-50">
        {/* Nav */}
        <div className="bg-[#1a1f36] text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <Link href="/marketplace" className="font-bold text-lg">⚖️ PatentPending</Link>
            <Link href="/marketplace" className="text-xs text-gray-400 hover:text-white transition-colors">
              ← Back to Marketplace
            </Link>
          </div>
        </div>

        {/* ── Back to Marketplace ───────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-5">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span>←</span>
            <span>Back to Marketplace</span>
          </Link>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">

          {/* ── Section 1: Hero ───────────────────────────────────────── */}
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

            {/* IP Readiness Score */}
            {(() => {
              const score = patent.ip_readiness_score ?? computeIpReadinessScore(patent)
              return (
                <div className="mb-4 inline-flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">
                      IP Score: {score} / 100
                    </span>
                    <span
                      className="text-gray-400 cursor-help text-xs"
                      title="PatentPending IP Readiness Score reflects the completeness and filing status of this patent. It is not a legal valuation."
                    >
                      ⓘ
                    </span>
                  </div>
                  <div className="w-40 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-400' : 'bg-orange-400'}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              )
            })()}

            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
              {patent.title}
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed max-w-3xl mb-6">{firstSentence}</p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowModal(true)}
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

          {/* ── Section 3: Watch Overview (only when URL is set) ─────── */}
          {embedUrl && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Watch Overview</h2>
              <iframe
                src={embedUrl}
                title="Patent Overview"
                allowFullScreen
                className="w-full aspect-video rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          )}

          {/* ── Section 2: Technology Brief ──────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">The Technology</h2>
            <p className="text-gray-600 leading-relaxed mb-5">{brief}</p>
            <div className="flex flex-wrap gap-2">
              {licenseTypes.map(t => (
                <span key={t} className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100 capitalize">
                  {LICENSE_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          </div>

          {/* ── Section 3: Use Case Cards ─────────────────────────────── */}
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

          {/* ── Section 4: Deal Terms ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Deal Structure</h2>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Asking Price</span>
              <span className="text-xl font-extrabold text-gray-900">{patent.asking_price_range ?? 'Open to offers'}</span>
            </div>
            {licenseText && (
              <p className="text-sm text-gray-600 mb-4">
                Available for <strong>{licenseText}.</strong>
              </p>
            )}
            <p className="text-xs text-gray-400">
              All inquiries are confidential. Patent owner retains all rights until an agreement is executed.
            </p>
          </div>

          {/* ── Section 5: About This Patent ──────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">About This Patent</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {patent.provisional_app_number && (
                <><dt className="font-semibold text-gray-500">Application No.</dt><dd className="text-gray-900 font-mono">{patent.provisional_app_number}</dd></>
              )}
              {filedAt && (
                <><dt className="font-semibold text-gray-500">Filed</dt><dd className="text-gray-900">{filedAt}</dd></>
              )}
              <dt className="font-semibold text-gray-500">Assignee</dt>
              <dd className="text-gray-900">Hot Hands IP, LLC</dd>
              {inventors.length > 0 && (
                <><dt className="font-semibold text-gray-500">Inventor(s)</dt><dd className="text-gray-900">{inventors.join(', ')}</dd></>
              )}
            </dl>
            <div className="mt-4">
              <a href="https://patentcenter.uspto.gov" target="_blank" rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                View on USPTO →
              </a>
            </div>
          </div>

          {/* ── Section 6: Inquiry CTA (bottom of page) ──────────────── */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6 sm:p-8 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Interested in This Technology?</h2>
            <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">
              All inquiries are handled through PatentPending — your contact information is
              kept confidential and will not be shared without your consent.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-8 py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-base hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Inquire About Licensing →
            </button>
            <p className="text-xs text-gray-400 mt-3">
              🔒 PatentPending acts as your privacy bridge. We connect buyers and inventors confidentially.
            </p>
          </div>

        </div>

        <footer className="mt-8 pb-8 text-center">
          <p className="text-xs text-gray-400">
            Listing managed by{' '}
            <a href="https://patentpending.app" className="text-indigo-500 hover:underline">PatentPending.app</a>
            {' '}· Patent information subject to change.
          </p>
        </footer>
      </div>
    </>
  )
}
