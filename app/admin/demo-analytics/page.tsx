'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

const INTENT_COLORS: Record<string, string> = {
  filing: '#4f46e5', attorney: '#ef4444', pricing: '#f59e0b', inventor: '#22c55e',
  investor: '#06b6d4', technical: '#8b5cf6', objection: '#f97316', curiosity: '#64748b', unknown: '#94a3b8',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black text-[#1a1f36]">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3600000)
  if (h < 1) return `${Math.floor(d/60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

export default function DemoAnalyticsPage() {
  const router = useRouter()
  const [authToken, setAuthToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [data, setData] = useState<{
    stats: { totalSessions:number; avgMessages:number; gateShown:number; gateClicked:number; rateLimited:number; gateRate:number; convRate:number }
    byDay: Array<{date:string; count:number}>
    intentCounts: Record<string, number>
    recentSessions: Array<{session_id:string; messages:number; intent:string; started_at:string; gate_shown:boolean; converted:boolean; rate_limited:boolean}>
  } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? ''
        setAuthToken(token)
        load(token, days)
      })
    })
  }, [router])

  function load(token: string, d: number) {
    setLoading(true)
    fetch(`/api/admin/demo-analytics?days=${d}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setData).finally(() => setLoading(false))
  }

  const intentPie = data ? Object.entries(data.intentCounts).map(([name, value]) => ({ name, value })) : []

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
              <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link><span>/</span>
              <span className="text-[#1a1f36]">Demo Analytics</span>
            </div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">📊 Demo Analytics</h1>
          </div>
          <div className="flex gap-2">
            {[7, 30].map(d => (
              <button key={d} onClick={() => { setDays(d); load(authToken, d) }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${days === d ? 'bg-[#1a1f36] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label={`Sessions (${days}d)`} value={data?.stats.totalSessions ?? 0} />
          <StatCard label="Avg Msg/Session" value={data?.stats.avgMessages ?? 0} />
          <StatCard label="Gate Hit Rate" value={`${data?.stats.gateRate ?? 0}%`} sub={`${data?.stats.gateShown ?? 0} sessions`} />
          <StatCard label="Gate Conversion" value={`${data?.stats.convRate ?? 0}%`} sub={`${data?.stats.gateClicked ?? 0} clicks`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Sessions chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-[#1a1f36] mb-4">Sessions Over Time</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data?.byDay ?? []}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#4f46e5" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Intent breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-[#1a1f36] mb-4">Intent Breakdown</h2>
            {intentPie.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={intentPie} cx="50%" cy="50%" outerRadius={70} dataKey="value">
                      {intentPie.map((entry, i) => (
                        <Cell key={i} fill={INTENT_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {intentPie.sort((a,b) => b.value-a.value).slice(0,6).map(item => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: INTENT_COLORS[item.name] ?? '#94a3b8' }} />
                        <span className="text-gray-600 capitalize">{item.name}</span>
                      </div>
                      <span className="font-semibold text-gray-700">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-xs text-gray-400 py-8 text-center">No intent data yet</p>}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Recent Sessions</span>
          </div>
          {(data?.recentSessions ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-gray-400">No sessions yet. Sessions appear after first demo chat.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr className="text-xs text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Session</th>
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">Msgs</th>
                    <th className="px-4 py-3 text-left">Top Intent</th>
                    <th className="px-4 py-3 text-left">Gate</th>
                    <th className="px-4 py-3 text-left">Converted</th>
                    <th className="px-4 py-3 text-left">Rate Ltd</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(data?.recentSessions ?? []).map((s, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.session_id}…</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{relTime(s.started_at)}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-700">{s.messages}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: (INTENT_COLORS[s.intent] ?? '#94a3b8') + '22', color: INTENT_COLORS[s.intent] ?? '#64748b' }}>{s.intent}</span></td>
                      <td className="px-4 py-3 text-xs">{s.gate_shown ? '✅' : '—'}</td>
                      <td className="px-4 py-3 text-xs">{s.converted ? '✅' : '—'}</td>
                      <td className="px-4 py-3 text-xs">{s.rate_limited ? '⚠️' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
