'use client'
import { useEffect, useState, useCallback } from 'react'
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
  const [activeSection, setActiveSection] = useState<'overview' | 'patents' | 'users' | 'ai-costs' | 'activity' | 'inbox' | 'content' | 'agency'>('overview')
  const [authToken, setAuthToken] = useState('')

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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.access_token) setAuthToken(session.access_token)

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
    }
    load()
  }, [router])

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
    if (activeSection === 'content' && authToken) loadContent()
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

  if (!stats) return null
  const { summary } = stats
  const margin = summary.revenue_usd > 0
    ? ((summary.revenue_usd - summary.total_ai_cost_usd) / summary.revenue_usd * 100).toFixed(1)
    : '—'

  const actionCount = inboxItems.filter(i => i.is_action_required && !i.is_reviewed).length

  const navItems: { key: typeof activeSection; label: string; icon: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'inbox', label: 'Inbox', icon: '📧', badge: actionCount || undefined },
    { key: 'content', label: 'Content', icon: '✍️' },
    { key: 'agency', label: 'Agency', icon: '🤝' },
    { key: 'patents', label: `Patents (${summary.total_patents})`, icon: '📋' },
    { key: 'users', label: `Users (${summary.total_users})`, icon: '👤' },
    { key: 'ai-costs', label: 'AI Costs', icon: '🤖' },
    { key: 'activity', label: 'Activity', icon: '📡' },
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
          {activeSection === 'users' && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-5">Users ({stats.user_table.length})</h1>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Name / Email</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Patents</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.user_table.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{u.name}</div>
                          <div className="text-gray-400 text-xs">{u.email}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold">{u.patent_count}</td>
                        <td className="px-4 py-3">{u.paid ? '✅' : '—'}</td>
                        <td className="px-4 py-3">
                          {u.is_admin ? <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-bold">Admin</span> : <span className="text-gray-400">User</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{formatDate(u.joined)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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

          {/* ── CONTENT SECTION ───────────────────────────────────────────────── */}
          {activeSection === 'content' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">BoBozly Content Pipeline</h1>
                  <div className="flex gap-3 mt-1">
                    {Object.entries(contentSummary).map(([status, count]) => (
                      <span key={status} className="text-xs text-gray-400">
                        {status}: <strong className="text-gray-600">{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  {(['all', 'draft', 'published'] as const).map(f => (
                    <button key={f} onClick={() => setContentFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        contentFilter === f ? 'bg-[#1a1f36] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {f === 'all' ? 'All' : f === 'draft' ? '✏️ Drafts' : '✅ Published'}
                    </button>
                  ))}
                </div>
              </div>

              {contentLoading ? (
                <div className="text-gray-400 text-sm py-8 text-center">Loading content…</div>
              ) : contentItems.length === 0 ? (
                <div className="text-gray-400 text-sm py-8 text-center">No content found.</div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Title</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Status</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Type</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Author</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Created</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Published</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {contentItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                            {item.is_bos_pick && <span className="mr-1.5">⭐</span>}
                            {item.title}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              item.status === 'published'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{item.content_type ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500">{item.author ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-400">{formatDate(item.created_at)}</td>
                          <td className="px-4 py-3 text-gray-400">{formatDate(item.published_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

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

        </main>
      </div>
    </div>
  )
}
