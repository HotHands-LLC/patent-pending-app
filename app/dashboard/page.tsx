'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase, Patent, PatentDeadline, getDaysUntil, getUrgencyBadge } from '@/lib/supabase'

export default function Dashboard() {
  const [patents, setPatents] = useState<Patent[]>([])
  const [deadlines, setDeadlines] = useState<(PatentDeadline & { patents: { title: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('patents').select('*').order('provisional_deadline', { ascending: true }),
        supabase.from('patent_deadlines')
          .select('*, patents(title)')
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(5)
      ])

      setPatents(p || [])
      setDeadlines((d as (PatentDeadline & { patents: { title: string } })[]) || [])
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    )
  }

  const urgentCount = deadlines.filter(d => getDaysUntil(d.due_date) <= 30).length
  const warningCount = deadlines.filter(d => { const days = getDaysUntil(d.due_date); return days > 30 && days <= 90 }).length

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1f36]">Dashboard</h1>
          <p className="text-gray-500 mt-1">Hot Hands LLC Patent Portfolio</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Patents', value: patents.length, color: 'text-[#1a1f36]' },
            { label: 'Urgent Deadlines', value: urgentCount, color: urgentCount > 0 ? 'text-red-600' : 'text-green-600' },
            { label: 'Warning Deadlines', value: warningCount, color: warningCount > 0 ? 'text-yellow-600' : 'text-green-600' },
            { label: 'Granted', value: patents.filter(p => p.status === 'granted').length, color: 'text-green-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Urgent Alert Banner */}
        {urgentCount > 0 && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <span className="text-red-500 text-xl">🚨</span>
            <div>
              <span className="font-semibold text-red-800">
                {urgentCount} deadline{urgentCount > 1 ? 's' : ''} within 30 days — action required
              </span>
              <span className="text-red-600 text-sm block">File non-provisional applications before deadlines to preserve patent rights.</span>
            </div>
            <Link href="/dashboard/deadlines" className="ml-auto px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
              View Deadlines
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Deadlines */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#1a1f36]">Upcoming Deadlines</h2>
              <Link href="/dashboard/deadlines" className="text-sm text-[#1a1f36]/60 hover:text-[#1a1f36]">View all →</Link>
            </div>
            {deadlines.length === 0 ? (
              <p className="text-gray-400 text-sm">No pending deadlines.</p>
            ) : (
              <div className="space-y-3">
                {deadlines.map((d) => {
                  const days = getDaysUntil(d.due_date)
                  return (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-[#1a1f36]">{d.patents?.title}</div>
                        <div className="text-xs text-gray-400">{d.deadline_type.replace('_', ' ')} · Due {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(days)}`}>
                        {days <= 0 ? 'OVERDUE' : `${days}d`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Patents List */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#1a1f36]">Patents</h2>
              <Link href="/dashboard/patents" className="text-sm text-[#1a1f36]/60 hover:text-[#1a1f36]">View all →</Link>
            </div>
            {patents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-4">No patents registered yet.</p>
                <Link href="/dashboard/patents/new" className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium">
                  Register First Patent
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {patents.map((p) => {
                  const deadline = p.provisional_deadline
                  const days = deadline ? getDaysUntil(deadline) : null
                  return (
                    <Link key={p.id} href={`/dashboard/patents/${p.id}`}
                      className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors">
                      <div>
                        <div className="text-sm font-medium text-[#1a1f36]">{p.title}</div>
                        <div className="text-xs text-gray-400 capitalize">{p.status.replace('_', ' ')} · {p.provisional_number || 'No app #'}</div>
                      </div>
                      {days !== null && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(days)}`}>
                          {days <= 0 ? 'OVERDUE' : `${days}d`}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: '/dashboard/patents/new', icon: '➕', label: 'Register Patent' },
            { href: '/dashboard/deadlines', icon: '📅', label: 'View Deadlines' },
            { href: '/dashboard/patents', icon: '📋', label: 'All Patents' },
            { href: '/dashboard/patents', icon: '🔍', label: 'Check USPTO Status' },
          ].map((a) => (
            <Link key={a.label} href={a.href}
              className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-[#1a1f36]/30 transition-colors text-center">
              <span className="text-2xl">{a.icon}</span>
              <span className="text-xs font-medium text-[#1a1f36]">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
