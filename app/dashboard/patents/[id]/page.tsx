'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase, Patent, PatentDeadline, getDaysUntil, getUrgencyBadge } from '@/lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  provisional: 'bg-blue-100 text-blue-800',
  non_provisional: 'bg-purple-100 text-purple-800',
  published: 'bg-indigo-100 text-indigo-800',
  granted: 'bg-green-100 text-green-800',
  abandoned: 'bg-gray-100 text-gray-800',
}

export default function PatentDetail() {
  const [patent, setPatent] = useState<Patent | null>(null)
  const [deadlines, setDeadlines] = useState<PatentDeadline[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Patent>>({})
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('patents').select('*').eq('id', id).single(),
        supabase.from('patent_deadlines').select('*').eq('patent_id', id).order('due_date', { ascending: true })
      ])

      if (!p) { router.push('/dashboard/patents'); return }
      setPatent(p)
      setEditData(p)
      setDeadlines(d || [])
      setLoading(false)
    }
    load()
  }, [id, router])

  async function saveEdits() {
    if (!patent) return
    setSaving(true)
    const { data } = await supabase
      .from('patents')
      .update({ ...editData, updated_at: new Date().toISOString() })
      .eq('id', patent.id)
      .select()
      .single()
    if (data) { setPatent(data); setEditing(false) }
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading...</div></div>
  if (!patent) return null

  const deadline = patent.provisional_deadline
  const days = deadline ? getDaysUntil(deadline) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/dashboard/patents" className="hover:text-[#1a1f36]">Patents</Link>
          <span>/</span>
          <span className="text-[#1a1f36]">{patent.title}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">{patent.title}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[patent.status] || 'bg-gray-100 text-gray-800'}`}>
                {patent.status.replace('_', ' ')}
              </span>
              {days !== null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(days)}`}>
                  {days <= 0 ? 'DEADLINE OVERDUE' : `${days} days to deadline`}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => editing ? saveEdits() : setEditing(true)}
            disabled={saving}
            className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Edit Patent'}
          </button>
        </div>

        {/* Deadline Alert */}
        {days !== null && days <= 48 && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${days <= 30 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <span className="text-xl">{days <= 30 ? '🚨' : '⚠️'}</span>
            <div>
              <div className={`font-semibold ${days <= 30 ? 'text-red-800' : 'text-yellow-800'}`}>
                {days <= 0 ? 'DEADLINE OVERDUE' : `Non-provisional deadline in ${days} days`}
              </div>
              <div className={`text-sm ${days <= 30 ? 'text-red-600' : 'text-yellow-600'}`}>
                Due: {new Date(deadline! + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-[#1a1f36] mb-4">Patent Details</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Title', key: 'title', value: patent.title },
                  { label: 'Status', key: 'status', value: patent.status },
                  { label: 'Provisional Number', key: 'provisional_number', value: patent.provisional_number || '—' },
                  { label: 'Application Number', key: 'application_number', value: patent.application_number || '—' },
                  { label: 'Filing Date', key: 'filing_date', value: patent.filing_date ? new Date(patent.filing_date + 'T00:00:00').toLocaleDateString() : '—' },
                  { label: 'Provisional Deadline', key: 'provisional_deadline', value: patent.provisional_deadline ? new Date(patent.provisional_deadline + 'T00:00:00').toLocaleDateString() : '—' },
                  { label: 'Inventors', key: 'inventors', value: patent.inventors?.join(', ') || '—' },
                  { label: 'Tags', key: 'tags', value: patent.tags?.join(', ') || '—' },
                ].map((field) => (
                  <div key={field.key}>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{field.label}</div>
                    {editing && ['title', 'provisional_number', 'application_number', 'filing_date', 'provisional_deadline'].includes(field.key) ? (
                      <input
                        type={['filing_date', 'provisional_deadline'].includes(field.key) ? 'date' : 'text'}
                        value={(editData[field.key as keyof Patent] as string) || ''}
                        onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                      />
                    ) : (
                      <div className="text-sm text-[#1a1f36]">{field.value}</div>
                    )}
                  </div>
                ))}
              </div>

              {editing && (
                <div className="mt-4">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Status</div>
                  <select
                    value={editData.status || patent.status}
                    onChange={(e) => setEditData({ ...editData, status: e.target.value as Patent['status'] })}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                  >
                    {['provisional', 'non_provisional', 'published', 'granted', 'abandoned'].map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {patent.description && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold text-[#1a1f36] mb-3">Description</h2>
                {editing ? (
                  <textarea
                    value={(editData.description as string) || ''}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                  />
                ) : (
                  <p className="text-sm text-gray-600">{patent.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Sidebar: Deadlines */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-[#1a1f36] mb-4">Deadlines</h2>
              {deadlines.length === 0 ? (
                <p className="text-sm text-gray-400">No deadlines recorded.</p>
              ) : (
                <div className="space-y-3">
                  {deadlines.map((d) => {
                    const ddays = getDaysUntil(d.due_date)
                    return (
                      <div key={d.id} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium text-[#1a1f36] capitalize">{d.deadline_type.replace('_', ' ')}</div>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getUrgencyBadge(ddays)}`}>
                            {ddays <= 0 ? 'OVERDUE' : `${ddays}d`}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        {d.notes && <div className="text-xs text-gray-500 mt-1">{d.notes}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-[#1a1f36] mb-3">USPTO Status</h2>
              {patent.application_number ? (
                <div>
                  <div className="text-xs text-gray-400 mb-2">App #{patent.application_number}</div>
                  {patent.uspto_status ? (
                    <div className="text-sm text-[#1a1f36]">{patent.uspto_status}</div>
                  ) : (
                    <div className="text-sm text-gray-400">Status not yet checked</div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400">No application number on file. Add one to enable USPTO lookup.</div>
              )}
            </div>
          </div>
        </div>

        {editing && (
          <div className="mt-4 flex gap-3">
            <button onClick={saveEdits} disabled={saving} className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => { setEditing(false); setEditData(patent) }} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
