'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase, Patent, getDaysUntil, getUrgencyBadge } from '@/lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  provisional: 'bg-blue-100 text-blue-800',
  non_provisional: 'bg-purple-100 text-purple-800',
  published: 'bg-indigo-100 text-indigo-800',
  granted: 'bg-green-100 text-green-800',
  abandoned: 'bg-gray-100 text-gray-800',
}

export default function PatentsPage() {
  const [patents, setPatents] = useState<Patent[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('patents').select('*').order('provisional_deadline', { ascending: true })
      setPatents(data || [])
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading...</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1a1f36]">Patents</h1>
            <p className="text-gray-500 mt-1 text-sm">{patents.length} patent{patents.length !== 1 ? 's' : ''} in portfolio</p>
          </div>
          <Link href="/dashboard/patents/new" className="px-3 sm:px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors min-h-[44px] flex items-center">
            + Register
          </Link>
        </div>

        {patents.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="font-semibold text-[#1a1f36] mb-2">No patents yet</h3>
            <p className="text-gray-400 text-sm mb-6">Register your first patent to get started.</p>
            <Link href="/dashboard/patents/new" className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold min-h-[44px]">
              Register Patent
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Patent</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Filed</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Deadline</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Time Left</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {patents.map((p) => {
                    const deadline = p.provisional_deadline
                    const days = deadline ? getDaysUntil(deadline) : null
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-[#1a1f36] text-sm">{p.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{p.provisional_number || p.application_number || '—'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-800'}`}>
                            {p.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {p.filing_date ? new Date(p.filing_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {deadline ? new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          {days !== null ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(days)}`}>
                              {days <= 0 ? 'OVERDUE' : `${days} days`}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`/dashboard/patents/${p.id}`} className="text-sm text-[#1a1f36] hover:underline font-medium">
                            View →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {patents.map((p) => {
                const deadline = p.provisional_deadline
                const days = deadline ? getDaysUntil(deadline) : null
                return (
                  <Link key={p.id} href={`/dashboard/patents/${p.id}`}
                    className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-[#1a1f36]/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[#1a1f36] text-sm leading-snug">{p.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{p.provisional_number || p.application_number || 'No app #'}</div>
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-800'}`}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="text-xs text-gray-400">
                        {p.filing_date ? `Filed ${new Date(p.filing_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No filing date'}
                      </div>
                      {days !== null ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(days)}`}>
                          {days <= 0 ? 'OVERDUE' : `${days}d left`}
                        </span>
                      ) : null}
                    </div>
                    {deadline && (
                      <div className="text-xs text-gray-400 mt-1">
                        Deadline: {new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
