'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

type Tab = 'overview' | 'clients' | 'earnings' | 'profile'

interface Stats { total_referrals: number; qualified_referrals: number; pro_months_earned: number; pro_months_balance: number }
interface Referral {
  id: string; status: 'pending' | 'qualified' | 'rewarded' | 'refunded'
  referral_code: string | null; patent_id: string | null
  filing_completed_at: string | null; reward_months: number | null
  reward_granted_at: string | null; created_at: string
  client: { name_first: string | null; name_last: string | null; email: string; created_at: string } | null
  client_patent_count: number
  qualifying_patent_title: string | null
}
interface Partner {
  id: string; full_name: string; firm_name: string | null; bar_number: string | null
  state: string | null; email: string; referral_code: string; status: string
  reward_months_balance: number; reward_months_lifetime: number; pro_months_per_referral: number
  bar_verified: boolean; welcome_email_sent: boolean; practice_areas: string[] | null
  notes: string | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  qualified: 'bg-blue-100 text-blue-700',
  rewarded: 'bg-green-100 text-green-700',
  refunded: 'bg-red-100 text-red-700',
}

export default function PartnerDashboardPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<Partner | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [stats, setStats] = useState<Stats>({ total_referrals: 0, qualified_referrals: 0, pro_months_earned: 0, pro_months_balance: 0 })
  const [earningsHistory, setEarningsHistory] = useState<{ date: string; event: string; reward: string }[]>([])
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<Referral | null>(null)
  const [arc3Dismissed, setArc3Dismissed] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setAuthToken(session.access_token)
      const res = await fetch('/api/partner/me', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const d = await res.json()
      if (!d.partner) {
        // Not a partner — redirect to apply page
        router.push('/partners')
        return
      }
      setPartner(d.partner)
      setReferrals(d.referrals ?? [])
      setStats(d.stats ?? {})
      setEarningsHistory(d.earnings_history ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  async function saveProfile(fields: Record<string, unknown>) {
    if (!authToken) return
    const res = await fetch('/api/partner/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(fields),
    })
    const d = await res.json()
    if (res.ok) { setPartner(d.partner); showToast('✅ Profile saved') }
    else showToast(`⚠️ ${d.error}`)
  }

  function exportEarnings() {
    const rows = [
      ['Date', 'Event', 'Reward', 'Balance'],
      ...earningsHistory.map((e, i) => [
        new Date(e.date).toLocaleDateString(),
        e.event,
        e.reward,
        `${stats.pro_months_earned - (i * (partner?.pro_months_per_referral ?? 3))} months`
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = `data:text/csv,${encodeURIComponent(csv)}`
    a.download = 'partner-earnings.csv'
    a.click()
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    </div>
  )
  if (!partner) return null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  const referralLink = `${appUrl}/signup?ref=${partner.referral_code}`

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {toast && <div className="fixed top-4 right-4 z-50 bg-[#1a1f36] text-white px-4 py-2 rounded-lg text-sm shadow-lg">{toast}</div>}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">Partner Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">{partner.firm_name || partner.full_name}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
              partner.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
              partner.status === 'suspended' ? 'bg-red-50 text-red-700 border-red-200' :
              'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {partner.status === 'approved' ? '● Active' : partner.status.charAt(0).toUpperCase() + partner.status.slice(1)}
            </span>
            {partner.bar_verified && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">✓ Bar Verified</span>}
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
          {(['overview', 'clients', 'earnings', 'profile'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-white shadow-sm text-[#1a1f36]' : 'text-gray-500 hover:text-gray-700'}`}>
              {t} {t === 'clients' && referrals.length > 0 && <span className="ml-1 text-xs bg-indigo-100 text-indigo-700 px-1.5 rounded-full">{referrals.length}</span>}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-5">
            {/* Arc 3 banner */}
            {!arc3Dismissed && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">⚡ Arc 3 Revenue Share — Coming Soon</p>
                  <p className="text-xs text-amber-700 mt-0.5">Every patent filed through your referral link participates in our licensing marketplace. Revenue share for partners is on the way — you'll be first in line.</p>
                </div>
                <button onClick={() => setArc3Dismissed(true)} className="text-amber-400 hover:text-amber-700 text-lg leading-none flex-shrink-0">×</button>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Referrals', value: stats.total_referrals, color: 'text-[#1a1f36]' },
                { label: 'Qualified', value: stats.qualified_referrals, color: 'text-green-600' },
                { label: 'Months Earned', value: stats.pro_months_earned, color: 'text-indigo-600', suffix: ' mo' },
                { label: 'Balance Remaining', value: stats.pro_months_balance, color: 'text-amber-600', suffix: ' mo' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className={`text-3xl font-bold ${s.color}`}>{s.value}{s.suffix ?? ''}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Referral link quick-share */}
            <div className="bg-white rounded-xl border border-indigo-100 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Your Referral Link</p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-indigo-700 break-all">{referralLink}</code>
                <button onClick={() => { navigator.clipboard.writeText(referralLink); showToast('📋 Copied!') }}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex-shrink-0">
                  Copy
                </button>
              </div>
            </div>

            {/* Recent activity */}
            {referrals.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Recent Activity</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {referrals.slice(0, 10).map(r => (
                    <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {r.client ? [r.client.name_first, r.client.name_last].filter(Boolean).join(' ') || r.client.email : 'Unknown client'}
                        </p>
                        <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {referrals.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <div className="text-4xl mb-3">⚖️</div>
                <p className="text-gray-600 font-semibold mb-1">No referrals yet</p>
                <p className="text-sm text-gray-400">Share your referral link to get started. A referral qualifies when a client completes a paid filing.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Clients ──────────────────────────────────────────────────── */}
        {tab === 'clients' && (
          <div>
            {referrals.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No referred clients yet. Share your referral link to start tracking.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Client', 'Signed Up', 'Patents', 'Status', 'Qualifying Patent', 'Earnings'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {referrals.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedClient(r)}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">
                            {r.client ? [r.client.name_first, r.client.name_last].filter(Boolean).join(' ') || '(unnamed)' : '—'}
                          </div>
                          <div className="text-xs text-gray-400">{r.client?.email}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {r.client ? new Date(r.client.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{r.client_patent_count}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                          {r.qualifying_patent_title ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.reward_months ? `${r.reward_months} mo Pro` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Client drill-down modal */}
            {selectedClient && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedClient(null)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-base font-bold text-[#1a1f36]">
                      {selectedClient.client ? [selectedClient.client.name_first, selectedClient.client.name_last].filter(Boolean).join(' ') || selectedClient.client.email : 'Client Details'}
                    </h3>
                    <button onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
                  </div>
                  <div className="space-y-4 text-sm">
                    {selectedClient.client && (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                        <div><span className="font-medium">Email:</span> {selectedClient.client.email}</div>
                        <div><span className="font-medium">Member since:</span> {new Date(selectedClient.client.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                        <div><span className="font-medium">Patents started:</span> {selectedClient.client_patent_count}</div>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-gray-700 mb-2">Referral Timeline</p>
                      <div className="space-y-2">
                        {[
                          { date: selectedClient.created_at, label: 'Signed up via referral link' },
                          selectedClient.filing_completed_at ? { date: selectedClient.filing_completed_at, label: `Filing completed — ${selectedClient.qualifying_patent_title ?? 'patent'}` } : null,
                          selectedClient.reward_granted_at ? { date: selectedClient.reward_granted_at, label: `Reward granted: ${selectedClient.reward_months ?? 3} months Pro` } : null,
                        ].filter(Boolean).map((evt, i) => evt && (
                          <div key={i} className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                            <div>
                              <div className="text-xs text-gray-500">{new Date(evt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                              <div className="text-sm text-gray-700">{evt.label}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[selectedClient.status]}`}>{selectedClient.status}</span>
                      {selectedClient.reward_months && <span className="text-xs text-gray-500">Earnings: {selectedClient.reward_months} months Pro</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Earnings ─────────────────────────────────────────────────── */}
        {tab === 'earnings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white rounded-xl border border-gray-200 px-5 py-3">
                  <div className="text-2xl font-bold text-indigo-600">{stats.pro_months_earned} mo</div>
                  <div className="text-xs text-gray-500">Lifetime earned</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 px-5 py-3">
                  <div className="text-2xl font-bold text-amber-600">{stats.pro_months_balance} mo</div>
                  <div className="text-xs text-gray-500">Balance</div>
                </div>
              </div>
              {earningsHistory.length > 0 && (
                <button onClick={exportEarnings}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50">
                  📥 Export CSV
                </button>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Date', 'Event', 'Reward'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {earningsHistory.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No earnings yet — referrals qualify on completed filings.</td></tr>
                  ) : (
                    earningsHistory.map((e, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 text-gray-500">{new Date(e.date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-gray-800">{e.event}</td>
                        <td className="px-4 py-3 text-green-700 font-semibold">{e.reward}</td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-gray-50">
                    <td colSpan={3} className="px-4 py-3 text-xs text-gray-400 italic">
                      💡 Cash payouts — coming soon. Pro months are credited automatically.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Profile ──────────────────────────────────────────────────── */}
        {tab === 'profile' && (
          <PartnerProfileTab partner={partner} referralLink={referralLink} onSave={saveProfile} />
        )}
      </div>
    </div>
  )
}

// ── Partner Profile Tab ────────────────────────────────────────────────────
function PartnerProfileTab({ partner, referralLink, onSave }: {
  partner: Partner
  referralLink: string
  onSave: (fields: Record<string, unknown>) => void
}) {
  const [firmName, setFirmName] = useState(partner.firm_name ?? '')
  const [barNumber, setBarNumber] = useState(partner.bar_number ?? '')
  const [barState, setBarState] = useState(partner.state ?? '')
  const [specialty, setSpecialty] = useState(
    partner.practice_areas?.join(', ') ?? ''
  )
  const [saved, setSaved] = useState(false)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(referralLink)}`

  async function handleSave() {
    await onSave({ firm_name: firmName, bar_number: barNumber, state: barState, specialty })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Practice Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Firm Name', value: firmName, set: setFirmName },
            { label: 'Bar Number', value: barNumber, set: setBarNumber },
            { label: 'State', value: barState, set: setBarState },
            { label: 'Practice Areas', value: specialty, set: setSpecialty },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">{label}</label>
              <input value={value} onChange={e => set(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
            </div>
          ))}
        </div>
        <button onClick={handleSave}
          className={`mt-4 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${saved ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
          {saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      {/* Referral code + QR */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Referral Tools</h3>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Partner Code</label>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-gray-50 border border-gray-200 rounded px-3 py-1.5">{partner.referral_code}</code>
                <span className="text-xs text-gray-400">(read-only)</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Referral Link</label>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs bg-gray-50 border border-gray-200 rounded px-3 py-1.5 flex-1 break-all text-indigo-700">{referralLink}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(referralLink)}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex-shrink-0">
                  Copy
                </button>
              </div>
            </div>
          </div>
          {/* QR code */}
          <div className="flex flex-col items-center gap-2">
            <img src={qrUrl} alt="Referral QR code" className="w-40 h-40 border border-gray-200 rounded-xl" />
            <a href={qrUrl} download="referral-qr.png"
              className="text-xs text-indigo-600 hover:underline">Download QR →</a>
          </div>
        </div>
      </div>
    </div>
  )
}
