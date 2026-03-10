'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────
interface AdminStats {
  summary: {
    total_patents: number
    paid_patents: number
    revenue_usd: number
    claims_complete: number
    claims_failed: number
    claims_generating: number
    total_users: number
    total_ai_cost_usd: number
    total_correspondence: number
    revision_jobs: number
  }
  cost_by_action: Record<string, number>
  recent_payments: Array<{ id: string; title: string; payment_confirmed_at: string; owner_id: string }>
  patent_table: Array<{
    id: string; title: string; owner_id: string; status: string;
    filing_status: string; claims_status: string; spec_uploaded: boolean;
    figures_uploaded: boolean; paid: boolean; correspondence_count: number;
    updated_at: string; claims_score: Record<string, unknown> | null;
    provisional_deadline: string | null;
  }>
  user_table: Array<{
    id: string; name: string; email: string; is_admin: boolean;
    patent_count: number; paid: boolean; joined: string;
    auth_status: 'confirmed' | 'pending' | 'no_account';
    email_confirmed: boolean;
    require_2fa: boolean;
    subscription_status: string;
  }>
  recent_usage: Array<{
    id: string; user_id: string; patent_id: string; action: string;
    model: string; input_tokens: number; output_tokens: number;
    cost_usd: number; created_at: string;
  }>
}

