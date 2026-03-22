'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Investment {
  id: string
  patent_id: string
  amount_usd: number
  rev_share_pct: number
  stage_at_investment: string
  status: string
  created_at: string
  // joined
  patent_title: string
  patent_slug: string | null
  patent_stage: string
  patent_total_revenue: number
  my_total_distributions: number
  stage_value_usd: number | null
}

const STAGE_ORDER = ['provisional', 'non_provisional', 'development', 'licensing', 'granted']
const STAGE_LABELS: Record<string, string> = {
  provisional: 'Provisional',
  non_provisional: 'Non-Prov.',
  development: 'Development',
  licensing: 'Licensing',
  granted: 'Granted',
}
const STAGE_LABELS_FULL: Record<string, string> = {
  provisional: 'Provisional',
  non_provisional: 'Non-Provisional',
  development: 'Development',
  licensing: 'Licensing',
  granted: 'Granted',
}

function StageTimeline({ current }: { current: string }) {
  const idx = STAGE_ORDER.indexOf(current)
  return (
    <div className="flex items-center gap-0 mt-2">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-3 h-3 rounded-full border-2 transition-all ${
              i < idx  ? 'bg-indigo-600 border-indigo-600' :
              i === idx ? 'bg-white border-indigo-600 ring-2 ring-indigo-100' :
              'bg-gray-200 border-gray-300'
            }`} />
            <span className={`text-[10px] leading-none text-center ${
              i === idx ? 'font-bold text-indigo-700' : 'text-gray-400'
            }`} style={{ maxWidth: '44px' }}>
              {STAGE_LABELS[s]}
            </span>
          </div>
          {i < STAGE_ORDER.length - 1 && (
            <div className={`h-0.5 w-8 mt-[-14px] ${i < idx ? 'bg-indigo-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: rawInvs } = await supabase
      .from('patent_investments')
      .select('id, patent_id, amount_usd, rev_share_pct, stage_at_investment, status, created_at')
      .eq('investor_user_id', user.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })

    if (!rawInvs?.length) { setLoading(false); return }

    const patentIds = [...new Set(rawInvs.map(i => i.patent_id))]
    const { data: patents } = await supabase
      .from('patents')
      .select('id, title, slug, stage, stage_value_usd')
      .in('id', patentIds)

    const { data: revenues } = await supabase
      .from('patent_revenue_events')
      .select('patent_id, gross_amount_usd')
      .in('patent_id', patentIds)

    const { data: dists } = await supabase
      .from('patent_distributions')
      .select('patent_id, amount_usd, status')
      .eq('investor_user_id', user.id)
      .in('patent_id', patentIds)

    const patentMap = Object.fromEntries((patents ?? []).map(p => [p.id, p]))
    const revenueMap: Record<string, number> = {}
    for (const r of revenues ?? []) revenueMap[r.patent_id] = (revenueMap[r.patent_id] ?? 0) + r.gross_amount_usd
    const distMap: Record<string, number> = {}
    for (const d of dists ?? []) distMap[d.patent_id] = (distMap[d.patent_id] ?? 0) + d.amount_usd

    const merged: Investment[] = rawInvs.map(inv => {
      const p = patentMap[inv.patent_id] ?? {}
      return {
        ...inv,
        patent_title:           p.title ?? 'Unknown Patent',
        patent_slug:            p.slug ?? null,
        patent_stage:           p.stage ?? 'provisional',
        patent_total_revenue:   revenueMap[inv.patent_id] ?? 0,
        my_total_distributions: distMap[inv.patent_id] ?? 0,
        stage_value_usd:        p.stage_value_usd ?? null,
      }
    })

    setInvestments(merged)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const totalInvested = investments.reduce((s, i) => s + i.amount_usd, 0)
  const totalDistributions = investments.reduce((s, i) => s + i.my_total_distributions, 0)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Loading portfolio…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1a1f36] text-white px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="font-bold text-lg">💰 My Investments</h1>
        <Link href="/marketplace" className="ml-auto text-xs text-emerald-300 hover:text-emerald-200">
          Browse More →
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:col-span-2">
            <div className="text-2xl font-black text-[#1a1f36]">${(totalInvested / 100).toLocaleString()}</div>
            <div className="text-xs font-semibold text-gray-500 mt-0.5">Total Invested</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:col-span-2">
            <div className="text-2xl font-black text-emerald-600">${(totalDistributions / 100).toLocaleString()}</div>
            <div className="text-xs font-semibold text-gray-500 mt-0.5">Revenue Distributions Received</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xl font-black text-indigo-700">{investments.length}</div>
            <div className="text-xs font-semibold text-gray-500 mt-0.5">Patents Backed</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xl font-black text-gray-800">
              {investments.length > 0
                ? `${investments.reduce((s, i) => s + Number(i.rev_share_pct), 0).toFixed(2)}%`
                : '0%'}
            </div>
            <div className="text-xs font-semibold text-gray-500 mt-0.5">Total Rev Share</div>
          </div>
        </div>

        {investments.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-4">💰</div>
            <p className="font-medium text-gray-600">No investments yet</p>
            <p className="text-sm mt-1">Browse the <Link href="/marketplace" className="text-indigo-600 hover:underline">marketplace</Link> to find patents to invest in</p>
            <Link href="/marketplace" className="mt-6 inline-block px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">
              Browse Inventions →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {investments.map(inv => (
              <div key={inv.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-sm leading-snug truncate">{inv.patent_title}</h3>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Current stage: <span className="font-medium text-gray-600">{STAGE_LABELS_FULL[inv.patent_stage] ?? inv.patent_stage}</span>
                    </div>
                  </div>
                  {/* Your Stake chip — prominent */}
                  <div className="flex-shrink-0 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-center">
                    <div className="text-xs text-indigo-400 font-semibold mb-0.5">⚡ Your Stake</div>
                    <div className="text-sm font-black text-indigo-800">{Number(inv.rev_share_pct).toFixed(3)}%</div>
                    <div className="text-[10px] text-indigo-400">rev share</div>
                  </div>
                </div>

                {/* Stage Progress Timeline */}
                <StageTimeline current={inv.patent_stage} />

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mt-4">
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-gray-400 mb-0.5">Amount Invested</div>
                    <div className="font-bold text-gray-900">${(inv.amount_usd / 100).toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-gray-400 mb-0.5">Stage When Invested</div>
                    <div className="font-bold text-gray-900">{STAGE_LABELS_FULL[inv.stage_at_investment] ?? inv.stage_at_investment ?? '—'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-gray-400 mb-0.5">Revenue Reported</div>
                    <div className="font-bold text-gray-900">${(inv.patent_total_revenue / 100).toLocaleString()}</div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2.5">
                    <div className="text-emerald-500 mb-0.5">My Distributions</div>
                    <div className="font-bold text-emerald-700">${(inv.my_total_distributions / 100).toLocaleString()}</div>
                  </div>
                </div>

                {/* Stage value milestone */}
                {inv.stage_value_usd != null && inv.stage_value_usd > 0 && (
                  <div className="mt-3 text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Estimated value at current stage: <span className="font-semibold text-amber-800">${(inv.stage_value_usd / 100).toLocaleString()}</span>
                  </div>
                )}

                {/* View deal link */}
                {inv.patent_slug && (
                  <div className="mt-3">
                    <Link href={`/patents/${inv.patent_slug}`}
                      className="text-xs text-indigo-600 hover:underline font-medium">
                      View Deal Page →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Risk footer */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-400 leading-relaxed text-center">
            <strong>Risk Disclosure:</strong> Investing in early-stage IP carries significant risk. Returns are not guaranteed. Patent applications may not be granted. This is not a securities offering.
          </p>
        </div>
      </div>
    </div>
  )
}
