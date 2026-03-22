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
}

const STAGE_ORDER = ['provisional', 'non_provisional', 'development', 'licensing', 'granted']
const STAGE_LABELS: Record<string, string> = {
  provisional: 'Provisional', non_provisional: 'Non-Provisional',
  development: 'Development', licensing: 'Licensing', granted: 'Granted',
}

function StageProgress({ current }: { current: string }) {
  const idx = STAGE_ORDER.indexOf(current)
  return (
    <div className="flex gap-0.5 items-center">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-0.5">
          <div className={`h-1.5 w-8 rounded-full ${i <= idx ? 'bg-indigo-500' : 'bg-gray-200'}`} />
        </div>
      ))}
      <span className="text-xs text-gray-500 ml-1">{STAGE_LABELS[current] ?? current}</span>
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

    // Fetch investments with joined patent data
    const { data: rawInvs } = await supabase
      .from('patent_investments')
      .select('id, patent_id, amount_usd, rev_share_pct, stage_at_investment, status, created_at')
      .eq('investor_user_id', user.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })

    if (!rawInvs?.length) { setLoading(false); return }

    // Fetch patent data for each investment
    const patentIds = [...new Set(rawInvs.map(i => i.patent_id))]
    const { data: patents } = await supabase
      .from('patents')
      .select('id, title, slug, stage')
      .in('id', patentIds)

    // Fetch total revenue per patent
    const { data: revenues } = await supabase
      .from('patent_revenue_events')
      .select('patent_id, gross_amount_usd')
      .in('patent_id', patentIds)

    // Fetch my distributions
    const { data: dists } = await supabase
      .from('patent_distributions')
      .select('patent_id, amount_usd, status')
      .eq('investor_user_id', user.id)
      .in('patent_id', patentIds)

    const patentMap = Object.fromEntries((patents ?? []).map(p => [p.id, p]))
    const revenueMap: Record<string, number> = {}
    for (const r of revenues ?? []) {
      revenueMap[r.patent_id] = (revenueMap[r.patent_id] ?? 0) + r.gross_amount_usd
    }
    const distMap: Record<string, number> = {}
    for (const d of dists ?? []) {
      distMap[d.patent_id] = (distMap[d.patent_id] ?? 0) + d.amount_usd
    }

    const merged: Investment[] = rawInvs.map(inv => {
      const p = patentMap[inv.patent_id] ?? {}
      return {
        ...inv,
        patent_title:           p.title ?? 'Unknown Patent',
        patent_slug:            p.slug ?? null,
        patent_stage:           p.stage ?? 'provisional',
        patent_total_revenue:   revenueMap[inv.patent_id] ?? 0,
        my_total_distributions: distMap[inv.patent_id] ?? 0,
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
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-2xl font-black text-[#1a1f36]">${(totalInvested / 100).toLocaleString()}</div>
            <div className="text-xs font-semibold text-gray-500 mt-0.5">Total Invested</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-2xl font-black text-emerald-600">${(totalDistributions / 100).toLocaleString()}</div>
            <div className="text-xs font-semibold text-gray-500 mt-0.5">Total Distributions Received</div>
          </div>
        </div>

        {investments.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-4">💰</div>
            <p className="font-medium">No investments yet</p>
            <p className="text-sm mt-1">Browse the <Link href="/marketplace" className="text-indigo-600 hover:underline">marketplace</Link> to find patents to invest in</p>
          </div>
        ) : (
          <div className="space-y-4">
            {investments.map(inv => (
              <div key={inv.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm leading-snug mb-1">{inv.patent_title}</h3>
                    <StageProgress current={inv.patent_stage} />
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black text-[#1a1f36]">${(inv.amount_usd / 100).toLocaleString()}</div>
                    <div className="text-xs text-gray-400">invested</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-gray-400 mb-0.5">Rev Share</div>
                    <div className="font-semibold text-gray-800">{Number(inv.rev_share_pct).toFixed(3)}%</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-gray-400 mb-0.5">Revenue Reported</div>
                    <div className="font-semibold text-gray-800">${(inv.patent_total_revenue / 100).toLocaleString()}</div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <div className="text-emerald-500 mb-0.5">My Distributions</div>
                    <div className="font-semibold text-emerald-700">${(inv.my_total_distributions / 100).toLocaleString()}</div>
                  </div>
                </div>

                {inv.patent_slug && (
                  <a href={`/patents/${inv.patent_slug}`} target="_blank" rel="noreferrer"
                    className="text-xs text-indigo-600 hover:underline">
                    View deal page →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