function StatCard({ label, value, sub, color = 'gray' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-semibold mt-0.5">{label}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function daysUntil(s: string | null) {
  if (!s) return null
  const diff = Math.ceil((new Date(s).getTime() - Date.now()) / 86400000)
  return diff
}

export default function AdminPage() {
  const router = useRouter()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<'overview' | 'patents' | 'people' | 'collabs' | 'roles' | 'ai-costs' | 'activity' | 'inbox' | 'agency' | 'partners' | 'accounts' | 'connectors'>('overview')
  const [authToken, setAuthToken] = useState('')
  const [mfaWarning, setMfaWarning] = useState<'setup' | 'verify' | null>(null)

  // Inbox state
  interface InboxItem {
    id: string; uid: string; subject: string; from_email: string; from_name: string | null;
    body: string | null; analysis: string | null; category: string | null;
    is_action_required: boolean; is_reviewed: boolean; sent_to_telegram_at: string | null;
    actioned_at: string | null; sent_reply: boolean; created_at: string;
  }
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxFilter, setInboxFilter] = useState<'all' | 'action' | 'unreviewed'>('all')
  const [expandedInbox, setExpandedInbox] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<InboxItem | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [sendingTelegram, setSendingTelegram] = useState<string | null>(null)

  // Content state
  interface ContentItem {
    id: number; title: string; status: string; author: string | null;
    content_type: string | null; created_at: string; updated_at: string;
    published_at: string | null; read_time: number | null; tags: string[] | null;
    is_bos_pick: boolean;
  }
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [contentSummary, setContentSummary] = useState<Record<string, number>>({})
  const [contentLoading, setContentLoading] = useState(false)
  const [contentFilter, setContentFilter] = useState<'all' | 'draft' | 'published'>('all')

  useEffect(() => {
    async function load() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session
        if (!session) { router.push('/login'); return }
        if (session.access_token) setAuthToken(session.access_token)

        // ── MFA gate — show non-blocking banner; hard enforcement re-enabled once confirmed working ──
        // NOTE: previously used router.push() on non-aal2, which caused an infinite redirect loop:
        //   admin → setup-2fa (enrolls pending factor) → back → admin → nextLevel=aal2 → verify-2fa
        //   → no verified factor found → setup-2fa → ... loop → React navigation stack overflow
        // Fix: check assurance level, set a warning banner, but DO NOT redirect — let admin load.
        try {
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aalData && aalData.currentLevel !== 'aal2') {
            setMfaWarning(aalData.nextLevel === 'aal2' ? 'verify' : 'setup')
          }
        } catch (mfaErr) {
          console.error('[AdminPage] MFA check error:', mfaErr)
        }

        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.status === 403) {
          setError('Access denied — admin only.')
          setLoading(false)
          return
        }
        if (!res.ok) {
          setError('Failed to load admin data.')
          setLoading(false)
          return
        }
        const data = await res.json()
        setStats(data)
        setLoading(false)
      } catch (err) {
        console.error('[AdminPage] load error:', err)
        setError('Failed to load admin panel. Please refresh the page.')
        setLoading(false)
      }
    }
    load()
  }, [router])

  // ── Agency state ──────────────────────────────────────────────────────────
  const [agencyAgreements, setAgencyAgreements] = useState<AgencyAgreement[]>([])
  const [agencyLeads, setAgencyLeads] = useState<AgencyLead[]>([])
  const [agencyLeadSummary, setAgencyLeadSummary] = useState<Record<string, { total: number; new: number; closed: number; total_deal_value: number }>>({})
  const [agencyLoading, setAgencyLoading] = useState(false)
  const [updatingLead, setUpdatingLead] = useState<string | null>(null)

  const loadAgency = useCallback(async () => {
    if (!authToken) return
    setAgencyLoading(true)
    try {
      const res = await fetch('/api/admin/agency', { headers: { Authorization: `Bearer ${authToken}` } })
      if (res.ok) {
        const d = await res.json()
        setAgencyAgreements(d.agreements ?? [])
        setAgencyLeads(d.allLeads ?? [])
        setAgencyLeadSummary(d.leadSummary ?? {})
      }
    } finally { setAgencyLoading(false) }
  }, [authToken])

  useEffect(() => {
    if (activeSection === 'agency' && authToken) loadAgency()
  }, [activeSection, authToken, loadAgency])

  async function updateLead(leadId: string, updates: Partial<AgencyLead>) {
    setUpdatingLead(leadId)
    await fetch('/api/admin/agency', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ lead_id: leadId, ...updates }),
    })
    setAgencyLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updates } : l))
    setUpdatingLead(null)
  }

  // ── Inbox loader ────────────────────────────────────────────────────────────
  const loadInbox = useCallback(async () => {
    if (!authToken) return
    setInboxLoading(true)
    try {
      const params = inboxFilter === 'action' ? '?action_only=true'
        : inboxFilter === 'unreviewed' ? '?unreviewed=true' : '?limit=100'
      const res = await fetch(`/api/admin/inbox${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setInboxItems(data.items ?? [])
      }
    } finally {
      setInboxLoading(false)
    }
  }, [authToken, inboxFilter])

  useEffect(() => {
    if (activeSection === 'inbox' && authToken) loadInbox()
  }, [activeSection, authToken, inboxFilter, loadInbox])

  // ── Content loader ───────────────────────────────────────────────────────────
  const loadContent = useCallback(async () => {
    if (!authToken) return
    setContentLoading(true)
    try {
      const res = await fetch(`/api/admin/content?status=${contentFilter}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setContentItems(data.content ?? [])
        setContentSummary(data.summary ?? {})
      }
    } finally {
      setContentLoading(false)
    }
  }, [authToken, contentFilter])

  useEffect(() => {
    // Content tab removed — BoBozly content at bo.hotdeck.com/admin
    void loadContent // suppress unused warning
  }, [activeSection, authToken, contentFilter, loadContent])

  // ── Inbox actions ────────────────────────────────────────────────────────────
  async function markReviewed(id: string) {
    await fetch('/api/admin/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id, is_reviewed: true }),
    })
    setInboxItems(prev => prev.map(i => i.id === id ? { ...i, is_reviewed: true } : i))
  }

  async function sendTelegramAlert(item: InboxItem) {
    setSendingTelegram(item.id)
    const msg = `⚡ <b>Email Alert from Mission Control</b>\nFrom: ${item.from_email}\nSubject: ${item.subject}\n\n${item.analysis?.slice(0, 300) ?? ''}`
    const res = await fetch('/api/admin/telegram-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ message: msg, inbox_item_id: item.id }),
    })
    if (res.ok) {
      setInboxItems(prev => prev.map(i => i.id === item.id
        ? { ...i, sent_to_telegram_at: new Date().toISOString(), is_reviewed: true } : i))
    }
    setSendingTelegram(null)
  }

  async function sendReply(item: InboxItem, body: string) {
    setSendingReply(true)
    const res = await fetch('/api/admin/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        to: item.from_email,
        subject: item.subject.startsWith('Re:') ? item.subject : `Re: ${item.subject}`,
        body,
        inbox_item_id: item.id,
      }),
    })
    if (res.ok) {
      setInboxItems(prev => prev.map(i => i.id === item.id ? { ...i, sent_reply: true, is_reviewed: true } : i))
      setReplyTarget(null)
      setReplyBody('')
    }
    setSendingReply(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading admin panel…</div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">🔒</div>
        <div className="text-lg font-bold text-gray-800">{error}</div>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-blue-600 hover:underline">← Back to Dashboard</Link>
      </div>
    </div>
  )

  if (!stats) return null
  const { summary } = stats
  const margin = summary.revenue_usd > 0
    ? ((summary.revenue_usd - summary.total_ai_cost_usd) / summary.revenue_usd * 100).toFixed(1)
    : '—'

  const actionCount = inboxItems.filter(i => i.is_action_required && !i.is_reviewed).length

  const navItems: { key: typeof activeSection; label: string; icon: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'inbox', label: 'Inbox', icon: '📧', badge: actionCount || undefined },
    // 'content' tab removed — BoBozly content lives in bo.hotdeck.com/admin (shared Supabase project)
    { key: 'agency', label: 'Agency', icon: '🤝' },
    { key: 'partners', label: 'Partners', icon: '⚖️' },
    { key: 'accounts', label: 'Accounts', icon: '👥' },
    { key: 'patents', label: `Patents (${summary.total_patents})`, icon: '📋' },
    { key: 'people', label: 'People', icon: '👥' },
    { key: 'collabs', label: 'Collabs', icon: '🤝' },
    { key: 'roles', label: 'Roles', icon: '🔐' },
    { key: 'ai-costs', label: 'AI Costs', icon: '🤖' },
    { key: 'activity', label: 'Activity', icon: '📡' },
    { key: 'connectors', label: 'Connectors', icon: '🔌' },
  ]

  // Agency state (loaded on demand)
  interface AgencyAgreement {
    id: string; commission_pct: number; terms_version: string; agreed_at: string;
    patents: { id: string; title: string; slug: string | null; status: string }
  }
  interface AgencyLead {
    id: string; patent_id: string; name: string; email: string; company: string;
    message: string; status: string; deal_type: string | null; deal_amount: number | null;
    notes: string | null; created_at: string;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* MFA warning banner */}
      {mfaWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <span>🔐</span>
            <span>
              {mfaWarning === 'setup'
                ? 'Two-factor authentication is not set up. Secure your admin account.'
                : 'Your session is not 2FA-verified. Re-authenticate to reach full security.'}
            </span>
          </div>
          <Link
            href={mfaWarning === 'verify' ? '/admin/security/verify-2fa?next=/admin' : '/admin/security/setup-2fa'}
            className="text-xs font-semibold text-amber-800 underline hover:text-amber-900 ml-4 whitespace-nowrap"
          >
            {mfaWarning === 'verify' ? 'Verify now →' : 'Set up 2FA →'}
          </Link>
        </div>
      )}

      {/* Top nav */}
      <div className="bg-[#1a1f36] text-white px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">🏛️ Mission Control</span>
          <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded font-bold">ADMIN</span>
        </div>
        <Link href="/dashboard" className="text-xs text-gray-300 hover:text-white">← Dashboard</Link>
      </div>

      <div className="flex">
        {/* Sidebar nav */}
        <nav className="w-48 min-h-[calc(100vh-48px)] bg-white border-r border-gray-200 p-4 sticky top-[48px] flex-shrink-0">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors flex items-center justify-between ${
                activeSection === item.key ? 'bg-[#1a1f36] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span><span className="mr-2">{item.icon}</span>{item.label}</span>
              {item.badge && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold min-w-[18px] text-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-auto">

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {activeSection === 'overview' && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-5">Overview</h1>

              {/* Revenue row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <StatCard label="Revenue" value={`$${summary.revenue_usd}`} sub="@$49/intake" color="green" />
                <StatCard label="AI Cost" value={`$${summary.total_ai_cost_usd.toFixed(2)}`} sub="logged spend" color="red" />
                <StatCard label="Est. Margin" value={`${margin}%`} sub="revenue − AI" color={parseFloat(margin as string) > 70 ? 'green' : 'amber'} />
                <StatCard label="Paid Patents" value={summary.paid_patents} sub={`of ${summary.total_patents}`} color="blue" />
                <StatCard label="Users" value={summary.total_users} color="indigo" />
                <StatCard label="Correspondence" value={summary.total_correspondence} color="gray" />
              </div>

              {/* Claims row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <StatCard label="Claims Complete" value={summary.claims_complete} color="green" />
                <StatCard label="Claims Generating" value={summary.claims_generating} color="amber" />
                <StatCard label="Claims Failed" value={summary.claims_failed} color="red" />
                <StatCard label="Revision Jobs" value={summary.revision_jobs} color="blue" />
              </div>

              {/* Urgent deadlines */}
              {(() => {
                const urgent = stats.patent_table.filter(p => {
                  const d = daysUntil(p.provisional_deadline)
                  return d !== null && d <= 30
                })
                if (!urgent.length) return null
                return (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                    <div className="font-bold text-red-800 text-sm mb-3">⚠️ Urgent Filing Deadlines (≤30 days)</div>
                    {urgent.map(p => {
                      const d = daysUntil(p.provisional_deadline)!
                      return (
                        <div key={p.id} className="flex items-center justify-between py-2 border-b border-red-100 last:border-0">
                          <Link href={`/dashboard/patents/${p.id}`} className="text-sm font-medium text-red-800 hover:underline truncate max-w-xs">
                            {p.title}
                          </Link>
                          <span className={`text-xs font-bold px-2 py-1 rounded ${d <= 10 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                            {d <= 0 ? 'OVERDUE' : `${d}d`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Recent payments */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Recent Payments</span>
                </div>
                {stats.recent_payments.length === 0 ? (
                  <div className="p-5 text-sm text-gray-400">No payments yet.</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {stats.recent_payments.slice(0, 8).map(p => (
                      <div key={p.id} className="flex items-center justify-between px-5 py-3">
                        <Link href={`/dashboard/patents/${p.id}`} className="text-sm font-medium text-gray-800 hover:underline truncate max-w-xs">{p.title}</Link>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-green-700 font-bold">$49</span>
                          <span className="text-xs text-gray-400">{formatDate(p.payment_confirmed_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI cost breakdown */}
              {Object.keys(stats.cost_by_action).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">AI Cost by Action</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {Object.entries(stats.cost_by_action)
                      .sort(([, a], [, b]) => b - a)
                      .map(([action, cost]) => (
                        <div key={action} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 font-mono text-xs">{action}</span>
                          <span className="font-semibold text-gray-800">${cost.toFixed(4)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PATENTS ──────────────────────────────────────────────────── */}
          {activeSection === 'patents' && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-5">All Patents ({stats.patent_table.length})</h1>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Claims</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Spec</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Deadline</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {stats.patent_table.map(p => {
                        const days = daysUntil(p.provisional_deadline)
                        const score = p.claims_score as { novelty?: number } | null
                        return (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <Link href={`/dashboard/patents/${p.id}`} className="font-medium text-gray-800 hover:text-blue-600 hover:underline max-w-[200px] truncate block">
                                {p.title}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                p.filing_status === 'filed' ? 'bg-green-100 text-green-700' :
                                p.filing_status === 'approved' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{p.filing_status}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                p.claims_status === 'complete' ? 'bg-green-100 text-green-700' :
                                p.claims_status === 'failed' ? 'bg-red-100 text-red-700' :
                                p.claims_status === 'generating' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>{p.claims_status ?? '—'}</span>
                            </td>
                            <td className="px-4 py-3">{p.paid ? '✅ $49' : '—'}</td>
                            <td className="px-4 py-3">
                              {p.spec_uploaded ? '✅' : p.figures_uploaded ? '📐' : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {score?.novelty ? `${score.novelty}/10` : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {days !== null ? (
                                <span className={`font-semibold ${days <= 10 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-gray-600'}`}>
                                  {days <= 0 ? 'OVERDUE' : `${days}d`}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-400">{formatDate(p.updated_at)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── USERS ────────────────────────────────────────────────────── */}
          {/* ── PEOPLE (unified view) ────────────────────────────────── */}
          {activeSection === 'people' && (
            <AdminPeoplePanel authToken={authToken} />
          )}

          {/* ── COLLABORATOR INVITES ──────────────────────────────────── */}
          {activeSection === 'collabs' && (
            <AdminCollabsPanel authToken={authToken} />
          )}

          {/* ── ROLE PERMISSIONS ─────────────────────────────────────── */}
          {activeSection === 'roles' && (
            <AdminRolesPanel authToken={authToken} />
          )}

          {/* ── AI COSTS ─────────────────────────────────────────────────── */}
          {activeSection === 'ai-costs' && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-5">AI Cost Center</h1>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                <StatCard label="Total AI Spend" value={`$${summary.total_ai_cost_usd.toFixed(4)}`} sub="all time (logged)" color="red" />
                <StatCard label="Revenue" value={`$${summary.revenue_usd}`} color="green" />
                <StatCard label="Net Margin" value={`${margin}%`} color={parseFloat(margin as string) > 70 ? 'green' : 'amber'} />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Cost by Action</span>
                </div>
                <div className="p-4">
                  {Object.keys(stats.cost_by_action).length === 0 ? (
                    <div className="text-sm text-gray-400">No usage logged yet. Costs are logged when AI runs.</div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(stats.cost_by_action)
                        .sort(([, a], [, b]) => b - a)
                        .map(([action, cost]) => {
                          const pct = summary.total_ai_cost_usd > 0 ? (cost / summary.total_ai_cost_usd * 100) : 0
                          return (
                            <div key={action}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-mono text-xs text-gray-600">{action}</span>
                                <span className="font-bold text-gray-800">${cost.toFixed(4)} ({pct.toFixed(0)}%)</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <strong>Note:</strong> AI costs are logged when the draft-spec, generate-claims, or score endpoints run.
                Costs not yet logged: generate-claims cron (update cron to insert ai_usage_log rows). Gemini 2.5 Pro ≈ $1.25/1M input + $10/1M output.
              </div>
            </div>
          )}

          {/* ── ACTIVITY ─────────────────────────────────────────────────── */}
          {activeSection === 'activity' && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-5">Recent Activity</h1>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">AI Usage Log (last 30)</span>
                </div>
                {stats.recent_usage.length === 0 ? (
                  <div className="p-5 text-sm text-gray-400">No activity logged yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-2 font-semibold text-gray-500">Action</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-500">Model</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-500">Tokens In/Out</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-500">Cost</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-500">When</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {stats.recent_usage.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono">{u.action}</td>
                            <td className="px-4 py-2 text-gray-500">{u.model || '—'}</td>
                            <td className="px-4 py-2 text-gray-500">{u.input_tokens?.toLocaleString() ?? '—'} / {u.output_tokens?.toLocaleString() ?? '—'}</td>
                            <td className="px-4 py-2 font-semibold">${Number(u.cost_usd ?? 0).toFixed(5)}</td>
                            <td className="px-4 py-2 text-gray-400">{formatDate(u.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── INBOX SECTION ─────────────────────────────────────────────────── */}
          {activeSection === 'inbox' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
                <div className="flex gap-2">
                  {(['all', 'action', 'unreviewed'] as const).map(f => (
                    <button key={f} onClick={() => setInboxFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        inboxFilter === f ? 'bg-[#1a1f36] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {f === 'action' ? '⚡ Action' : f === 'unreviewed' ? '🔵 Unreviewed' : 'All'}
                    </button>
                  ))}
                  <button onClick={loadInbox} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {inboxLoading ? (
                <div className="text-gray-400 text-sm py-8 text-center">Loading inbox…</div>
              ) : inboxItems.length === 0 ? (
                <div className="text-gray-400 text-sm py-8 text-center">No items found.</div>
              ) : (
                <div className="space-y-2">
                  {inboxItems.map(item => (
                    <div key={item.id} className={`bg-white rounded-xl border transition-all ${
                      item.is_action_required && !item.is_reviewed
                        ? 'border-amber-300 shadow-sm' : 'border-gray-200'
                    }`}>
                      <div
                        className="px-4 py-3 flex items-center gap-3 cursor-pointer"
                        onClick={() => setExpandedInbox(expandedInbox === item.id ? null : item.id)}
                      >
                        <div className="flex-shrink-0 w-2 h-2 rounded-full mt-0.5" style={{
                          background: item.is_reviewed ? '#d1d5db' : item.is_action_required ? '#f59e0b' : '#3b82f6'
                        }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-gray-900 truncate">{item.subject}</span>
                            {item.is_action_required && (
                              <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">⚡ ACTION</span>
                            )}
                            {item.sent_reply && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">↩ Replied</span>
                            )}
                            {item.sent_to_telegram_at && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">📱 Sent</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {item.from_email} · {item.category ?? 'general'} · {formatDate(item.created_at)}
                          </div>
                        </div>
                        <span className="text-gray-300 text-xs flex-shrink-0">{expandedInbox === item.id ? '▲' : '▼'}</span>
                      </div>

                      {expandedInbox === item.id && (
                        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                          {item.analysis && (
                            <div>
                              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">BoClaw Analysis</div>
                              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{item.analysis}</div>
                            </div>
                          )}
                          {item.body && (
                            <details>
                              <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Original Message</summary>
                              <div className="text-sm text-gray-600 whitespace-pre-wrap mt-2 bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto">
                                {item.body.slice(0, 2000)}{item.body.length > 2000 ? '…' : ''}
                              </div>
                            </details>
                          )}

                          {/* Reply compose */}
                          {replyTarget?.id === item.id ? (
                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                              <div className="text-xs font-semibold text-blue-700 mb-2">Reply to {item.from_email}</div>
                              <textarea
                                value={replyBody}
                                onChange={e => setReplyBody(e.target.value)}
                                rows={4}
                                placeholder="Type your reply…"
                                className="w-full text-sm border border-blue-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => sendReply(item, replyBody)}
                                  disabled={sendingReply || !replyBody.trim()}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {sendingReply ? 'Sending…' : 'Send Reply →'}
                                </button>
                                <button onClick={() => { setReplyTarget(null); setReplyBody('') }}
                                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 flex-wrap">
                              {!item.is_reviewed && (
                                <button onClick={() => markReviewed(item.id)}
                                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50">
                                  ✓ Mark Reviewed
                                </button>
                              )}
                              <button
                                onClick={() => { setReplyTarget(item); setReplyBody('') }}
                                className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-50"
                              >
                                ↩ Reply
                              </button>
                              {!item.sent_to_telegram_at && (
                                <button
                                  onClick={() => sendTelegramAlert(item)}
                                  disabled={sendingTelegram === item.id}
                                  className="px-3 py-1.5 bg-[#1a1f36] text-white rounded-lg text-xs font-semibold hover:bg-[#2d3561] disabled:opacity-50"
                                >
                                  {sendingTelegram === item.id ? 'Sending…' : '📱 Send to Hot-Claw'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Content tab removed — BoBozly content pipeline lives at bo.hotdeck.com/admin */}

          {/* ── AGENCY SECTION ────────────────────────────────────────────────── */}
          {activeSection === 'agency' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h1 className="text-xl font-bold text-gray-900">🤝 Agency Pipeline</h1>
                <button onClick={loadAgency} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">↻ Refresh</button>
              </div>

              {agencyLoading ? (
                <div className="text-gray-400 text-sm py-8 text-center">Loading agency data…</div>
              ) : (
                <div className="space-y-6">
                  {/* Active Agreements */}
                  <div>
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Active Agreements ({agencyAgreements.length})</h2>
                    {agencyAgreements.length === 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">No active agency agreements yet.</div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Patent</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Status</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Commission</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Leads</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Deals Closed</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Deal Page</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {agencyAgreements.map(ag => {
                              const s = agencyLeadSummary[ag.patents?.id] ?? { total: 0, new: 0, closed: 0, total_deal_value: 0 }
                              return (
                                <tr key={ag.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 font-medium text-gray-900">{ag.patents?.title ?? '—'}</td>
                                  <td className="px-4 py-3">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                      ag.patents?.status === 'granted' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                    }`}>{ag.patents?.status ?? '—'}</span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-600">{ag.commission_pct}%</td>
                                  <td className="px-4 py-3">
                                    <span className="text-gray-900 font-semibold">{s.total}</span>
                                    {s.new > 0 && <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{s.new} new</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    {s.closed > 0
                                      ? <span className="text-green-700 font-semibold">{s.closed} · ${s.total_deal_value.toLocaleString()}</span>
                                      : <span className="text-gray-400">—</span>
                                    }
                                  </td>
                                  <td className="px-4 py-3">
                                    {ag.patents?.slug
                                      ? <a href={`/patents/${ag.patents.slug}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">View →</a>
                                      : <span className="text-gray-300 text-xs">no slug</span>
                                    }
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Leads */}
                  <div>
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Licensing Inquiries ({agencyLeads.length})</h2>
                    {agencyLeads.length === 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">No inquiries yet.</div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Name / Company</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Email</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Status</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Deal Amount</th>
                              <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Received</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {agencyLeads.map(lead => (
                              <tr key={lead.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{lead.name}</div>
                                  <div className="text-xs text-gray-400">{lead.company || '—'}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">{lead.email}</td>
                                <td className="px-4 py-3">
                                  <select
                                    value={lead.status}
                                    disabled={updatingLead === lead.id}
                                    onChange={e => updateLead(lead.id, { status: e.target.value })}
                                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                                  >
                                    {['new', 'contacted', 'negotiating', 'closed', 'declined'].map(s => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-4 py-3">
                                  {lead.status === 'closed' ? (
                                    <input
                                      type="number"
                                      defaultValue={lead.deal_amount ?? ''}
                                      onBlur={e => updateLead(lead.id, { deal_amount: parseFloat(e.target.value) || 0 })}
                                      placeholder="$0"
                                      className="w-24 text-xs border border-gray-200 rounded px-2 py-1"
                                    />
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(lead.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Partners ────────────────────────────────────────────── */}
          {activeSection === 'partners' && (
            <AdminPartnersPanel authToken={authToken} />
          )}
          {activeSection === 'accounts' && (
            <AdminAccountsPanel authToken={authToken} />
          )}

          {activeSection === 'connectors' && (
            <AdminConnectorsPanel authToken={authToken} />
          )}

        </main>
      </div>
    </div>
  )
}

// ─── Admin Partners Panel ────────────────────────────────────────────────────

function AdminPartnersPanel({ authToken }: { authToken: string }) {
  const [partners, setPartners] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState('pending')
  const [actionMsg, setActionMsg] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editMonths, setEditMonths] = React.useState(3)
  const [editNotes, setEditNotes] = React.useState('')
  const [editBarVerified, setEditBarVerified] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/partners?status=${filter}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      if (res.ok) {
        const d = await res.json()
        setPartners(d.partners ?? [])
      }
    } catch (err) {
      console.error('[AdminPartners] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [authToken, filter])

  React.useEffect(() => { if (authToken) load() }, [load])

  async function action(id: string, act: string, extra?: Record<string, unknown>) {
    const res = await fetch('/api/admin/partners', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: act, ...extra }),
    })
    const d = await res.json()
    if (res.ok) {
      setActionMsg(act === 'approve' ? '✅ Approved + welcome email sent' : `✅ ${act} done`)
      setTimeout(() => setActionMsg(''), 3000)
      load()
    } else {
      setActionMsg(`⚠️ ${d.error}`)
    }
    setEditingId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">⚖️ Partner Applications</h2>
        <div className="flex gap-2 flex-wrap">
          {['pending', 'approved', 'rejected'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${filter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {actionMsg && <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{actionMsg}</div>}
      {loading && <p className="text-gray-500 text-sm">Loading...</p>}
      {!loading && partners.length === 0 && <p className="text-gray-500 text-sm">No {filter} applications.</p>}

      <div className="space-y-4">
        {partners.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-bold text-gray-900">{p.full_name}</p>
                  {p.bar_verified && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✓ Bar Verified</span>}
                  {p.welcome_email_sent && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Email Sent</span>}
                </div>
                <p className="text-indigo-600 text-sm">{p.firm_name} · {p.state}</p>
                <p className="text-gray-500 text-sm">{p.email} · Bar: {p.bar_number}</p>
                {p.specialty && <p className="text-gray-500 text-sm mt-0.5">Specialty: {p.specialty}</p>}
                <p className="text-gray-400 text-xs mt-2">Applied: {new Date(p.created_at).toLocaleDateString()}</p>
                <div className="flex flex-wrap gap-3 mt-2 items-center">
                  {p.referral_code && (
                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">Code: {p.referral_code}</span>
                  )}
                  {p.referral_counts && (
                    <span className="text-xs text-gray-600">
                      {p.referral_counts.total} referrals · {p.referral_counts.rewarded} rewarded
                    </span>
                  )}
                  {(p.partner_profile?.reward_months_lifetime ?? 0) > 0 && (
                    <span className="text-xs text-indigo-700">
                      {p.partner_profile.reward_months_lifetime} mo earned · {p.partner_profile.reward_months_balance} bal
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{p.partner_profile?.pro_months_per_referral ?? p.pro_months_per_referral ?? 3} months/referral</span>
                </div>
                {p.notes && <p className="text-xs text-gray-500 italic mt-1 border-l-2 border-gray-200 pl-2">{p.notes}</p>}
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                {p.status === 'pending' && (
                  <>
                    <button onClick={() => action(p.id, 'approve')}
                      className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
                      Approve + Send Welcome ✓
                    </button>
                    <button onClick={() => action(p.id, 'reject')}
                      className="px-4 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200">
                      Reject
                    </button>
                  </>
                )}
                {p.status === 'approved' && (
                  <>
                    <button onClick={() => action(p.id, 'approve', { send_welcome: true })}
                      className="px-4 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200">
                      Resend Welcome
                    </button>
                    <button onClick={() => action(p.id, 'suspend')}
                      className="px-4 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200">
                      Suspend
                    </button>
                  </>
                )}
                <button onClick={() => { setEditingId(p.id); setEditMonths(p.pro_months_per_referral ?? 3); setEditNotes(p.notes ?? ''); setEditBarVerified(p.bar_verified ?? false) }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline">
                  Edit
                </button>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  p.status === 'approved' ? 'bg-green-100 text-green-700' :
                  p.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{p.status}</span>
              </div>
            </div>

            {/* Inline edit panel */}
            {editingId === p.id && (
              <div className="mt-4 pt-4 border-t border-gray-100 bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Months per referral</label>
                    <input type="number" value={editMonths} onChange={e => setEditMonths(Number(e.target.value))} min={1} max={12}
                      className="w-20 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <input type="checkbox" checked={editBarVerified} onChange={e => setEditBarVerified(e.target.checked)} id={`barv-${p.id}`} />
                    <label htmlFor={`barv-${p.id}`} className="text-sm text-gray-700">Bar Verified</label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Admin notes</label>
                  <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                    placeholder="Verification source, calls, anything relevant..."
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => action(p.id, 'update', { pro_months_per_referral: editMonths, notes: editNotes, bar_verified: editBarVerified })}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700">Save</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-sm hover:bg-gray-100">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Admin Users Panel ─────────────────────────────────────────────────────────

type UserRow = AdminStats['user_table'][number]

const AUTH_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  confirmed:  { label: '✓ Confirmed',  cls: 'bg-green-100 text-green-700' },
  pending:    { label: '⏳ Pending',    cls: 'bg-amber-100 text-amber-700' },
  no_account: { label: '∅ No Account', cls: 'bg-red-100 text-red-600' },
}

function AdminUsersPanel({ users, authToken }: { users: UserRow[]; authToken: string }) {
  const [actionMsg, setActionMsg] = React.useState<Record<string, string>>({})
  const [running, setRunning] = React.useState<string | null>(null)

  async function doAction(userId: string, email: string, action: string) {
    const key = `${userId}-${action}`
    setRunning(key)
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ action, email }),
    })
    const d = await res.json()
    setActionMsg(prev => ({ ...prev, [userId]: res.ok ? `✅ ${d.message}` : `❌ ${d.error}` }))
    setTimeout(() => setActionMsg(prev => { const copy = { ...prev }; delete copy[userId]; return copy }), 5000)
    setRunning(null)
  }

  function formatDate(s: string | null) {
    if (!s) return '—'
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Users ({users.length})</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Name / Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Patents</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => {
                const badge = AUTH_STATUS_BADGE[u.auth_status] ?? { label: u.auth_status, cls: 'bg-gray-100 text-gray-600' }
                const msgKey = u.id
                return (
                  <tr key={`${u.id}-${u.email}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{u.name}</div>
                      <div className="text-gray-400">{u.email}</div>
                      {actionMsg[msgKey] && (
                        <div className={`mt-1 text-xs font-semibold ${actionMsg[msgKey].startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                          {actionMsg[msgKey]}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {u.require_2fa && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 font-semibold">2FA req</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">{u.patent_count}</td>
                    <td className="px-4 py-3">
                      {u.is_admin
                        ? <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">Admin</span>
                        : <span className="text-gray-400">User</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(u.joined)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {/* No Account — only action is resend invite */}
                        {u.auth_status === 'no_account' && (
                          <ActionButton
                            label="Resend Invite"
                            loading={running === `${u.id}-resend_invite`}
                            onClick={() => doAction(u.id, u.email, 'resend_invite')}
                            color="amber"
                          />
                        )}
                        {/* Pending — resend confirm or manual confirm */}
                        {u.auth_status === 'pending' && (
                          <>
                            <ActionButton
                              label="Resend Confirm"
                              loading={running === `${u.id}-resend_confirmation`}
                              onClick={() => doAction(u.id, u.email, 'resend_confirmation')}
                              color="blue"
                            />
                            <ActionButton
                              label="Manual Confirm"
                              loading={running === `${u.id}-manual_confirm`}
                              onClick={() => doAction(u.id, u.email, 'manual_confirm')}
                              color="green"
                            />
                            <ActionButton
                              label="Resend Invite"
                              loading={running === `${u.id}-resend_invite`}
                              onClick={() => doAction(u.id, u.email, 'resend_invite')}
                              color="amber"
                            />
                          </>
                        )}
                        {/* Confirmed — reset password */}
                        {u.auth_status === 'confirmed' && (
                          <ActionButton
                            label="Reset Password"
                            loading={running === `${u.id}-reset_password`}
                            onClick={() => doAction(u.id, u.email, 'reset_password')}
                            color="gray"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  label, onClick, loading, color = 'gray'
}: { label: string; onClick: () => void; loading: boolean; color?: string }) {
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    blue:  'bg-blue-100 text-blue-700 hover:bg-blue-200',
    green: 'bg-green-100 text-green-700 hover:bg-green-200',
    gray:  'bg-gray-100 text-gray-700 hover:bg-gray-200',
    red:   'bg-red-100 text-red-700 hover:bg-red-200',
  }
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 ${colorMap[color] ?? colorMap.gray}`}
    >
      {loading ? '…' : label}
    </button>
  )
}

// ── Admin Accounts Panel ────────────────────────────────────────────────────
function AdminAccountsPanel({ authToken }: { authToken: string }) {
  const [accounts, setAccounts] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [editTier, setEditTier] = React.useState<'free' | 'pro' | 'complimentary'>('free')
  const [editReason, setEditReason] = React.useState('')
  const [sendNotif, setSendNotif] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [msg, setMsg] = React.useState('')

  React.useEffect(() => {
    fetch('/api/admin/accounts', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts ?? []); setLoading(false) })
      .catch(err => { console.error('[AdminAccounts] load error:', err); setLoading(false) })
  }, [authToken])

  async function saveEdit(userId: string, email: string) {
    if (editTier === 'complimentary' && !editReason.trim()) {
      setMsg('Reason required for complimentary tier'); return
    }
    setSaving(true)
    const res = await fetch('/api/admin/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        user_id: userId,
        tier: editTier,
        reason: editReason.trim() || undefined,
        granted_by: 'chad@hotdeck.com',
        send_notification: sendNotif,
      }),
    })
    const d = await res.json()
    if (res.ok) {
      setMsg(`✅ ${email} updated to ${editTier}`)
      setAccounts(prev => prev.map(a => a.id === userId ? { ...a, subscription_status: editTier, comp_reason: editReason || null } : a))
      setEditing(null)
    } else {
      setMsg(`❌ ${d.error}`)
    }
    setSaving(false)
  }

  const TIER_BADGE: Record<string, string> = {
    free: 'bg-gray-100 text-gray-600',
    pro: 'bg-indigo-100 text-indigo-700',
    cancelled: 'bg-red-100 text-red-600',
    complimentary: 'bg-amber-100 text-amber-700',
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading accounts…</div>

  return (
    <div>
      <h2 className="text-lg font-bold text-[#1a1f36] mb-4">Account Management</h2>
      {msg && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">{msg}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="pb-2 pr-4">User</th>
              <th className="pb-2 pr-4">Tier</th>
              <th className="pb-2 pr-4">Period End</th>
              <th className="pb-2 pr-4">Comp Reason</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 pr-4">
                  <div className="font-medium text-[#1a1f36]">{a.full_name ?? '—'}</div>
                  <div className="text-xs text-gray-400">{a.email}</div>
                </td>
                <td className="py-3 pr-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIER_BADGE[a.subscription_status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {a.subscription_status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-xs text-gray-500">
                  {a.subscription_period_end ? new Date(a.subscription_period_end).toLocaleDateString() : '—'}
                </td>
                <td className="py-3 pr-4 text-xs text-gray-500 max-w-[200px] truncate">
                  {a.comp_reason ?? '—'}
                </td>
                <td className="py-3">
                  {editing === a.id ? (
                    <div className="flex flex-col gap-2 min-w-[280px]">
                      <select
                        value={editTier}
                        onChange={e => setEditTier(e.target.value as 'free' | 'pro' | 'complimentary')}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                      >
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                        <option value="complimentary">Complimentary</option>
                      </select>
                      {editTier === 'complimentary' && (
                        <input
                          placeholder="Reason (required)"
                          value={editReason}
                          onChange={e => setEditReason(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                        />
                      )}
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={sendNotif} onChange={e => setSendNotif(e.target.checked)} />
                        Send notification email
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(a.id, a.email)}
                          disabled={saving}
                          className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-semibold disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditing(a.id)
                        setEditTier(a.subscription_status === 'complimentary' ? 'complimentary' : a.subscription_status === 'pro' ? 'pro' : 'free')
                        setEditReason(a.comp_reason ?? '')
                        setSendNotif(true)
                        setMsg('')
                      }}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 transition-colors"
                    >
                      Edit tier
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ─── Admin Connectors Panel ──────────────────────────────────────────────────

interface ConnectorData {
  brave_search: {
    status: 'connected' | 'missing_key'; plan: string; monthly_limit: number
    queries_this_month: number; queries_remaining: number; usage_pct: number
    alert_level: 'ok' | 'warning' | 'critical'; projected_monthly: number
    days_to_reset: number; reset_date: string; runs_this_month: number
    total_runs: number; success_rate: number; total_queries_ever: number
    total_findings_ever: number
    last_run: { id: string; status: string; started_at: string; findings: number; new_findings: number; queries_used: number; error?: string | null } | null
    recent_runs: Array<{ id: string; status: string; started_at: string; findings: number; new_findings: number; queries: number; error?: string | null }>
  }
  resend: { status: string; ping_ms: number; key_present: boolean; emails_sent_month: number; from_domain: string }
  supabase: { status: string; ping_ms: number; project_ref: string; region: string; user_count: number; ai_calls_month: number; ai_cost_month_usd: number; ai_top_models: Record<string, number>; storage_bucket: string }
  stripe: { status: string; balance_usd: number; active_subscriptions: number; revenue_30d: number; charges_30d: number }
  github: { status: string; last_commit_repo: string; last_commit_sha: string; last_commit_msg: string; last_commit_at: string }
  uspto_odp: { status: string; description: string; base_url: string }
}

function AdminConnectorsPanel({ authToken }: { authToken: string }) {
  const [data, setData] = React.useState<ConnectorData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [editLimit, setEditLimit] = React.useState(false)
  const [newLimit, setNewLimit] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    fetch('/api/admin/connectors', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => { setData(d.connectors ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [authToken])

  React.useEffect(() => { load() }, [load])

  async function saveLimit() {
    if (!newLimit || isNaN(parseInt(newLimit))) return
    setSaving(true)
    await fetch('/api/admin/connectors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ brave_monthly_limit: parseInt(newLimit), brave_plan: parseInt(newLimit) > 2000 ? 'pro' : 'free' }),
    })
    setSaving(false); setEditLimit(false); load()
  }

  const fmtDate = (s?: string | null) => !s ? '—' : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const statusDot = (s: string) => s === 'connected' || s === 'key_present' ? '🟢' : s === 'degraded' || s === 'error' ? '🔴' : '⚪'
  const statusBadge = (s: string) => {
    if (s === 'connected') return 'bg-green-100 text-green-800'
    if (s === 'degraded' || s === 'error') return 'bg-red-100 text-red-800'
    if (s === 'key_present') return 'bg-blue-100 text-blue-800'
    return 'bg-gray-100 text-gray-500'
  }
  const statusLabel = (s: string) => s === 'connected' ? '✓ Connected' : s === 'degraded' ? '⚠ Degraded' : s === 'error' ? '✗ Error' : s === 'key_present' ? '✓ Key set' : s === 'missing_key' || s === 'no_key' ? '✗ No key' : s

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">Loading connectors…</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Failed to load connector data</div>

  const brave = data.brave_search
  const alertColor = brave.alert_level === 'critical' ? 'red' : brave.alert_level === 'warning' ? 'amber' : 'green'
  const barColor   = alertColor === 'red' ? 'bg-red-500' : alertColor === 'amber' ? 'bg-amber-400' : 'bg-emerald-500'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">API Connectors</h1>
        <p className="text-gray-400 text-sm mt-0.5">Live health, usage, and stats for every service under the hood</p>
      </div>

      {/* ── Row 1: Supabase + Resend (small cards) ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Supabase */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🗄️</span>
              <div>
                <div className="font-semibold text-sm text-gray-900">Supabase</div>
                <div className="text-xs text-gray-400">{data.supabase.region}</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge(data.supabase.status)}`}>
              {statusLabel(data.supabase.status)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="font-bold text-gray-900 text-base">{data.supabase.user_count}</div>
              <div className="text-gray-500">users</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="font-bold text-gray-900 text-base">{data.supabase.ping_ms}ms</div>
              <div className="text-gray-500">latency</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            AI costs this month: <strong className="text-gray-700">${data.supabase.ai_cost_month_usd.toFixed(2)}</strong>
            {' '}({data.supabase.ai_calls_month} calls)
          </div>
          {Object.keys(data.supabase.ai_top_models).length > 0 && (
            <div className="mt-1 text-xs text-gray-400">
              {Object.entries(data.supabase.ai_top_models)
                .sort(([,a],[,b]) => b-a).slice(0,2)
                .map(([m,c]) => `${m}: ${c}`).join(' · ')}
            </div>
          )}
        </div>

        {/* Resend */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📧</span>
              <div>
                <div className="font-semibold text-sm text-gray-900">Resend</div>
                <div className="text-xs text-gray-400">transactional email</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge(data.resend.status)}`}>
              {statusLabel(data.resend.status)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="font-bold text-gray-900 text-base">{data.resend.emails_sent_month}</div>
              <div className="text-gray-500">sent (30d)</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="font-bold text-gray-900 text-base">{data.resend.ping_ms}ms</div>
              <div className="text-gray-500">latency</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400 truncate">
            From: <strong className="text-gray-700">{data.resend.from_domain}</strong>
          </div>
        </div>

        {/* Stripe */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">💳</span>
              <div>
                <div className="font-semibold text-sm text-gray-900">Stripe</div>
                <div className="text-xs text-gray-400">payments · live mode</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge(data.stripe.status === 'no_key' ? 'no_key' : data.stripe.status)}`}>
              {data.stripe.status === 'no_key' ? '✗ No key' : statusLabel(data.stripe.status)}
            </span>
          </div>
          {data.stripe.status === 'connected' ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="font-bold text-gray-900 text-base">{data.stripe.active_subscriptions}</div>
                  <div className="text-gray-500">active subs</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="font-bold text-gray-900 text-base">${data.stripe.revenue_30d.toFixed(0)}</div>
                  <div className="text-gray-500">rev (30d)</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                {data.stripe.charges_30d} charges · balance: <strong className="text-gray-700">${data.stripe.balance_usd.toFixed(2)}</strong>
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-400 mt-1">Add STRIPE_SECRET_KEY to Vercel env vars to enable</div>
          )}
        </div>
      </div>

      {/* ── Row 2: GitHub + USPTO ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* GitHub */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐙</span>
              <div>
                <div className="font-semibold text-sm text-gray-900">GitHub</div>
                <div className="text-xs text-gray-400">HotHands-LLC</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge(data.github.status === 'no_key' ? 'no_key' : data.github.status)}`}>
              {data.github.status === 'no_key' ? '✗ No key' : statusLabel(data.github.status)}
            </span>
          </div>
          {data.github.status === 'connected' ? (
            <div className="text-xs space-y-1">
              <div className="font-medium text-gray-700">{data.github.last_commit_repo}</div>
              <div className="text-gray-500 truncate">{data.github.last_commit_msg}</div>
              <div className="flex items-center gap-2 text-gray-400">
                <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">{data.github.last_commit_sha}</code>
                <span>{fmtDate(data.github.last_commit_at)}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">Add GITHUB_PAT to Vercel env vars to enable</div>
          )}
        </div>

        {/* USPTO ODP */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚖️</span>
              <div>
                <div className="font-semibold text-sm text-gray-900">USPTO ODP</div>
                <div className="text-xs text-gray-400">patent data · read-only</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${data.uspto_odp.status === 'key_present' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
              {data.uspto_odp.status === 'key_present' ? '✓ Key set' : '✗ No key'}
            </span>
          </div>
          <div className="text-xs text-gray-500 leading-relaxed">{data.uspto_odp.description}</div>
          <div className="mt-2 text-xs text-gray-400 font-mono truncate">{data.uspto_odp.base_url}</div>
        </div>
      </div>

      {/* ── Brave Search (full card) ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center text-xl">🦁</div>
            <div>
              <div className="font-semibold text-gray-900">Brave Search API</div>
              <div className="text-xs text-gray-400">patent intelligence · prior art · market signals</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {brave.alert_level !== 'ok' && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${alertColor === 'red' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                {brave.alert_level === 'critical' ? '🔴 Near limit' : '🟡 Warning'}
              </span>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${brave.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {brave.status === 'connected' ? '✓ Connected' : '✗ No key'}
            </span>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Usage bar */}
          <div>
            <div className="flex justify-between items-end mb-1.5">
              <span className="text-sm font-medium text-gray-700">Monthly quota — {brave.plan} tier</span>
              <span className="text-sm text-gray-500">
                <strong className="text-gray-900">{brave.queries_this_month.toLocaleString()}</strong>
                {' / '}{brave.monthly_limit.toLocaleString()}
                {' '}<span className={`font-semibold ${alertColor === 'red' ? 'text-red-600' : alertColor === 'amber' ? 'text-amber-600' : 'text-gray-400'}`}>({brave.usage_pct}%)</span>
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(brave.usage_pct, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-400">
              <span>{brave.queries_remaining.toLocaleString()} remaining · resets {brave.reset_date} ({brave.days_to_reset}d)</span>
              <span>Projected: {brave.projected_monthly.toLocaleString()}/mo</span>
            </div>
          </div>

          {brave.alert_level !== 'ok' && (
            <div className={`rounded-lg px-4 py-2.5 text-sm ${alertColor === 'red' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {brave.alert_level === 'critical'
                ? `⚠️ ${brave.usage_pct}% used with ${brave.days_to_reset} days left. Consider upgrading to Pro (15k/mo at $3/mo).`
                : `⚠️ ${brave.usage_pct}% used. Projected ${brave.projected_monthly.toLocaleString()} queries this month.`}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Runs this month', value: brave.runs_this_month },
              { label: 'Total runs', value: brave.total_runs },
              { label: 'Success rate', value: `${brave.success_rate}%` },
              { label: 'Findings ever', value: brave.total_findings_ever.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>

          {brave.last_run && (
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600">Last run</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${brave.last_run.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {brave.last_run.status}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {fmtDate(brave.last_run.started_at)} · {brave.last_run.queries_used} queries · {brave.last_run.findings} findings ({brave.last_run.new_findings} new)
                {brave.last_run.error && <span className="text-red-500 ml-2">⚠️ {brave.last_run.error}</span>}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <div className="text-xs text-gray-400">
              Plan: <strong className="text-gray-700 capitalize">{brave.plan}</strong>
              {' · '}Limit: <strong className="text-gray-700">{brave.monthly_limit.toLocaleString()}/mo</strong>
              {' · '}<a href="https://api.search.brave.com" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Upgrade →</a>
            </div>
            {!editLimit ? (
              <button onClick={() => { setEditLimit(true); setNewLimit(String(brave.monthly_limit)) }}
                className="text-xs text-indigo-600 hover:underline font-medium">Edit limit</button>
            ) : (
              <div className="flex items-center gap-2">
                <input type="number" value={newLimit} onChange={e => setNewLimit(e.target.value)}
                  className="w-24 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                <button onClick={saveLimit} disabled={saving}
                  className="text-xs bg-indigo-600 text-white px-3 py-1 rounded font-medium disabled:opacity-50">
                  {saving ? '…' : 'Save'}
                </button>
                <button onClick={() => setEditLimit(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
              </div>
            )}
          </div>
        </div>

        {brave.recent_runs.length > 0 && (
          <div className="border-t border-gray-100">
            <div className="px-5 py-2.5 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">Recent runs</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-50">
                  {['Started', 'Status', 'Queries', 'Findings', 'New'].map(h => (
                    <th key={h} className={`py-2 font-medium text-gray-400 ${h === 'Started' ? 'px-5 text-left' : h === 'Status' ? 'px-4 text-left' : 'px-4 text-right'} ${h === 'New' ? 'pr-5' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {brave.recent_runs.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2 text-gray-500">{fmtDate(r.started_at)}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${r.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-700">{r.queries}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{r.findings}</td>
                    <td className="px-5 py-2 text-right text-emerald-600 font-medium">{r.new_findings > 0 ? `+${r.new_findings}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Admin Collaborator Invites Panel ─────────────────────────────────────────

interface CollabRow {
  id: string
  patent_id: string
  patent_title: string
  invited_email: string
  role: string
  ownership_pct: number
  accepted_at: string | null
  created_at: string
  status: 'pending' | 'expired' | 'active' | 'ghost'
}

const COLLAB_STATUS_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  active:  { label: 'Active',   cls: 'bg-green-100 text-green-700',  icon: '✅' },
  pending: { label: 'Pending',  cls: 'bg-amber-100 text-amber-700',  icon: '🟡' },
  expired: { label: 'Expired',  cls: 'bg-red-100 text-red-600',      icon: '🔴' },
  ghost:   { label: 'Ghost',    cls: 'bg-orange-100 text-orange-700', icon: '⚠️' },
}

const ROLE_LABELS_ADMIN: Record<string, string> = {
  co_inventor: 'Co-Inventor',
  legal_counsel: 'Legal Counsel',
  agency: 'Agency',
  viewer: 'Viewer',
  owner: 'Owner',
}

function AdminCollabsPanel({ authToken }: { authToken: string }) {
  const [collabs, setCollabs] = React.useState<CollabRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [resendingId, setResendingId] = React.useState<string | null>(null)
  const [resendMsg, setResendMsg] = React.useState<Record<string, string>>({})
  const [filter, setFilter] = React.useState<'all' | 'active' | 'pending' | 'expired' | 'ghost'>('all')

  const load = React.useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/collabs', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed to load'); setLoading(false); return }
    setCollabs(d.collabs ?? [])
    setLoading(false)
  }, [authToken])

  React.useEffect(() => { load() }, [load])

  async function resend(c: CollabRow) {
    setResendingId(c.id)
    const res = await fetch(`/api/patents/${c.patent_id}/resend-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ collaborator_id: c.id }),
    })
    const d = await res.json()
    setResendMsg(prev => ({ ...prev, [c.id]: res.ok ? `✅ Resent to ${c.invited_email}` : `❌ ${d.error}` }))
    setTimeout(() => setResendMsg(prev => { const copy = { ...prev }; delete copy[c.id]; return copy }), 5000)
    setResendingId(null)
    if (res.ok) load()
  }

  function formatDate(s: string | null) {
    if (!s) return '—'
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  const filtered = filter === 'all' ? collabs : collabs.filter(c => c.status === filter)
  const counts = { all: collabs.length, active: 0, pending: 0, expired: 0, ghost: 0 }
  collabs.forEach(c => { counts[c.status]++ })

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Collaborator Invites ({collabs.length})</h1>
        <button onClick={load} className="text-xs text-indigo-600 hover:underline">↻ Refresh</button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'active', 'pending', 'expired', 'ghost'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? `All (${counts.all})` : `${COLLAB_STATUS_BADGE[f]?.icon} ${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f]})`}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>}
      {error && <div className="text-sm text-red-500 py-4">{error}</div>}

      {!loading && !error && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Patent</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Invited</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No collaborator invites found.</td>
                  </tr>
                )}
                {filtered.map(c => {
                  const badge = COLLAB_STATUS_BADGE[c.status]
                  const canResend = c.status === 'expired' || c.status === 'ghost'
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{c.invited_email}</div>
                        {resendMsg[c.id] && (
                          <div className={`mt-1 text-xs ${resendMsg[c.id].startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
                            {resendMsg[c.id]}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={c.patent_title}>
                        {c.patent_title}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
                          {ROLE_LABELS_ADMIN[c.role] ?? c.role}
                        </span>
                        {c.ownership_pct > 0 && (
                          <span className="ml-1 text-gray-400">{c.ownership_pct}%</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                          {badge.icon} {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                      <td className="px-4 py-3">
                        {canResend && (
                          <button
                            onClick={() => resend(c)}
                            disabled={resendingId === c.id}
                            className="text-xs text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50 font-medium"
                          >
                            {resendingId === c.id ? '...' : 'Resend →'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Admin People Panel (unified: auth users + patent_profiles + collabs) ─────

interface PersonRow {
  email: string
  name: string | null
  account_status: 'active' | 'ghost' | 'no_account'
  user_id: string | null
  patents_owned: number
  collaborations: Array<{
    collab_id: string
    patent_id: string
    patent_title: string
    role: string
    collab_status: 'active' | 'ghost' | 'pending' | 'expired'
  }>
  joined: string | null
  last_seen: string | null
}

const ACCOUNT_BADGE: Record<string, { label: string; cls: string }> = {
  active:     { label: '✅ Active',     cls: 'bg-green-100 text-green-700' },
  ghost:      { label: '⚠️ Ghost',      cls: 'bg-orange-100 text-orange-700' },
  no_account: { label: '👤 No Account', cls: 'bg-gray-100 text-gray-500' },
}

const COLLAB_ROLE_SHORT: Record<string, string> = {
  co_inventor: 'Co-Inv',
  legal_counsel: 'Counsel',
  agency: 'Agency',
  viewer: 'Viewer',
  owner: 'Owner',
}

const COLLAB_STATUS_COLOR: Record<string, string> = {
  active:  'bg-green-100 text-green-700',
  ghost:   'bg-orange-100 text-orange-700',
  pending: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-600',
}

function AdminPeoplePanel({ authToken }: { authToken: string }) {
  const [people, setPeople] = React.useState<PersonRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [resendingId, setResendingId] = React.useState<string | null>(null)
  const [resendMsg, setResendMsg] = React.useState<Record<string, string>>({})
  const [filter, setFilter] = React.useState<'all' | 'active' | 'ghost' | 'no_account'>('all')

  const load = React.useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/people', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed to load'); setLoading(false); return }
    setPeople(d.people ?? [])
    setLoading(false)
  }, [authToken])

  React.useEffect(() => { load() }, [load])

  async function resendToPerson(person: PersonRow) {
    // Find the most recent expired/pending/ghost invite to resend
    const target = person.collaborations.find(
      c => c.collab_status === 'expired' || c.collab_status === 'ghost' || c.collab_status === 'pending'
    )
    if (!target) return

    setResendingId(person.email)
    const res = await fetch(`/api/patents/${target.patent_id}/resend-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ collaborator_id: target.collab_id }),
    })
    const d = await res.json()
    setResendMsg(prev => ({ ...prev, [person.email]: res.ok ? `✅ Resent to ${person.email}` : `❌ ${d.error}` }))
    setTimeout(() => setResendMsg(prev => { const copy = { ...prev }; delete copy[person.email]; return copy }), 5000)
    setResendingId(null)
    if (res.ok) load()
  }

  function formatDate(s: string | null) {
    if (!s) return '—'
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  const filtered = filter === 'all' ? people : people.filter(p => p.account_status === filter)
  const counts = { all: people.length, active: 0, ghost: 0, no_account: 0 }
  people.forEach(p => { counts[p.account_status]++ })

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">People ({people.length})</h1>
        <button onClick={load} className="text-xs text-indigo-600 hover:underline">↻ Refresh</button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'active', 'ghost', 'no_account'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all'
              ? `All (${counts.all})`
              : f === 'no_account'
              ? `👤 No Account (${counts.no_account})`
              : f === 'ghost'
              ? `⚠️ Ghost (${counts.ghost})`
              : `✅ Active (${counts.active})`}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>}
      {error && <div className="text-sm text-red-500 py-4">{error}</div>}

      {!loading && !error && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Person</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Patents</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Collaborations</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Last Seen</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No people found.</td>
                  </tr>
                )}
                {filtered.map(p => {
                  const badge = ACCOUNT_BADGE[p.account_status]
                  const canResend = (p.account_status === 'ghost' || p.account_status === 'no_account')
                    && p.collaborations.some(c =>
                      c.collab_status === 'expired' || c.collab_status === 'ghost' || c.collab_status === 'pending'
                    )
                  return (
                    <tr key={p.email} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{p.name ?? <span className="text-gray-400 italic">No name</span>}</div>
                        <div className="text-gray-400 mt-0.5">{p.email}</div>
                        {resendMsg[p.email] && (
                          <div className={`mt-1 text-xs ${resendMsg[p.email].startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
                            {resendMsg[p.email]}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-700">
                        {p.patents_owned > 0 ? `${p.patents_owned} owned` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {p.collaborations.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {p.collaborations.map(c => (
                              <span
                                key={c.collab_id}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${COLLAB_STATUS_COLOR[c.collab_status]}`}
                                title={`${c.patent_title} — ${c.role} — ${c.collab_status}`}
                              >
                                <span className="truncate max-w-[100px]">{c.patent_title.replace(/^(READI|QR\+|Traffic Stop)/i, m => m)}</span>
                                <span className="opacity-70">· {COLLAB_ROLE_SHORT[c.role] ?? c.role}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(p.joined)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(p.last_seen)}</td>
                      <td className="px-4 py-3">
                        {canResend && (
                          <button
                            onClick={() => resendToPersonWrapped(p)}
                            disabled={resendingId === p.email}
                            className="text-xs text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50 font-medium whitespace-nowrap"
                          >
                            {resendingId === p.email ? '...' : 'Resend →'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )

  function resendToPersonWrapped(person: PersonRow) {
    resendToPersonFn(person)
  }

  async function resendToPersonFn(person: PersonRow) {
    return resendToPersonImpl(person)
  }

  async function resendToPersonImpl(person: PersonRow) {
    const target = person.collaborations.find(
      c => c.collab_status === 'expired' || c.collab_status === 'ghost' || c.collab_status === 'pending'
    )
    if (!target) return
    setResendingId(person.email)
    const res = await fetch(`/api/patents/${target.patent_id}/resend-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ collaborator_id: target.collab_id }),
    })
    const d = await res.json()
    setResendMsg(prev => ({ ...prev, [person.email]: res.ok ? `✅ Resent to ${person.email}` : `❌ ${d.error}` }))
    setTimeout(() => setResendMsg(prev => { const copy = { ...prev }; delete copy[person.email]; return copy }), 5000)
    setResendingId(null)
    if (res.ok) load()
  }
}

// ── Admin Role Permissions Matrix ─────────────────────────────────────────────

const PERM_FEATURES: Array<{ key: string; label: string; description: string }> = [
  { key: 'details',       label: 'Details',         description: 'Inventor info, filing dates, description' },
  { key: 'claims',        label: 'Claims',          description: 'Full claims draft, scoring, refinement' },
  { key: 'spec',          label: 'Specification',   description: 'Specification document view/download' },
  { key: 'correspondence',label: 'Correspondence',  description: 'File uploads, USPTO letters, notes' },
  { key: 'filing',        label: 'Filing',          description: 'Filing checklist, cover sheet, package' },
  { key: 'collaborators', label: 'Collaborators',   description: 'View and manage collaborator invites' },
  { key: 'pattie',        label: 'Pattie AI Chat',  description: 'Ask Pattie floating chat widget' },
  { key: 'deadlines',     label: 'Deadlines',       description: 'Patent deadline tracking and alerts' },
]

const PERM_ROLES: Array<{ key: string; label: string; locked?: boolean }> = [
  { key: 'co_inventor',  label: 'Co-Inventor', locked: true },
  { key: 'legal_counsel',label: 'Legal Counsel' },
  { key: 'agency',       label: 'Agency' },
  { key: 'viewer',       label: 'Viewer' },
]

type PermMatrix = Record<string, Record<string, boolean>>

function AdminRolesPanel({ authToken }: { authToken: string }) {
  const [matrix, setMatrix] = React.useState<PermMatrix>({})
  const [saved, setSaved] = React.useState<PermMatrix>({})
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [toast, setToast] = React.useState('')
  const [error, setError] = React.useState('')

  const isDirty = React.useMemo(
    () => JSON.stringify(matrix) !== JSON.stringify(saved),
    [matrix, saved]
  )

  React.useEffect(() => {
    fetch('/api/admin/role-permissions', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.matrix) { setMatrix(d.matrix); setSaved(d.matrix) }
        else setError(d.error ?? 'Failed to load')
        setLoading(false)
      })
  }, [authToken])

  function toggle(role: string, feature: string) {
    setMatrix(prev => ({
      ...prev,
      [role]: { ...(prev[role] ?? {}), [feature]: !(prev[role]?.[feature] ?? false) },
    }))
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/admin/role-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ matrix }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { setError(d.error ?? 'Save failed'); return }
    setSaved(matrix)
    setToast(`✅ Permissions saved — ${d.updated} rows updated`)
    setTimeout(() => setToast(''), 4000)
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading permissions...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Role Permissions</h1>
          <p className="text-sm text-gray-400 mt-0.5">Control what each collaborator role can see. Co-Inventor is locked to full access.</p>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              ● Unsaved changes
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || !isDirty}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
          {toast}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider w-48">Feature</th>
                {PERM_ROLES.map(role => (
                  <th key={role.key} className="px-4 py-3 text-center font-semibold text-gray-700 text-xs uppercase tracking-wider">
                    <div>{role.label}</div>
                    {role.locked && <div className="text-[10px] text-gray-400 font-normal mt-0.5">always on</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {PERM_FEATURES.map(feature => (
                <tr key={feature.key} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-gray-800 text-sm">{feature.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{feature.description}</div>
                  </td>
                  {PERM_ROLES.map(role => {
                    const enabled = role.locked ? true : (matrix[role.key]?.[feature.key] ?? false)
                    return (
                      <td key={role.key} className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => !role.locked && toggle(role.key, feature.key)}
                          disabled={role.locked}
                          aria-label={`${role.label} ${feature.label}: ${enabled ? 'on' : 'off'}`}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                            enabled ? 'bg-indigo-600' : 'bg-gray-200'
                          } ${role.locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Changes take effect immediately after saving. Collaborators who are currently viewing a patent will see changes on next page load.
      </p>
    </div>
  )
}
