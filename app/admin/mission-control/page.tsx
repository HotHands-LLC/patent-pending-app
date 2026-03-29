'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatentRow {
  id: string
  title: string
  application_number: string | null
  np_deadline: string | null
  status: string | null
  is_fallback?: boolean
}

interface QueueData {
  status: 'running' | 'idle' | 'paused'
  in_progress: Array<{ id: string; prompt_label: string; started_at: string | null }>
  queued_count: number
  queued: Array<{ id: string; prompt_label: string; priority: number; created_at: string }>
  current_task: { id: string; prompt_label: string; started_at: string | null } | null
  elapsed_min: number
  last_completed: { id: string; prompt_label: string; completed_at: string | null } | null
  auto_run_enabled: boolean
}

interface CronRow {
  cron_name: string
  status: string
  ran_at: string
  notes: string | null
}

interface RadarData {
  pending_count: number
  last_run: string | null
}

interface HealthIndicator {
  status: 'green' | 'yellow' | 'red'
  [key: string]: unknown
}

interface HealthData {
  pattie: HealthIndicator & { errors_last_hour: number }
  supabase: HealthIndicator & { errors_last_24h: number }
  vercel: HealthIndicator & { last_deploy_sha: string | null }
  queue: HealthIndicator & { queued_count: number; current_task: string | null }
  radar: HealthIndicator & { pending_count: number }
}

interface ActionItems {
  dynamic_patents: PatentRow[]
  static: {
    steve_mccain: string | null
    improvmx: string | null
    vercel: string | null
  }
}

