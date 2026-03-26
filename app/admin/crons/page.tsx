'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

// ── Cron definitions ──────────────────────────────────────────────────────────
const CRONS = [
  { name: 'claw-invents-nightly',   label: 'Nightly Invention Run',     schedule: 'Daily 11PM CT',    agent: 'monitor-claw' },
  { name: 'claw-observer-nightly',  label: 'Observer (Health Check)',    schedule: 'Daily 12:30AM CT', agent: 'monitor-claw' },
  { name: 'claw-healer-midnight',   label: 'Healer (Midnight)',          schedule: 'Daily 12:30AM CT', agent: 'monitor-claw' },
  { name: 'claw-healer-morning',    label: 'Healer (Morning)',           schedule: 'Daily 7:30AM CT',  agent: 'monitor-claw' },
  { name: 'clawwatch-nightly',      label: 'ClawWatch (Login Monitor)',  schedule: 'Daily 8AM CT',     agent: 'monitor-claw' },
  { name: 'ux-audit-nightly',       label: 'UX Ideation Audit',          schedule: 'Daily 3AM CT',     agent: 'monitor-claw' },
  { name: 'pattie-monitor-nightly', label: 'Pattie Monitor',             schedule: 'Daily 10AM CT',    agent: 'monitor-claw' },
  { name: 'daily-briefing',         label: 'Daily Briefing',             schedule: 'Daily 8AM CT',     agent: 'monitor-claw' },
  { name: 'claw-blog-writer',       label: 'SEO Blog Writer',            schedule: 'Tue + Fri 6AM CT', agent: 'monitor-claw' },
  { name: 'claw-community-radar',   label: 'Community Radar',            schedule: 'Every 4 hours',    agent: 'monitor-claw' },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface CronRun {
  cron_name: string
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  status: 'success' | 'failed' | 'running' | null
  output: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>
  const cfg: Record<string, { icon: string; cls: string }> = {
    success: { icon: '✅', cls: 'bg-green-100 text-green-700' },
    failed:  { icon: '❌', cls: 'bg-red-100 text-red-700' },
    running: { icon: '⏳', cls: 'bg-amber-100 text-amber-700' },
  }
  const { icon, cls } = cfg[status] ?? { icon: '—', cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {icon} {status}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CronsPage() {
  const router = useRouter()
  const [authToken, setAuthToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [latestByCron, setLatestByCron] = useState<Record<string, CronRun>>({})
  const [recentRuns, setRecentRuns] = useState<(CronRun & { id: string })[]>([])
  const [nightlyLimit, setNightlyLimit] = useState(2)
  const [nightlyLimitDraft, setNightlyLimitDraft] = useState(2)
  const [savingLimit, setSavingLimit] = useState(false)
  const [savedLimit, setSavedLimit] = useState(false)
  const [triggering, setTriggering] = useState<Record<string, boolean>>({})
  const [triggerMsg, setTriggerMsg] = useState<Record<string, string>>({})
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const fetchData = useCallback(async (token: string) => {
    const res = await fetch('/api/admin/crons', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const d = await res.json()
    setLatestByCron(d.latestByCron ?? {})
    setRecentRuns(d.recentRuns ?? [])
    setNightlyLimit(d.nightlyLimit ?? 2)
    setNightlyLimitDraft(d.nightlyLimit ?? 2)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? ''
        setAuthToken(token)
        fetchData(token).finally(() => setLoading(false))
      })
    })
  }, [router, fetchData])

  async function handleTrigger(cronName: string) {
    setTriggering(prev => ({ ...prev, [cronName]: true }))
    setTriggerMsg(prev => ({ ...prev, [cronName]: '' }))
    try {
      const res = await fetch('/api/admin/crons/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ cron_name: cronName }),
      })
      const d = await res.json()
      setTriggerMsg(prev => ({
        ...prev,
        [cronName]: res.ok ? '✅ Triggered' : `❌ ${d.error ?? 'Failed'}`,
      }))
      if (res.ok) setTimeout(() => fetchData(authToken), 3000)
    } catch {
      setTriggerMsg(prev => ({ ...prev, [cronName]: '❌ Network error' }))
    } finally {
      setTriggering(prev => ({ ...prev, [cronName]: false }))
    }
  }

  async function handleSaveLimit() {
    setSavingLimit(true)
    try {
      const res = await fetch('/api/admin/crons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ nightlyLimit: nightlyLimitDraft }),
      })
      if (res.ok) {
        setNightlyLimit(nightlyLimitDraft)
        setSavedLimit(true)
        setTimeout(() => setSavedLimit(false), 2500)
      }
    } finally {
      setSavingLimit(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
              <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link>
              <span>/</span>
              <span className="text-[#1a1f36]">Crons</span>
            </div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">Cron Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">All 8 monitor-claw scheduled jobs</p>
          </div>
          <button
            onClick={() => fetchData(authToken)}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>

        {/* ── Status Table ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Cron Status</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr className="text-xs text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Job</th>
                  <th className="px-4 py-3 text-left">Schedule</th>
                  <th className="px-4 py-3 text-left">Agent</th>
                  <th className="px-4 py-3 text-left">Last Run</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {CRONS.map(cron => {
                  const last = latestByCron[cron.name]
                  const isTriggering = triggering[cron.name]
                  const msg = triggerMsg[cron.name]
                  return (
                    <tr key={cron.name} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1a1f36]">{cron.label}</div>
                        <div className="text-xs text-gray-400 font-mono">{cron.name}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{cron.schedule}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                          {cron.agent}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {last ? (
                          <span title={new Date(last.started_at).toLocaleString()}>
                            {relativeTime(last.started_at)}
                          </span>
                        ) : <span className="text-gray-300">Never</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {last?.duration_seconds != null ? `${last.duration_seconds}s` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={last?.status ?? null} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleTrigger(cron.name)}
                            disabled={isTriggering}
                            className="px-3 py-1.5 bg-[#1a1f36] text-white rounded-lg text-xs font-semibold hover:bg-[#2d3561] disabled:opacity-50 transition-colors"
                          >
                            {isTriggering ? '⏳' : '▶ Run'}
                          </button>
                          {msg && (
                            <span className={`text-xs ${msg.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                              {msg}
                            </span>
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

        {/* ── Run Log ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Last 20 Runs
            </span>
          </div>
          {recentRuns.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              No runs recorded yet. Logs appear here once cron scripts start writing to <code className="text-xs bg-gray-100 px-1 rounded">cron_run_log</code>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr className="text-xs text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">Cron</th>
                    <th className="px-4 py-3 text-left">Duration</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentRuns.map(run => {
                    const isExpanded = expandedRow === run.id
                    const firstLine = (run.output ?? '').split('\n')[0].slice(0, 80)
                    return (
                      <tr key={run.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {relativeTime(run.started_at)}
                          <div className="text-gray-300 text-[10px]">
                            {new Date(run.started_at).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-gray-700">{run.cron_name}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {run.duration_seconds != null ? `${run.duration_seconds}s` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">
                          {run.output ? (
                            <>
                              <span className="truncate block">{firstLine}{firstLine.length < (run.output ?? '').length && '…'}</span>
                              {(run.output ?? '').length > 80 && (
                                <button
                                  onClick={() => setExpandedRow(isExpanded ? null : run.id)}
                                  className="text-indigo-500 hover:underline text-[10px] mt-0.5"
                                >
                                  {isExpanded ? 'collapse ▲' : 'expand ▼'}
                                </button>
                              )}
                              {isExpanded && (
                                <pre className="mt-2 text-[10px] text-gray-600 bg-gray-50 border border-gray-100 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                                  {run.output}
                                </pre>
                              )}
                            </>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Settings ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 text-sm mb-4">Settings</h2>
          <div className="space-y-4 max-w-sm">
            {/* Nightly patent limit */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Nightly New Patent Limit
                <span className="ml-1 text-gray-400 font-normal">(patents invented per night)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={nightlyLimitDraft}
                  onChange={e => setNightlyLimitDraft(Number(e.target.value))}
                  className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  onClick={handleSaveLimit}
                  disabled={savingLimit || nightlyLimitDraft === nightlyLimit}
                  className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50 transition-colors"
                >
                  {savingLimit ? 'Saving…' : 'Save'}
                </button>
                {savedLimit && <span className="text-xs text-green-600 font-semibold">Saved ✓</span>}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Current DB value: <strong>{nightlyLimit}</strong>. Set to 0 to pause nightly inventing.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
