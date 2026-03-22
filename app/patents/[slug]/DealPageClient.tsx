'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Related Patents component ─────────────────────────────────────────────────
const DOMAIN_LABELS: Record<string, string> = {
  hardware: '⚙️ Hardware', software: '💻 Software',
  materials: '🧪 Materials', energy: '⚡ Energy',
  medical: '🏥 Medical', other: '🔬 Other',
}
const STAGE_LABELS_SMALL: Record<string, string> = {
  provisional: 'Provisional', non_provisional: 'Non-Provisional',
  development: 'Development', licensing: 'Licensing', granted: 'Granted',
}

interface RelatedPatent {
  id: string; title: string; slug: string; stage: string
  composite_score: number | null; tech_domain: string | null
  novelty_narrative: string | null
}

function RelatedPatents({ patentId }: { patentId: string }) {
  const [related, setRelated] = useState<RelatedPatent[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/patents/${patentId}/related`)
      if (!res.ok) return
      const data = await res.json()
      setRelated(data.related ?? [])
    } catch { /* fail silently */ }
    finally { setLoaded(true) }
  }, [patentId])

  useEffect(() => { load() }, [load])

  // Hide if fewer than 2 results
  if (!loaded || related.length < 2) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">🔗 More Patents to Explore</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {related.map(p => (
          <Link
            key={p.id}
            href={`/patents/${p.slug}`}
            className="group flex flex-col gap-2 p-4 rounded-xl border border-gray-100 hover:border-emerald-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {p.tech_domain && p.tech_domain !== 'other' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                  {DOMAIN_LABELS[p.tech_domain] ?? p.tech_domain}
                </span>
              )}
              {p.composite_score != null && (
                <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                  {p.composite_score}/100
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900 leading-snug group-hover:text-emerald-700 transition-colors">
              {p.title}
            </p>
            {p.novelty_narrative && (
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                {p.novelty_narrative}
              </p>
            )}
            <span className="mt-auto text-xs font-semibold text-emerald-700">
              View Deal →
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

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
  // 59A — Investor experience
  novelty_narrative: string | null
  created_at: string
  novelty_score: number | null
  commercial_score: number | null
  filing_complexity: number | null
  composite_score: number | null
  prior_art_citations: Array<{ title?: string; gap?: string; patent_number?: string }>
  investor_count: number
  // 55E — Independent novelty validation
  key_differentiator: string | null
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

// ScoreBar — investor-friendly labels
function ScoreBar({ label, value, invert = false }: { label: string; value: number | null; invert?: boolean }) {
  if (value == null) return null
  const pct = Math.max(0, Math.min(100, value))
  // For complexity (invert), color green = low
  const fillPct = invert ? (100 - pct) : pct
  const color = fillPct >= 70 ? 'bg-emerald-500' : fillPct >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-40 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${fillPct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">
        {invert ? `${100 - pct}/100` : `${pct}/100`}
      </span>
    </div>
  )
}

export default function DealPageClient({ patent, topClaims }: Props) {
  // 56A — Investment state
  const searchParams = useSearchParams()
  const [investToast, setInvestToast]     = useState(searchParams?.get('invested') === 'true')
  const [investAmount, setInvestAmount]   = useState(100)
  const [investLoading, setInvestLoading] = useState(false)
  const [investError, setInvestError]     = useState('')
  const [myStake, setMyStake]             = useState<{ amount_usd: number; rev_share_pct: number } | null>(null)
  const [authToken, setAuthToken]         = useState('')
  const [isOwner, setIsOwner]             = useState(false)

  // 59A — Lazy novelty narrative
  const [noveltyNarrative, setNoveltyNarrative] = useState<string | null>(patent.novelty_narrative)
  const [narrativeLoading, setNarrativeLoading] = useState(false)

  useEffect(() => {
    if (investToast) {
      const t = setTimeout(() => setInvestToast(false), 6000)
      return () => clearTimeout(t)
    }
  }, [investToast])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setAuthToken(session.access_token)
      // Check ownership
      supabase.from('patents').select('owner_id').eq('id', patent.id).single()
        .then(({ data }) => { if (data?.owner_id === session.user.id) setIsOwner(true) })
      // Fetch stake
      supabase
        .from('patent_investments')
        .select('amount_usd, rev_share_pct')
        .eq('patent_id', patent.id)
        .eq('investor_user_id', session.user.id)
        .eq('status', 'confirmed')
        .then(({ data }) => {
          if (data?.length) {
            setMyStake({
              amount_usd: data.reduce((s, r) => s + r.amount_usd, 0),
              rev_share_pct: data.reduce((s, r) => s + Number(r.rev_share_pct), 0),
            })
          }
        })
    })
  }, [patent.id])

  // Lazy-load novelty narrative if not cached
  useEffect(() => {
    if (noveltyNarrative || !patent.investment_open) return
    setNarrativeLoading(true)
    fetch(`/api/patents/${patent.id}/novelty-narrative`)
      .then(r => r.json())
      .then(d => { if (d.narrative) setNoveltyNarrative(d.narrative) })
      .catch(() => {})
      .finally(() => setNarrativeLoading(false))
  }, [patent.id, patent.investment_open, noveltyNarrative])

  async function handleInvest() {
    if (!authToken) {
      window.location.href = `/login?next=/patents/${patent.slug}`
      return
    }
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

  const fundingPct = patent.funding_goal_usd > 0
    ? Math.min(100, Math.round((patent.total_raised_usd / patent.funding_goal_usd) * 100))
    : 0
  // Values stored in cents
  const raisedDollars = patent.total_raised_usd / 100
  const goalDollars = patent.funding_goal_usd / 100
  const perHundredRevPct = patent.funding_goal_usd > 0 && patent.rev_share_available_pct > 0
    ? ((100 / (patent.funding_goal_usd / 100)) * patent.rev_share_available_pct * 100).toFixed(2)
    : '0'

  const licensingOptions = [
    patent.licensing_exclusive && 'Exclusive License',
    patent.licensing_nonexclusive && 'Non-Exclusive License',
    patent.licensing_field_of_use && 'Field-of-Use License',
    'Outright Sale / Acquisition',
  ].filter(Boolean) as string[]

  const hasScores = patent.novelty_score != null || patent.commercial_score != null

  const stageIdx = STAGE_ORDER.indexOf(patent.stage)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Invested toast */}
      {investToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          🎉 Investment confirmed — you now hold a revenue share stake in this patent.
        </div>
      )}

      {/* Nav */}
      <div className="bg-[#1a1f36] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">⚖️ PatentPending</Link>
          <div className="flex items-center gap-3">
            <Link href="/marketplace" className="text-xs text-gray-300 hover:text-white">← All Inventions</Link>
            {isOwner && (
              <Link href={`/dashboard/patents/${patent.id}`} className="text-xs bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 rounded-lg font-semibold">
                Manage Patent →
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">

        {/* ── Section 1: Header ─────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_COLORS[patent.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABELS[patent.status] ?? patent.status}
            </span>
            {patent.composite_score != null && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                Score: {patent.composite_score}/100
              </span>
            )}
            {patent.tags.map(t => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">{t}</span>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-2">
            {patent.title}
          </h1>
          {patent.marketplace_tagline && (
            <p className="text-base text-gray-500 italic mb-3 max-w-2xl">{patent.marketplace_tagline}</p>
          )}

          {/* Stage timeline */}
          <div className="flex items-center gap-1 mt-4">
            {STAGE_ORDER.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded-full border-2 ${
                  i < stageIdx ? 'bg-indigo-600 border-indigo-600' :
                  i === stageIdx ? 'bg-white border-indigo-600 ring-2 ring-indigo-200' :
                  'bg-gray-200 border-gray-200'
                }`} />
                <span className={`text-xs ${i === stageIdx ? 'font-bold text-indigo-700' : 'text-gray-400'}`}>
                  {STAGE_LABELS[s]}
                </span>
                {i < STAGE_ORDER.length - 1 && (
                  <div className={`w-6 h-0.5 ${i < stageIdx ? 'bg-indigo-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Left column — main content ─────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* ── Section 2: Funding Bar ────────────────────────────────── */}
            {patent.investment_open && patent.funding_goal_usd > 0 && (
              <div className="bg-white rounded-2xl border border-emerald-200 p-6">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-gray-900">Funding Progress</span>
                  <span className="text-sm font-bold text-emerald-700">{fundingPct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
                  <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${fundingPct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mb-3">
                  <span className="font-semibold text-gray-800">${raisedDollars.toLocaleString()} raised</span>
                  <span>of ${goalDollars.toLocaleString()} goal</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                  {patent.investor_count > 0 && (
                    <span>👥 {patent.investor_count} investor{patent.investor_count !== 1 ? 's' : ''}</span>
                  )}
                  {patent.rev_share_available_pct > 0 && (
                    <span>📊 {patent.rev_share_available_pct}% revenue share pool</span>
                  )}
                  {perHundredRevPct !== '0' && (
                    <span>≈ {perHundredRevPct}% stake per $100 invested</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Section 3: About This Invention ──────────────────────── */}
            {(patent.marketplace_description || patent.deal_page_summary || patent.description || patent.key_differentiator) && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">About This Invention</h2>

                {/* 55E: key_differentiator pull quote — most investor-readable sentence */}
                {patent.key_differentiator && (
                  <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-700 my-4 text-base leading-relaxed">
                    {patent.key_differentiator}
                  </blockquote>
                )}

                {patent.marketplace_description ? (
                  <div className="space-y-3">
                    {patent.marketplace_description.split('\n\n').map((para, i) => (
                      <p key={i} className="text-gray-600 leading-relaxed">{para}</p>
                    ))}
                  </div>
                ) : (patent.deal_page_summary || patent.description) ? (
                  <p className="text-gray-600 leading-relaxed">
                    {(patent.deal_page_summary ?? patent.description ?? '').slice(0, 300)}
                  </p>
                ) : null}
              </div>
            )}

            {/* ── Section 4: Why This Is Novel ─────────────────────────── */}
            {patent.investment_open && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">💡 Why This Invention Is Novel</h2>
                {narrativeLoading ? (
                  <div className="text-sm text-gray-400 animate-pulse">Generating novelty analysis…</div>
                ) : noveltyNarrative ? (
                  <p className="text-gray-700 leading-relaxed mb-4">{noveltyNarrative}</p>
                ) : (
                  <p className="text-gray-400 text-sm">Novelty analysis available after AI evaluation.</p>
                )}

                {/* Prior art gaps — investor-friendly */}
                {patent.prior_art_citations.filter(c => c.gap).length > 0 && (
                  <div className="mt-4 space-y-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Goes Beyond Existing Patents</h3>
                    {patent.prior_art_citations.filter(c => c.gap).slice(0, 4).map((c, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 text-emerald-500 mt-0.5">✓</span>
                        <span className="text-gray-600 leading-relaxed">{c.gap}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Section 5: Scoring ────────────────────────────────────── */}
            {hasScores && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">📊 Invention Scoring</h2>
                <p className="text-xs text-gray-400 mb-4">AI-evaluated across three dimensions. Higher is better except complexity (lower = simpler to develop).</p>
                <div className="space-y-3">
                  <ScoreBar label="How Original" value={patent.novelty_score} />
                  <ScoreBar label="Market Opportunity" value={patent.commercial_score} />
                  <ScoreBar label="Development Complexity" value={patent.filing_complexity} invert />
                </div>
                {patent.composite_score != null && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Overall Score</span>
                    <span className="text-2xl font-black text-indigo-700">{patent.composite_score}<span className="text-sm font-normal text-gray-400">/100</span></span>
                  </div>
                )}
              </div>
            )}

            {/* ── Section 6: The Inventor ───────────────────────────────── */}
            {patent.inventors.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">👤 The Inventor</h2>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                    {patent.inventors[0].charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{patent.inventors[0]}</div>
                    <div className="text-xs text-gray-400">
                      Member since {new Date(patent.created_at).getFullYear()} · PatentPending platform
                    </div>
                  </div>
                </div>
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

            {/* Licensing Terms (for non-investors / licensing interest) */}
            {licensingOptions.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">📋 Available Licensing Terms</h2>
                <div className="space-y-2">
                  {licensingOptions.map(opt => (
                    <div key={opt} className="flex items-center gap-3">
                      <span className="text-green-500 text-lg">✓</span>
                      <span className="text-gray-700 text-sm">{opt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Related Patents ───────────────────────────────────────── */}
            <RelatedPatents patentId={patent.id} />

            {/* ── Section 7: Risk Disclosure ────────────────────────────── */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                <strong>Risk Disclosure:</strong> Investing in early-stage intellectual property carries significant risk.
                Returns are not guaranteed. Patent applications may not be granted. This is not a securities offering.
                Past performance of any patent or inventor is not indicative of future results.
              </p>
            </div>
          </div>

          {/* ── Right column — invest CTA ─────────────────────────────── */}
          <div className="lg:col-span-1">

            {/* ── Invest card (sticky) ─────────────────────────────────── */}
            {patent.investment_open ? (
              <div className="bg-white rounded-2xl border border-emerald-300 shadow-sm p-6 sticky top-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-gray-900">💰 Invest Now</h3>
                  <span className="text-xs font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                    {STAGE_LABELS[patent.stage] ?? patent.stage}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">Earn a share of future licensing revenue.</p>

                {/* My stake chip — prominent */}
                {myStake && (
                  <div className="mb-4 flex items-center justify-between px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm font-semibold text-indigo-800">
                    <span>⚡ Your Stake</span>
                    <span>${(myStake.amount_usd / 100).toLocaleString()} · {Number(myStake.rev_share_pct).toFixed(3)}%</span>
                  </div>
                )}

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
                          className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                      <button
                        onClick={handleInvest}
                        disabled={investLoading}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {investLoading ? 'Loading…' : 'Invest →'}
                      </button>
                    </div>
                    {!authToken && (
                      <p className="text-xs text-gray-400 mb-2">
                        <Link href={`/login?next=/patents/${patent.slug}`} className="text-indigo-600 hover:underline font-medium">Sign in</Link> to invest
                      </p>
                    )}
                    {investError && <p className="text-xs text-red-600 mb-2">{investError}</p>}
                    <p className="text-xs text-gray-400">$25 minimum · Stripe-secured</p>
                  </>
                )}

                {/* Rev share terms */}
                {patent.rev_share_available_pct > 0 && (
                  <div className="mt-4 bg-emerald-50 rounded-lg p-3 text-xs text-emerald-800">
                    <p>Investors share <strong>{patent.rev_share_available_pct}%</strong> of future revenue, proportional to investment.</p>
                    {perHundredRevPct !== '0' && (
                      <p className="text-emerald-600 mt-1">≈ {perHundredRevPct}% revenue share per $100 invested</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Licensing inquiry card for non-investment patents */
              <LicensingInquiryCard patent={patent} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            Patent information and availability subject to change.
            Managed by <a href="https://patentpending.app" className="text-indigo-500 hover:underline">PatentPending.app</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

// Licensing inquiry card — shown when investment_open = false
function LicensingInquiryCard({ patent }: { patent: DealPatent }) {
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

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 sticky top-6 text-center">
        <div className="text-5xl mb-3">✅</div>
        <h3 className="font-bold text-gray-900 mb-2">Inquiry Received</h3>
        <p className="text-sm text-gray-500">We&apos;ll be in touch within 2 business days.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-6 sticky top-6">
      {patent.inventors.length > 0 && (
        <div className="mb-5 pb-4 border-b border-gray-100">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Inventor(s)</div>
          <div className="text-sm font-medium text-gray-800">{patent.inventors.join(', ')}</div>
        </div>
      )}
      <h3 className="font-bold text-gray-900 mb-4 text-center">Submit Licensing Inquiry</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        {['name', 'email', 'company'].map(field => (
          <div key={field}>
            <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">
              {field}{field !== 'company' ? ' *' : ''}
            </label>
            <input
              type={field === 'email' ? 'email' : 'text'}
              value={form[field as keyof typeof form]}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={field === 'name' ? 'Jane Smith' : field === 'email' ? 'jane@company.com' : 'Acme Corp'}
            />
          </div>
        ))}
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
          10% commission on deals originated here
        </p>
      </form>
    </div>
  )
}