interface MissionControlData {
  patents: PatentRow[]
  queue: QueueData
  cron_health: CronRow[] | null
  radar: RadarData
  health: HealthData
  action_items: ActionItems
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDaysUntil(dateStr: string | null): number {
  if (!dateStr) return 9999
  const target = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'))
  return Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function deadlineColor(days: number) {
  if (days <= 7) return 'bg-red-50 border-red-200 text-red-700'
  if (days <= 30) return 'bg-yellow-50 border-yellow-200 text-yellow-700'
  return 'bg-green-50 border-green-200 text-green-700'
}

function deadlineEmoji(days: number) {
  if (days <= 7) return '🔴'
  if (days <= 30) return '🟡'
  return '🟢'
}

function deadlineBadge(days: number) {
  if (days < 0) return { text: `${Math.abs(days)}d OVERDUE`, cls: 'bg-red-600 text-white' }
  if (days === 0) return { text: 'TODAY', cls: 'bg-red-600 text-white' }
  return { text: `${days}d`, cls: days <= 7 ? 'bg-red-100 text-red-700' : days <= 30 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700' }
}

function healthColor(status: 'green' | 'yellow' | 'red') {
  return {
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
    red: 'bg-red-500',
  }[status]
}

function healthBg(status: 'green' | 'yellow' | 'red') {
  return {
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
  }[status]
}

function cronStatusBadge(status: string) {
  if (status === 'ok' || status === 'success') return { emoji: '✅', cls: 'bg-green-100 text-green-700' }
  if (status === 'warning' || status === 'warn') return { emoji: '⚠️', cls: 'bg-yellow-100 text-yellow-700' }
  return { emoji: '❌', cls: 'bg-red-100 text-red-700' }
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden ${className ?? ''}`}>
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h2 className="font-bold text-[#1a1f36] text-sm">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const show = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }
  return { toast, show }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const router = useRouter()
  const { toast, show: showToast } = useToast()
  const [authToken, setAuthToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MissionControlData | null>(null)
  const [startingQueue, setStartingQueue] = useState(false)
  const [dismissingKey, setDismissingKey] = useState<string | null>(null)

  const loadData = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/admin/mission-control', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const json = await res.json() as MissionControlData
        setData(json)
      }
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? ''
        setAuthToken(token)
        loadData(token).finally(() => setLoading(false))
      })
    })
  }, [router, loadData])

  async function startQueue() {
    setStartingQueue(true)
    try {
      const res = await fetch('/api/admin/queue/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const json = await res.json()
      if (res.ok) {
        showToast('▶ Queue started!')
        await loadData(authToken)
      } else {
        showToast(`❌ ${json.error ?? 'Failed to start queue'}`)
      }
    } finally {
      setStartingQueue(false)
    }
  }

  async function dismissActionItem(key: string) {
    setDismissingKey(key)
    try {
      const res = await fetch('/api/admin/mission-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ key }),
      })
      if (res.ok) {
        showToast('✓ Marked done')
        await loadData(authToken)
      }
    } finally {
      setDismissingKey(null)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading Mission Control…</div>
    </div>
  )

  const d = data

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link>
              <span>/</span>
              <span className="text-[#1a1f36]">Mission Control</span>
            </div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">🎯 Mission Control</h1>
            <p className="text-sm text-gray-500 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => loadData(authToken)}
            className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
        </div>

        {/* ── Platform Health Strip ──────────────────────────────────────────── */}
        {d?.health && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Pattie */}
            <div className={`rounded-xl border p-4 ${healthBg(d.health.pattie.status)}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${healthColor(d.health.pattie.status)}`} />
                <span className="text-xs font-bold text-gray-700">Pattie</span>
              </div>
              <p className="text-xs text-gray-500">
                {d.health.pattie.errors_last_hour === 0
                  ? 'No errors (1h)'
                  : `${d.health.pattie.errors_last_hour} error${d.health.pattie.errors_last_hour !== 1 ? 's' : ''} (1h)`}
              </p>
            </div>

            {/* Supabase */}
            <div className={`rounded-xl border p-4 ${healthBg(d.health.supabase.status)}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${healthColor(d.health.supabase.status)}`} />
                <span className="text-xs font-bold text-gray-700">Supabase</span>
              </div>
              <p className="text-xs text-gray-500">
                {d.health.supabase.errors_last_24h === 0
                  ? 'Clean (24h)'
                  : `${d.health.supabase.errors_last_24h} error${d.health.supabase.errors_last_24h !== 1 ? 's' : ''} (24h)`}
              </p>
            </div>

            {/* Vercel */}
            <div className={`rounded-xl border p-4 ${healthBg(d.health.vercel.status)}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${healthColor(d.health.vercel.status)}`} />
                <span className="text-xs font-bold text-gray-700">Vercel</span>
              </div>
              <p className="text-xs text-gray-500 truncate">
                {d.health.vercel.last_deploy_sha
                  ? `SHA: ${String(d.health.vercel.last_deploy_sha).slice(0, 7)}`
                  : 'Connected'}
              </p>
            </div>

            {/* Queue */}
            <div className={`rounded-xl border p-4 ${
              d.health.queue.status === 'green' ? 'bg-green-50 border-green-200' :
              d.health.queue.status === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${
                  d.queue.status === 'running' ? 'bg-green-500' :
                  d.queue.status === 'paused' ? 'bg-gray-400' : 'bg-blue-400'
                }`} />
                <span className="text-xs font-bold text-gray-700">Queue</span>
              </div>
              <p className="text-xs text-gray-500 capitalize">
                {d.queue.status} · {d.queue.queued_count} queued
              </p>
            </div>

            {/* Radar */}
            <div className={`rounded-xl border p-4 ${healthBg(d.health.radar.status)}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${healthColor(d.health.radar.status)}`} />
                <span className="text-xs font-bold text-gray-700">Radar</span>
              </div>
              <p className="text-xs text-gray-500">
                {d.health.radar.pending_count} pending repl{d.health.radar.pending_count !== 1 ? 'ies' : 'y'}
              </p>
            </div>
          </div>
        )}

        {/* ── Main + Sidebar layout ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Main sections (2/3 width) ───────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Section 1: Patent Deadlines */}
            <Section title="⚖️ Patent Deadlines">
              {!d || d.patents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No patent deadlines found.</p>
              ) : (
                <div className="space-y-2">
                  {d.patents.map(p => {
                    const days = getDaysUntil(p.np_deadline)
                    const badge = deadlineBadge(days)
                    const rowColor = deadlineColor(days)
                    const emoji = deadlineEmoji(days)
                    return (
                      <div key={p.id} className={`flex items-center justify-between gap-3 border rounded-xl px-4 py-3 ${rowColor}`}>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-base shrink-0">{emoji}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-[#1a1f36] truncate">{p.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {p.application_number ? `#${p.application_number} · ` : ''}
                              NP Deadline: {formatDate(p.np_deadline)}
                              {p.is_fallback && ' (hardcoded)'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badge.cls}`}>
                            {badge.text}
                          </span>
                          {p.status && (
                            <span className="px-2 py-0.5 bg-white/70 border border-gray-200 rounded text-xs text-gray-500 capitalize">
                              {p.status.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {/* Section 2: Queue Status */}
            <Section title="⚡ Queue Status">
              {!d ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : (
                <div className="space-y-4">
                  {/* Status row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                      d.queue.status === 'running' ? 'bg-green-100 text-green-700' :
                      d.queue.status === 'paused' ? 'bg-gray-100 text-gray-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        d.queue.status === 'running' ? 'bg-green-500 animate-pulse' :
                        d.queue.status === 'paused' ? 'bg-gray-400' : 'bg-blue-400'
                      }`} />
                      {d.queue.status.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-500">{d.queue.queued_count} item{d.queue.queued_count !== 1 ? 's' : ''} queued</span>
                  </div>

                  {/* Current task */}
                  {d.queue.current_task ? (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <p className="text-xs text-blue-500 font-semibold mb-1">▶ In Progress</p>
                      <p className="text-sm font-semibold text-[#1a1f36]">{d.queue.current_task.prompt_label}</p>
                      {d.queue.elapsed_min > 0 && (
                        <p className="text-xs text-gray-400 mt-1">Running {d.queue.elapsed_min}m</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No task currently running.</p>
                  )}

                  {/* Last completed */}
                  {d.queue.last_completed && (
                    <div className="text-xs text-gray-400">
                      ✓ Last completed: <span className="text-gray-600">{d.queue.last_completed.prompt_label}</span>
                      {d.queue.last_completed.completed_at && ` · ${formatDateTime(d.queue.last_completed.completed_at)}`}
                    </div>
                  )}

                  {/* Queued items preview */}
                  {d.queue.queued.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">Up next:</p>
                      <div className="space-y-1">
                        {d.queue.queued.slice(0, 5).map((item, i) => (
                          <div key={item.id} className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="text-gray-400">{i + 1}.</span>
                            <span className="truncate">{item.prompt_label}</span>
                          </div>
                        ))}
                        {d.queue.queued.length > 5 && (
                          <p className="text-xs text-gray-400">…and {d.queue.queued.length - 5} more</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Start queue button */}
                  {d.queue.queued_count > 0 && d.queue.status !== 'running' && (
                    <button
                      onClick={startQueue}
                      disabled={startingQueue}
                      className="px-4 py-2 bg-[#1a1f36] text-white text-sm font-semibold rounded-xl hover:bg-[#2d3561] disabled:opacity-50 flex items-center gap-2"
                    >
                      {startingQueue ? <span className="animate-spin">⏳</span> : '▶'} Start Queue
                    </button>
                  )}

                  <div className="pt-2 border-t border-gray-100">
                    <Link href="/admin/claw-queue" className="text-xs text-indigo-600 hover:underline">
                      View full queue →
                    </Link>
                  </div>
                </div>
              )}
            </Section>

            {/* Section 3: Cron Health */}
            <Section title="⏰ Cron Health (Last 24h)">
              {!d ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : d.cron_health === null ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-400">No cron log available</p>
                  <p className="text-xs text-gray-300 mt-1">Create a <code className="bg-gray-100 px-1 rounded">cron_run_log</code> table to enable tracking</p>
                </div>
              ) : d.cron_health.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No cron runs in the last 24h.</p>
              ) : (
                <div className="space-y-2">
                  {d.cron_health.map(cron => {
                    const badge = cronStatusBadge(cron.status)
                    return (
                      <div key={cron.cron_name} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-base">{badge.emoji}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#1a1f36] truncate">{cron.cron_name}</p>
                            {cron.notes && (
                              <p className="text-xs text-gray-400 truncate mt-0.5">{cron.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badge.cls}`}>
                            {cron.status}
                          </span>
                          <span className="text-xs text-gray-400">{formatDateTime(cron.ran_at)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Link href="/admin/crons" className="text-xs text-indigo-600 hover:underline">
                  View cron manager →
                </Link>
              </div>
            </Section>

            {/* Section 4: Community Radar */}
            <Section title="📡 Community Radar">
              {!d ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-[#1a1f36]">{d.radar.pending_count}</p>
                    <p className="text-sm text-gray-500">
                      {d.radar.pending_count === 1 ? 'reply' : 'replies'} pending review (draft/pending)
                    </p>
                    {d.radar.last_run && (
                      <p className="text-xs text-gray-400">Last run: {formatDateTime(d.radar.last_run)}</p>
                    )}
                  </div>
                  <Link
                    href="/admin/observer"
                    className="px-4 py-2 bg-[#1a1f36] text-white text-sm font-semibold rounded-xl hover:bg-[#2d3561] whitespace-nowrap"
                  >
                    Review →
                  </Link>
                </div>
              )}
            </Section>
          </div>

          {/* ── Right: Chad's To-Do sidebar (1/3 width) ───────────────────── */}
          <div className="space-y-4">
            <Section title="📋 Chad's To-Do">
              {!d ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : (
                <div className="space-y-4">

                  {/* Dynamic: urgent patents */}
                  {d.action_items.dynamic_patents.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-500 mb-2 uppercase tracking-wide">⚠ Urgent Patents</p>
                      <div className="space-y-2">
                        {d.action_items.dynamic_patents.map(p => {
                          const days = getDaysUntil(p.np_deadline)
                          return (
                            <div key={p.id} className="bg-red-50 border border-red-100 rounded-xl p-3">
                              <p className="text-sm font-semibold text-red-700">{p.title}</p>
                              <p className="text-xs text-red-500 mt-0.5">
                                NP deadline {formatDate(p.np_deadline)} · {days}d left
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Static: Steve McCain */}
                  {d.action_items.static.steve_mccain && (
                    <div className="border border-gray-200 rounded-xl p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">📝</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 mb-1">Steve McCain</p>
                          <p className="text-xs text-gray-600">{d.action_items.static.steve_mccain}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => dismissActionItem('chad_action_steve_mccain')}
                        disabled={dismissingKey === 'chad_action_steve_mccain'}
                        className="mt-2 w-full px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500 font-medium disabled:opacity-50"
                      >
                        {dismissingKey === 'chad_action_steve_mccain' ? '…' : '✓ Done'}
                      </button>
                    </div>
                  )}

                  {/* Static: ImprovMX */}
                  {d.action_items.static.improvmx && (
                    <div className="border border-gray-200 rounded-xl p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">📧</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 mb-1">ImprovMX</p>
                          <p className="text-xs text-gray-600">{d.action_items.static.improvmx}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => dismissActionItem('chad_action_improvmx')}
                        disabled={dismissingKey === 'chad_action_improvmx'}
                        className="mt-2 w-full px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500 font-medium disabled:opacity-50"
                      >
                        {dismissingKey === 'chad_action_improvmx' ? '…' : '✓ Done'}
                      </button>
                    </div>
                  )}

                  {/* Static: Vercel */}
                  {d.action_items.static.vercel && (
                    <div className="border border-gray-200 rounded-xl p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">▲</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 mb-1">Vercel</p>
                          <p className="text-xs text-gray-600">{d.action_items.static.vercel}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => dismissActionItem('chad_action_vercel')}
                        disabled={dismissingKey === 'chad_action_vercel'}
                        className="mt-2 w-full px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500 font-medium disabled:opacity-50"
                      >
                        {dismissingKey === 'chad_action_vercel' ? '…' : '✓ Done'}
                      </button>
                    </div>
                  )}

                  {/* All clear */}
                  {d.action_items.dynamic_patents.length === 0
                    && !d.action_items.static.steve_mccain
                    && !d.action_items.static.improvmx
                    && !d.action_items.static.vercel && (
                    <p className="text-sm text-gray-400 text-center py-4">All clear! Nothing needs attention. 🎉</p>
                  )}
                </div>
              )}
            </Section>

            {/* Quick links */}
            <Section title="🔗 Quick Links">
              <div className="space-y-2">
                {[
                  { href: '/admin/claw-queue', label: '⚡ Queue Manager' },
                  { href: '/admin/observer', label: '📡 Radar / Observer' },
                  { href: '/admin/crons', label: '⏰ Cron Manager' },
                  { href: '/admin/claw-patents', label: '🏛 Patent Admin' },
                  { href: '/admin/security', label: '🔒 Security' },
                ].map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-5 py-3 rounded-xl text-sm font-semibold shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
