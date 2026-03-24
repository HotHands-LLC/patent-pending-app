'use client'
import { useState } from 'react'

interface Props {
  patentId: string
  authToken: string
  investmentOpen: boolean
  fundingGoalUsd: number | null
  revShareAvailablePct: number | null
  minInvestmentUsd: number | null
  maxInvestmentUsd: number | null
  onUpdate: (fields: Record<string, unknown>) => void
}

export default function AdminInvestmentGate({
  patentId, authToken,
  investmentOpen, fundingGoalUsd, revShareAvailablePct,
  minInvestmentUsd, maxInvestmentUsd, onUpdate,
}: Props) {
  const [open, setOpen] = useState(investmentOpen)
  const [goal, setGoal] = useState(String(fundingGoalUsd ?? ''))
  const [revShare, setRevShare] = useState(String(revShareAvailablePct ?? ''))
  const [minInvest, setMinInvest] = useState(String(minInvestmentUsd ?? 25))
  const [maxInvest, setMaxInvest] = useState(String(maxInvestmentUsd ?? 10000))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/patents/${patentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          investment_open: open,
          funding_goal_usd: parseInt(goal) || null,
          rev_share_available_pct: parseFloat(revShare) || null,
          min_investment_usd: parseInt(minInvest) || 25,
          max_investment_usd: parseInt(maxInvest) || 10000,
        }),
      })
      if (res.ok) {
        onUpdate({ investment_open: open, funding_goal_usd: parseInt(goal)||null,
          rev_share_available_pct: parseFloat(revShare)||null,
          min_investment_usd: parseInt(minInvest)||25, max_investment_usd: parseInt(maxInvest)||10000 })
        setSaved(true); setTimeout(() => setSaved(false), 2500)
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="mt-4 border border-dashed border-orange-300 rounded-xl overflow-hidden bg-orange-50">
      <div className="px-5 py-3 bg-orange-100 border-b border-orange-200 flex items-center gap-2">
        <span>🔐</span>
        <span className="text-xs font-bold uppercase tracking-wider text-orange-700">Investment Mode</span>
        <span className="text-xs text-orange-500 font-medium">(Admin Only)</span>
        {saved && <span className="text-xs text-green-600 font-semibold ml-auto">Saved ✓</span>}
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-gray-600 leading-relaxed">
          This patent&apos;s public listing uses the connection model. To activate structured investment (Stripe, rev share distributions), enable Investment Mode below. <strong>Use for personal/portfolio raises only.</strong>
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setOpen(false)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors ${!open ? 'bg-white border-gray-400 text-gray-800 shadow-sm' : 'bg-transparent border-gray-200 text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full ${!open ? 'bg-green-500' : 'bg-gray-300'}`} />
            Investment Mode OFF — standard connection marketplace
          </button>
          <button onClick={() => setOpen(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors ${open ? 'bg-orange-600 border-orange-600 text-white shadow-sm' : 'bg-transparent border-gray-200 text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full ${open ? 'bg-white' : 'bg-gray-300'}`} />
            Investment Mode ON — activates Stripe invest flow
          </button>
        </div>
        {open && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Funding goal ($)</label>
              <input type="number" value={goal} onChange={e => setGoal(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                placeholder="e.g. 50000" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Rev share available (%)</label>
              <input type="number" min="0" max="100" value={revShare} onChange={e => setRevShare(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                placeholder="e.g. 15" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Min investment ($)</label>
              <input type="number" value={minInvest} onChange={e => setMinInvest(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                placeholder="25" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Max investment ($)</label>
              <input type="number" value={maxInvest} onChange={e => setMaxInvest(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                placeholder="10000" />
            </div>
          </div>
        )}
        <button onClick={handleSave} disabled={saving}
          className="w-full py-2 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save Investment Settings'}
        </button>
        <p className="text-[11px] text-orange-600 bg-orange-100 px-3 py-2 rounded-lg">
          ⚠️ Investment Mode is visible only to admin. Public listing remains unchanged until Investment Mode is activated and listing is published.
        </p>
      </div>
    </div>
  )
}
