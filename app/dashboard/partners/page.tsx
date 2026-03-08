'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'
import { computeStepStatus, currentStep, FILING_STEPS } from '@/components/FilingProgressTracker'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PartnerProfile {
  id: string; partner_code: string; firm_name: string | null; bar_id: string | null
  bar_state: string | null; bar_verified: boolean; practice_areas: string[] | null
  status: 'pending' | 'active' | 'suspended'
  reward_months_balance: number; reward_months_lifetime: number
  pro_months_per_referral: number
  slug: string | null; bio: string | null
  custom_domain: string | null; custom_domain_verified: boolean
  custom_domain_cname_target: string | null
  counsel_partner: { id: string; email: string; full_name: string; referral_code: string; firm_name: string | null } | null
}

interface Referral {
  id: string; referral_code: string; status: 'pending' | 'qualified' | 'rewarded' | 'refunded'
  patent_id: string | null; filing_completed_at: string | null
  reward_months: number | null; reward_granted_at: string | null; created_at: string
  referred_user: { id: string; email: string; full_name: string | null; name_first: string | null; name_last: string | null; created_at: string } | null
  patent_count: number
  user_patents: Array<{ id: string; title: string; filing_status: string | null; status: string; cover_sheet_acknowledged: boolean; figures_uploaded: boolean; claims_draft: string | null }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700'  },
  qualified: { label: 'Qualified', cls: 'bg-blue-100 text-blue-700'    },
  rewarded:  { label: 'Rewarded',  cls: 'bg-green-100 text-green-700'  },
  refunded:  { label: 'Refunded',  cls: 'bg-red-100 text-red-700'      },
}

function clientName(r: Referral): string {
  if (!r.referred_user) return 'Referred User'
  return [r.referred_user.name_first, r.referred_user.name_last].filter(Boolean).join(' ')
    || r.referred_user.full_name || r.referred_user.email || 'Client'
}

function stepFor(pat: { filing_status: string | null; status: string; cover_sheet_acknowledged: boolean; figures_uploaded: boolean; claims_draft: string | null }): number {
  // Quick step approximation for partner read-only view
  if (pat.status === 'non_provisional' || pat.filing_status === 'filed') return 9
  if (pat.cover_sheet_acknowledged) return 8
  if (pat.figures_uploaded) return 7
  if (pat.filing_status === 'approved') return 5
  if (pat.claims_draft) return 4
  return 2
}

// ── QR code (client-side, no external lib) ────────────────────────────────────
function QRPlaceholder({ url }: { url: string }) {
  return (
    <div className="text-center">
      <div className="w-32 h-32 mx-auto border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-1 bg-gray-50">
        <span className="text-xs text-gray-400 text-center px-2">QR code<br/>(print to generate)</span>
      </div>
      <div className="text-xs text-gray-400 break-all max-w-[200px] mx-auto">{url}</div>
    </div>
  )
}

// ── Stats Card ────────────────────────────────────────────────────────────────
function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="text-2xl font-bold text-[#1a1f36]">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

