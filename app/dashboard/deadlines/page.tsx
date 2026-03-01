'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase, PatentDeadline, getDaysUntil, getUrgencyBadge } from '@/lib/supabase'

type DeadlineWithPatent = PatentDeadline & { patents: { title: string; id: string } }

export default function DeadlinesPage() {
  const [deadlines, setDeadlines] = useState<DeadlineWithPatent[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('patent_deadlines')
        .select('*, patents(title, id)')
        .order('due_date', { ascending: true })

      setDeadlines((data as DeadlineWithPatent[]) || [])
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading...</div></div>

  const urgent = deadlines.filter(d => getDaysUntil(d.due_date) <= 30 && d.status === 'pending')
  const warning = deadlines.filter(d => { const days = getDaysUntil(d.due_date); return days > 30 && days <= 90 && d.status === 'pending' })
  const safe = deadlines.filter(d => getDaysUntil(d.due_date) > 90 && d.status === 'pending')
  const done = deadlines.filter(d => d.status !== 'pending')

  function Section({ title, items }: { title: string; items: DeadlineWithPatent[] }) {
    if (items.length === 0) return null
    return (
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h2>
        <div className="space-y-3">
          {items.map((d) => {
            const days = getDaysUntil(d.due_date)
            return (
              <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Link href={`/dashboard/patents/${d.patents?.id}`} className="font-medium text-[#1a1f36] hover:underline text-sm">
                    {d.patents?.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                    <span className="text-xs text-gray-400 capitalize">{d.deadline_type.replace('_', ' ')}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      Due {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {d.notes && <div className="text-xs text-gray-400 mt-1">{d.notes}</div>}
                </div>
                <div className="flex-shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getUrgencyBadge(days)}`}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'TODAY' : `${days} days`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-[#1a1f36]">Deadlines</h1>
          <p className="text-gray-500 mt-1 text-sm">All upcoming patent deadlines — sorted by urgency</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-red-600">{urgent.length}</div>
            <div className="text-xs text-red-500 mt-1 font-medium">URGENT</div>
            <div className="text-xs text-red-400 hidden sm:block">≤30 days</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-yellow-600">{warning.length}</div>
            <div className="text-xs text-yellow-500 mt-1 font-medium">WARNING</div>
            <div className="text-xs text-yellow-400 hidden sm:block">≤90 days</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-green-600">{safe.length}</div>
            <div className="text-xs text-green-500 mt-1 font-medium">SAFE</div>
            <div className="text-xs text-green-400 hidden sm:block">&gt;90 days</div>
          </div>
        </div>

        {deadlines.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 sm:p-12 text-center">
            <div className="text-4xl mb-4">📅</div>
            <p className="text-gray-400 text-sm">No deadlines recorded yet. Register patents to track their deadlines.</p>
          </div>
        ) : (
          <>
            {urgent.length > 0 && <Section title="🚨 Urgent — Act Now" items={urgent} />}
            {warning.length > 0 && <Section title="⚠️ Warning — Plan Ahead" items={warning} />}
            {safe.length > 0 && <Section title="✅ Safe" items={safe} />}
            {done.length > 0 && <Section title="Completed / Missed" items={done} />}
          </>
        )}
      </div>
    </div>
  )
}
