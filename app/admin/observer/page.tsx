'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface ObserverRun {
  id: string
  run_date: string
  patent_title: string | null
  health_score: number | null
  events_total: number
  events_p0: number
  events_p1: number
  events_p2: number
  prior_score: number | null
  delta: number | null
  completed: boolean
  drive_url: string | null
  created_at: string
}

interface FrictionLog {
  id: string
  run_id: string
  step: string
  field: string | null
  friction_type: string
  severity: string
  description: string
  suggested_fix: string | null
  status: string
  created_at: string
}

type SeverityFilter = 'all' | 'P0' | 'P1' | 'P2'
type StatusFilter   = 'all' | 'open' | 'fix_dispatched' | 'resolved'

const SEV_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 border-red-300',
  P1: 'bg-amber-100 text-amber-700 border-amber-300',
  P2: 'bg-blue-100 text-blue-700 border-blue-300',
}

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400">—</span>
  const color = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'
  return <span className={`font-bold tabular-nums ${color}`}>{score.toFixed(1)}</span>
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-gray-400 text-xs">first</span>
  const pos = delta >= 0
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${pos ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {pos ? '↑+' : '↓'}{Math.abs(delta).toFixed(1)}
    </span>
  )
}

export default function ObserverAdminPage() {
  const [runs, setRuns]         = useState<ObserverRun[]>([])
  const [logs, setLogs]         = useState<FrictionLog[]>([])
  const [loading, setLoading]   = useState(true)
  const [sevFilter, setSevFilter] = useState<SeverityFilter>('all')
  const [statFilter, setStatFilter] = useState<StatusFilter>('open')
  const [marking, setMarking]   = useState<string | null>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: runsData }, { data: logsData }] = await Promise.all([
      supabase.from('claw_observer_runs')
        .select('*').order('run_date', { ascending: false }).limit(30),
      supabase.from('claw_observer_logs')
        .select('*').order('created_at', { ascending: false }).limit(200),
    ])
    setRuns((runsData as ObserverRun[]) ?? [])
    setLogs((logsData as FrictionLog[]) ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function markResolved(logId: string) {
    setMarking(logId)
    await supabase.from('claw_observer_logs').update({ status: 'resolved' }).eq('id', logId)
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, status: 'resolved' } : l))
    setMarking(null)
  }

  // Chart data
  const chartData = [...runs].reverse().map(r => ({
    date: r.run_date,
    score: r.health_score ?? 0,
    delta: r.delta,
  }))

  // Filtered logs
  const filteredLogs = logs.filter(l => {
    if (sevFilter !== 'all' && l.severity !== sevFilter) return false
    if (statFilter !== 'all' && l.status !== statFilter) return false
    return true
  })

  const latestRun = runs[0]

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Loading Observer data…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1a1f36] text-white px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← Admin</Link>
        <h1 className="font-bold text-lg">🔍 Claw Observer</h1>
        <span className="text-gray-400 text-xs">{runs.length} runs · {logs.length} friction events</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Latest score card */}
        {latestRun && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="sm:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-3xl font-black text-[#1a1f36]">
                {latestRun.health_score?.toFixed(1) ?? '—'}<span className="text-lg text-gray-400">/100</span>
              </div>
              <div className="text-xs font-semibold text-gray-500 mt-0.5">Latest UX Health Score</div>
              <div className="mt-1"><DeltaBadge delta={latestRun.delta} /></div>
            </div>
            {[
              { label: 'P0 Blockers', val: latestRun.events_p0, color: 'text-red-600' },
              { label: 'P1 Confusion', val: latestRun.events_p1, color: 'text-amber-600' },
              { label: 'P2 Edges', val: latestRun.events_p2, color: 'text-blue-600' },
              { label: 'Run completed', val: latestRun.completed ? 'Yes' : 'No', color: latestRun.completed ? 'text-green-600' : 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-xs font-semibold text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Health Score Trend */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-bold text-gray-900 mb-4">📈 Health Score Trend</h2>
          {chartData.length < 2 ? (
            <p className="text-sm text-gray-400">Need at least 2 runs for trend chart. First run completed — check back tomorrow.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: unknown, name: string) => [
                    name === 'score' ? `${Number(val).toFixed(1)}/100` : val,
                    name === 'score' ? 'Health Score' : 'Delta'
                  ]}
                />
                <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'Target 80', position: 'right', fontSize: 10, fill: '#16a34a' }} />
                <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2.5}
                      dot={{ r: 4, fill: '#4f46e5' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Run History */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Run History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Date', 'Patent', 'Score', 'Δ', 'P0', 'P1', 'P2', 'Done', 'Report'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {runs.map(run => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-500">{run.run_date}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate text-gray-800">{run.patent_title ?? '—'}</td>
                    <td className="px-4 py-3"><ScoreChip score={run.health_score} /></td>
                    <td className="px-4 py-3"><DeltaBadge delta={run.delta} /></td>
                    <td className="px-4 py-3 text-red-600 font-semibold">{run.events_p0}</td>
                    <td className="px-4 py-3 text-amber-600 font-semibold">{run.events_p1}</td>
                    <td className="px-4 py-3 text-blue-600 font-semibold">{run.events_p2}</td>
                    <td className="px-4 py-3">{run.completed ? '✅' : '❌'}</td>
                    <td className="px-4 py-3">
                      {run.drive_url
                        ? <a href={run.drive_url} target="_blank" rel="noreferrer"
                            className="text-indigo-600 hover:underline">Report →</a>
                        : '—'}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No runs yet — first run fires at 12:30 AM CT</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Open Friction Events */}
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-gray-900">Open Friction Events</h2>
            <div className="flex gap-2 ml-auto flex-wrap">
              {(['all','P0','P1','P2'] as SeverityFilter[]).map(s => (
                <button key={s} onClick={() => setSevFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-colors ${
                    sevFilter === s ? 'bg-[#1a1f36] text-white border-[#1a1f36]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>{s === 'all' ? 'All severity' : s}</button>
              ))}
              <div className="w-px bg-gray-200" />
              {(['all','open','fix_dispatched','resolved'] as StatusFilter[]).map(s => (
                <button key={s} onClick={() => setStatFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-colors ${
                    statFilter === s ? 'bg-[#1a1f36] text-white border-[#1a1f36]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>{s === 'all' ? 'All status' : s.replace('_',' ')}</button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {filteredLogs.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">
                No friction events matching filters.
              </div>
            )}
            {filteredLogs.map(log => (
              <div key={log.id} className="px-5 py-4">
                <div className="flex items-start gap-3 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 mt-0.5 ${SEV_COLORS[log.severity] ?? ''}`}>
                    {log.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-gray-700 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {log.step}{log.field ? ` / ${log.field}` : ''}
                      </span>
                      <span className="text-xs text-gray-400">{log.friction_type}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        log.status === 'resolved'       ? 'bg-green-100 text-green-700' :
                        log.status === 'fix_dispatched' ? 'bg-blue-100 text-blue-700' :
                                                          'bg-gray-100 text-gray-600'
                      }`}>{log.status.replace('_',' ')}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-1">{log.description}</p>
                    {log.suggested_fix && (
                      <p className="text-xs text-indigo-700 bg-indigo-50 rounded px-2 py-1">
                        💡 {log.suggested_fix}
                      </p>
                    )}
                  </div>
                  {log.status === 'open' && (
                    <button
                      onClick={() => markResolved(log.id)}
                      disabled={marking === log.id}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex-shrink-0"
                    >
                      {marking === log.id ? '…' : 'Mark Resolved'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
