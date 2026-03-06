'use client'
import { useEffect, useState } from 'react'
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
  const [activeSection, setActiveSection] = useState<'overview' | 'patents' | 'users' | 'ai-costs' | 'activity'>('overview')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

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

  if (!stats) return null
  const { summary } = stats
  const margin = summary.revenue_usd > 0
    ? ((summary.revenue_usd - summary.total_ai_cost_usd) / summary.revenue_usd * 100).toFixed(1)
    : '—'

  const navItems: { key: typeof activeSection; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'patents', label: `Patents (${summary.total_patents})`, icon: '📋' },
    { key: 'users', label: `Users (${summary.total_users})`, icon: '👤' },
    { key: 'ai-costs', label: 'AI Costs', icon: '🤖' },
    { key: 'activity', label: 'Activity', icon: '📡' },
  ]

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
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
                activeSection === item.key ? 'bg-[#1a1f36] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="mr-2">{item.icon}</span>{item.label}
            </button>
          ))}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">Coming Soon</div>
            <div className="text-xs text-gray-300 px-3 py-2">
              <div>📧 Email analytics</div>
              <div className="mt-1">💰 Stripe live</div>
              <div className="mt-1">📢 AI Marketer</div>
            </div>
          </div>
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

        </main>
      </div>
    </div>
  )
}