// ── Client Drill-down Modal ───────────────────────────────────────────────────
function ClientModal({ referral, onClose }: { referral: Referral; onClose: () => void }) {
  const name = clientName(referral)
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 my-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-[#1a1f36] text-lg">{name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        {/* Client info */}
        <div className="text-sm text-gray-600 space-y-1 mb-5">
          <div><span className="text-gray-400">Email:</span> {referral.referred_user?.email ?? '—'}</div>
          <div><span className="text-gray-400">Member since:</span> {referral.referred_user ? new Date(referral.referred_user.created_at).toLocaleDateString() : '—'}</div>
          <div><span className="text-gray-400">Referral status:</span>{' '}
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[referral.status]?.cls ?? ''}`}>
              {STATUS_BADGE[referral.status]?.label ?? referral.status}
            </span>
          </div>
          {referral.reward_granted_at && (
            <div><span className="text-gray-400">Reward granted:</span> {new Date(referral.reward_granted_at).toLocaleDateString()} ({referral.reward_months}mo Pro)</div>
          )}
        </div>
        {/* Patent list */}
        <div className="mb-4">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Patents</div>
          {referral.user_patents.length === 0 ? (
            <p className="text-sm text-gray-400">No patents started yet.</p>
          ) : (
            <div className="space-y-2">
              {referral.user_patents.map(p => (
                <div key={p.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="text-sm font-medium text-[#1a1f36] truncate">{p.title || 'Untitled'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">Step {stepFor(p)} / 9</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(stepFor(p) / 9) * 100}%` }} />
                    </div>
                    {p.filing_status === 'filed' && <span className="text-xs text-green-600 font-semibold">Filed ✓</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Timeline */}
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Timeline</div>
          <div className="space-y-1 text-sm">
            <div className="text-gray-500">Signed up · {referral.referred_user ? new Date(referral.referred_user.created_at).toLocaleDateString() : '—'}</div>
            {referral.filing_completed_at && (
              <div className="text-gray-500">Filed · {new Date(referral.filing_completed_at).toLocaleDateString()}</div>
            )}
            {referral.reward_granted_at && (
              <div className="text-green-600">Reward granted · {new Date(referral.reward_granted_at).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PartnerDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<'overview' | 'clients' | 'earnings' | 'profile'>('overview')
  const [partnerProfile, setPartnerProfile] = useState<PartnerProfile | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null)
  const [toast, setToast] = useState('')
  const [arc3Dismissed, setArc3Dismissed] = useState(false)
  // Profile edit state
  const [editFirm, setEditFirm] = useState('')
  const [editBar, setEditBar] = useState('')
  const [editState, setEditState] = useState('')
  const [editBio, setEditBio] = useState('')
  const [saving, setSaving] = useState(false)
  const refLinkRef = useRef<HTMLInputElement>(null)
  // Custom domain state
  const [domainInput, setDomainInput] = useState('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainVerifying, setDomainVerifying] = useState(false)
  const [domainMsg, setDomainMsg] = useState('')
  const [domainVerified, setDomainVerified] = useState(false)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setAuthToken(session.access_token)

      const [ppRes, refRes] = await Promise.all([
        fetch('/api/partner/profile', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/partner/referrals', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ])
      const { profile } = await ppRes.json()
      const { referrals: refs } = await refRes.json()

      if (!profile) {
        // Not a partner — redirect to partner signup landing
        router.push('/partners')
        return
      }

      setPartnerProfile(profile)
      setReferrals(refs ?? [])
      setEditFirm(profile.firm_name ?? '')
      setEditBar(profile.bar_id ?? '')
      setEditState(profile.bar_state ?? '')
      setEditBio(profile.bio ?? '')
      setDomainInput(profile.custom_domain ?? '')
      setDomainVerified(profile.custom_domain_verified ?? false)
      setLoading(false)
    }
    load()
  }, [router])

  async function saveProfile() {
    if (!authToken) return
    setSaving(true)
    const res = await fetch('/api/partner/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ firm_name: editFirm, bar_id: editBar, bar_state: editState, bio: editBio }),
    })
    setSaving(false)
    if (res.ok) {
      const { profile } = await res.json()
      setPartnerProfile(profile)
      showToast('✅ Profile saved')
    } else {
      showToast('⚠️ Save failed')
    }
  }

  function exportEarningsCSV() {
    const rewarded = referrals.filter(r => r.status === 'rewarded' || r.status === 'qualified')
    const rows = [
      ['Date', 'Client', 'Status', 'Reward (months)', 'Patent'].join(','),
      ...rewarded.map(r => [
        r.reward_granted_at ? new Date(r.reward_granted_at).toLocaleDateString() : '',
        clientName(r),
        r.status,
        r.reward_months ?? 0,
        r.user_patents[0]?.title ?? '—',
      ].join(',')),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'patentpending-earnings.csv'
    a.click()
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    </div>
  )

  if (!partnerProfile) return null

  const refCode   = partnerProfile.partner_code ?? partnerProfile.counsel_partner?.referral_code ?? ''
  const appUrl    = typeof window !== 'undefined' ? window.location.origin : 'https://patentpending.app'
  const refLink   = `${appUrl}/signup?ref=${refCode}`
  const vanityUrl = partnerProfile.slug ? `${appUrl}/p/${partnerProfile.slug}` : null
  const primaryUrl = vanityUrl ?? refLink
  const cnameTarget = partnerProfile.custom_domain_cname_target ?? 'partners.patentpending.app'

  async function saveDomain() {
    if (!authToken || !domainInput.trim()) return
    setDomainSaving(true)
    const res = await fetch('/api/partner/verify-domain', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ domain: domainInput.trim() }),
    })
    setDomainSaving(false)
    if (res.ok) { showToast('✅ Domain saved — add the CNAME record and verify'); setDomainVerified(false) }
    else { showToast('⚠️ Failed to save domain') }
  }

  async function verifyDomain() {
    if (!authToken) return
    setDomainVerifying(true)
    setDomainMsg('')
    const res = await fetch('/api/partner/verify-domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({}),
    })
    const d = await res.json()
    setDomainVerifying(false)
    setDomainMsg(d.message ?? '')
    setDomainVerified(d.verified ?? false)
    if (d.verified) showToast('✅ Domain verified!')
  }

  const totalRefs     = referrals.length
  const qualifiedRefs = referrals.filter(r => r.status === 'qualified' || r.status === 'rewarded').length
  const monthsEarned  = partnerProfile.reward_months_lifetime
  const monthsBal     = partnerProfile.reward_months_balance

  const statusPending = partnerProfile.status === 'pending'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#1a1f36] text-white px-4 py-2 rounded-lg text-sm shadow-lg">{toast}</div>
      )}
      {selectedReferral && (
        <ClientModal referral={selectedReferral} onClose={() => setSelectedReferral(null)} />
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">Partner Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">
              {partnerProfile.firm_name ?? partnerProfile.counsel_partner?.full_name ?? 'Partner'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              partnerProfile.status === 'active' ? 'bg-green-100 text-green-700 border-green-300' :
              partnerProfile.status === 'suspended' ? 'bg-red-100 text-red-700 border-red-200' :
              'bg-amber-100 text-amber-700 border-amber-300'
            }`}>
              {partnerProfile.status.charAt(0).toUpperCase() + partnerProfile.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Pending notice */}
        {statusPending && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>Application pending review.</strong> You'll receive a welcome email once approved. Your referral link is already active — any signups before approval will be credited retroactively.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(['overview', 'clients', 'earnings', 'profile'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors -mb-px border-b-2 ${
                tab === t ? 'border-[#1a1f36] text-[#1a1f36]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Arc 3 banner */}
            {!arc3Dismissed && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
                <span className="text-xl">🚀</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">Arc 3 Revenue Share — Coming Soon</p>
                  <p className="text-xs text-amber-700 mt-0.5">Every patent filed through your referral link participates in the PatentPending licensing marketplace. Partner revenue share on licensing deals is on the way.</p>
                </div>
                <button onClick={() => setArc3Dismissed(true)} className="text-amber-400 hover:text-amber-600 text-xs">✕</button>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Total Referrals" value={totalRefs} />
              <Stat label="Qualified Filings" value={qualifiedRefs} />
              <Stat label="Pro Months Earned" value={monthsEarned} sub="lifetime" />
              <Stat label="Pro Months Balance" value={monthsBal} sub="remaining" />
            </div>

            {/* Referral link quick copy */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                {vanityUrl ? 'Your Profile Link' : 'Your Referral Link'}
              </div>
              <div className="flex gap-2">
                <input readOnly ref={refLinkRef} value={primaryUrl}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 font-mono text-gray-700" />
                <button onClick={() => { navigator.clipboard.writeText(primaryUrl); showToast('📋 Link copied!') }}
                  className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors whitespace-nowrap">
                  Copy
                </button>
              </div>
              {vanityUrl && (
                <p className="text-xs text-gray-400 mt-2">
                  Raw code link: <span className="font-mono">{refLink}</span>
                </p>
              )}
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recent Activity</span>
              </div>
              {referrals.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No referrals yet. Share your link to get started.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {referrals.slice(0, 10).map(r => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedReferral(r)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#1a1f36] truncate">{clientName(r)}</div>
                        <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status]?.cls}`}>
                        {STATUS_BADGE[r.status]?.label}
                      </span>
                      {r.reward_months && <span className="text-xs text-green-600 font-semibold">+{r.reward_months}mo</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Clients ──────────────────────────────────────────────────── */}
        {tab === 'clients' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {referrals.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <div className="text-4xl mb-3">👥</div>
                <p className="text-sm font-medium">No referred clients yet</p>
                <p className="text-xs text-gray-300 mt-1">Share your referral link to bring in clients</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Client', 'Signed Up', 'Patents', 'Step', 'Status', 'Earnings'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referrals.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedReferral(r)}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1a1f36]">{clientName(r)}</div>
                        <div className="text-xs text-gray-400">{r.referred_user?.email ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {r.referred_user ? new Date(r.referred_user.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{r.patent_count}</td>
                      <td className="px-4 py-3">
                        {r.user_patents[0] ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{stepFor(r.user_patents[0])}/9</span>
                            <div className="w-16 bg-gray-100 rounded-full h-1.5">
                              <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(stepFor(r.user_patents[0]) / 9) * 100}%` }} />
                            </div>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status]?.cls}`}>
                          {STATUS_BADGE[r.status]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-green-600 font-semibold text-sm">
                        {r.reward_months ? `${r.reward_months} mo Pro` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab: Earnings ─────────────────────────────────────────────────── */}
        {tab === 'earnings' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={exportEarningsCSV}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
                ↓ Export CSV
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Date', 'Event', 'Client', 'Reward', 'Balance'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referrals.filter(r => r.reward_granted_at).map((r, i) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {r.reward_granted_at ? new Date(r.reward_granted_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-[#1a1f36]">Filing completed</td>
                      <td className="px-4 py-3 text-gray-700">{clientName(r)}</td>
                      <td className="px-4 py-3 text-green-600 font-semibold">+{r.reward_months ?? 0} mo Pro</td>
                      <td className="px-4 py-3 text-gray-500">
                        {(() => {
                          const prev = referrals.filter(x => x.reward_granted_at && x.reward_granted_at <= r.reward_granted_at!).reduce((s, x) => s + (x.reward_months ?? 0), 0)
                          return `${prev} mo`
                        })()}
                      </td>
                    </tr>
                  ))}
                  {referrals.filter(r => r.reward_granted_at).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No earnings yet — earnings appear when a referred client files</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={3} className="px-4 py-3 text-xs text-gray-500 italic">Cash payouts — coming soon</td>
                    <td colSpan={2} className="px-4 py-3 text-sm font-bold text-[#1a1f36]">Total: {monthsEarned} mo</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Profile ──────────────────────────────────────────────────── */}
        {tab === 'profile' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Edit form */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <h2 className="font-semibold text-[#1a1f36]">Partner Profile</h2>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Firm Name</label>
                  <input value={editFirm} onChange={e => setEditFirm(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Bar ID</label>
                    <input value={editBar} onChange={e => setEditBar(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">State</label>
                    <input value={editState} onChange={e => setEditState(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Bio (shown on your public profile page)</label>
                  <textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={3} placeholder="Brief description of your practice…"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none" />
                </div>
                <div className="flex items-center gap-2">
                  {partnerProfile.bar_verified
                    ? <span className="text-xs text-green-600 font-semibold">✅ Bar verified by admin</span>
                    : <span className="text-xs text-amber-600">Bar verification pending admin review</span>}
                </div>
                <button onClick={saveProfile} disabled={saving}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>

              {/* Referral links + QR */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <h2 className="font-semibold text-[#1a1f36]">Referral Links</h2>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Partner Code</label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-[#1a1f36] text-[#f5a623] px-3 py-1.5 rounded-lg">{refCode}</code>
                    <button onClick={() => { navigator.clipboard.writeText(refCode); showToast('📋 Code copied!') }}
                      className="text-xs text-indigo-500 hover:text-indigo-700">Copy</button>
                  </div>
                </div>

                {vanityUrl && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Profile Page (Primary)</label>
                    <div className="flex gap-2">
                      <input readOnly value={vanityUrl}
                        className="flex-1 text-xs border border-indigo-200 rounded-lg px-3 py-2 bg-indigo-50 font-mono text-indigo-700" />
                      <button onClick={() => { navigator.clipboard.writeText(vanityUrl); showToast('📋 Vanity link copied!') }}
                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 whitespace-nowrap">
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Share this link — it auto-credits your referral</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                    {vanityUrl ? 'Raw Code Link (fallback)' : 'Referral URL'}
                  </label>
                  <div className="flex gap-2">
                    <input readOnly value={refLink}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 font-mono text-gray-600" />
                    <button onClick={() => { navigator.clipboard.writeText(refLink); showToast('📋 Link copied!') }}
                      className="px-3 py-2 bg-[#1a1f36] text-white rounded-lg text-xs font-semibold hover:bg-[#2d3561] whitespace-nowrap">
                      Copy
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Earning {partnerProfile.pro_months_per_referral} month{partnerProfile.pro_months_per_referral !== 1 ? 's' : ''} Pro per completed filing
                </div>
                <QRPlaceholder url={primaryUrl} />
              </div>
            </div>

            {/* Custom Domain Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-[#1a1f36] mb-1">Custom Domain</h2>
              <p className="text-xs text-gray-400 mb-5">
                Point your own subdomain to your PatentPending profile page — e.g. <code className="font-mono bg-gray-100 px-1 rounded">patents.yourfirm.com</code>
              </p>
              <div className="max-w-xl space-y-4">
                {/* Input */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Subdomain</label>
                  <div className="flex gap-2">
                    <input
                      value={domainInput}
                      onChange={e => setDomainInput(e.target.value)}
                      placeholder="patents.yourfirm.com"
                      className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-indigo-400"
                    />
                    <button onClick={saveDomain} disabled={domainSaving || !domainInput.trim()}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                      {domainSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* DNS Instructions (shown after domain is saved) */}
                {(partnerProfile.custom_domain || domainInput) && !domainVerified && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Add this DNS record</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400">
                          {['Type', 'Name', 'Value'].map(h => (
                            <th key={h} className="text-left pb-1 font-semibold pr-4">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        <tr>
                          <td className="text-gray-700 pr-4">CNAME</td>
                          <td className="text-gray-700 pr-4">{domainInput.split('.')[0] || '@'}</td>
                          <td className="text-indigo-600 flex items-center gap-2">
                            {cnameTarget}
                            <button onClick={() => { navigator.clipboard.writeText(cnameTarget); showToast('📋 Copied!') }}
                              className="text-xs text-gray-400 hover:text-gray-600 font-sans">
                              copy
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-xs text-gray-400 mt-3">DNS changes can take 5–30 minutes to propagate.</p>
                  </div>
                )}

                {/* Verify button + status */}
                {partnerProfile.custom_domain && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={verifyDomain} disabled={domainVerifying}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                      {domainVerifying ? 'Checking DNS…' : 'Verify Domain'}
                    </button>
                    {domainVerified && (
                      <span className="text-xs font-semibold text-green-600">✅ Verified</span>
                    )}
                    {!domainVerified && partnerProfile.custom_domain && (
                      <span className="text-xs text-amber-600">⏳ Pending DNS</span>
                    )}
                  </div>
                )}

                {domainMsg && (
                  <p className={`text-sm ${domainVerified ? 'text-green-700' : 'text-amber-700'}`}>{domainMsg}</p>
                )}

                {domainVerified && partnerProfile.custom_domain && (
                  <p className="text-sm text-green-700">
                    Your profile is live at{' '}
                    <a href={`https://${partnerProfile.custom_domain}`} target="_blank" rel="noopener noreferrer"
                      className="underline font-medium">
                      {partnerProfile.custom_domain}
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
