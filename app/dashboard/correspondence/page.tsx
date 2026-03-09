'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import CorrespondenceForm from '@/components/CorrespondenceForm'
import {
  supabase, Patent, PatentCorrespondence,
  CORRESPONDENCE_TYPE_LABELS, CORRESPONDENCE_TYPE_COLORS
} from '@/lib/supabase'

export default function CorrespondencePage() {
  const [items, setItems] = useState<PatentCorrespondence[]>([])
  const [patents, setPatents] = useState<Patent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [filterPatent, setFilterPatent] = useState('')
  const [filterType, setFilterType] = useState('')
  const router = useRouter()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setOwnerId(user.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) setAuthToken(session.access_token)

    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('patent_correspondence')
        .select('*, patents(title, id)')
        .order('correspondence_date', { ascending: false }),
      supabase.from('patents').select('*').order('title')
    ])
    setItems((c as PatentCorrespondence[]) || [])
    setPatents(p || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [router])

  const filtered = items.filter(item => {
    if (filterPatent && item.patent_id !== filterPatent) return false
    if (filterType && item.type !== filterType) return false
    return true
  })

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1a1f36]">Correspondence</h1>
            <p className="text-gray-500 mt-1 text-sm">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex-shrink-0 px-3 sm:px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors min-h-[44px] flex items-center"
          >
            + Add
          </button>
        </div>

        {/* Add form modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-[#1a1f36]">Add Correspondence</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
              </div>
              <div className="p-5">
                <CorrespondenceForm
                  patents={patents}
                  ownerId={ownerId}
                  authToken={authToken}
                  onSuccess={() => { setShowForm(false); load() }}
                  onCancel={() => setShowForm(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col sm:flex-row gap-3">
          <select
            value={filterPatent}
            onChange={e => setFilterPatent(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] bg-white min-h-[44px]"
          >
            <option value="">All Patents</option>
            {patents.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] bg-white min-h-[44px]"
          >
            <option value="">All Types</option>
            {Object.entries(CORRESPONDENCE_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          {(filterPatent || filterType) && (
            <button
              onClick={() => { setFilterPatent(''); setFilterType('') }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg min-h-[44px]"
            >
              Clear
            </button>
          )}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-4">📬</div>
            <h3 className="font-semibold text-[#1a1f36] mb-2">No correspondence yet</h3>
            <p className="text-gray-400 text-sm mb-6">Track USPTO actions, emails, filings, and notes here.</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold min-h-[44px]"
            >
              Add First Record
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CORRESPONDENCE_TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-600'}`}>
                          {CORRESPONDENCE_TYPE_LABELS[item.type] || item.type}
                        </span>
                        {item.patents && (
                          <span className="text-xs text-gray-400 truncate max-w-[150px] sm:max-w-none">{(item.patents as { title: string }).title}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#1a1f36] text-sm leading-snug">{item.title}</span>
                        {Array.isArray(item.attachments) && item.attachments.length > 0 && (
                          <span className="text-xs text-blue-500" title={`${item.attachments.length} attachment`}>📎</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-400">
                        <span>{new Date(item.correspondence_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        {item.from_party && <span>From: {item.from_party}</span>}
                        {item.to_party && <span>To: {item.to_party}</span>}
                      </div>
                    </div>
                    <span className="text-gray-300 flex-shrink-0 text-lg">{expanded === item.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expanded === item.id && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    {item.content && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">{item.content}</div>
                    )}
                    {/* Attachments */}
                    {Array.isArray(item.attachments) && item.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(item.attachments as { name: string; size?: number; storage_path: string }[]).map((att, ai) => (
                          <a
                            key={ai}
                            href={`/api/correspondence/download?path=${encodeURIComponent(att.storage_path)}&token=${authToken}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            📎 {att.name}
                            {att.size && <span className="text-blue-400">({(att.size / 1024).toFixed(0)}KB)</span>}
                          </a>
                        ))}
                      </div>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {item.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{tag}</span>
                        ))}
                      </div>
                    )}
                    {item.patents && (
                      <div className="mt-3">
                        <Link
                          href={`/dashboard/patents/${(item.patents as { id: string }).id}`}
                          className="text-xs text-[#1a1f36] hover:underline font-medium"
                        >
                          View patent →
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
