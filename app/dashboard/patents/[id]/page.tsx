'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import CorrespondenceForm from '@/components/CorrespondenceForm'
import {
  supabase, Patent, PatentDeadline, PatentCorrespondence,
  getDaysUntil, getUrgencyBadge,
  CORRESPONDENCE_TYPE_LABELS, CORRESPONDENCE_TYPE_COLORS
} from '@/lib/supabase'

const STATUS_COLORS: Record<string, string> = {
  provisional: 'bg-blue-100 text-blue-800',
  non_provisional: 'bg-purple-100 text-purple-800',
  published: 'bg-indigo-100 text-indigo-800',
  granted: 'bg-green-100 text-green-800',
  abandoned: 'bg-gray-100 text-gray-800',
}

type Tab = 'details' | 'claims' | 'correspondence'

export default function PatentDetail() {
  const [patent, setPatent] = useState<Patent | null>(null)
  const [deadlines, setDeadlines] = useState<PatentDeadline[]>([])
  const [correspondence, setCorrespondence] = useState<PatentCorrespondence[]>([])
  const [allPatents, setAllPatents] = useState<Patent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Patent>>({})
  const [tab, setTab] = useState<Tab>('details')
  const [claimsAction, setClaimsAction] = useState<'idle' | 'approving' | 'requesting'>('idle')
  const [revisionNote, setRevisionNote] = useState('')
  const [claimsMsg, setClaimsMsg] = useState('')
  const [showCorrespondenceForm, setShowCorrespondenceForm] = useState(false)
  const [expandedCorr, setExpandedCorr] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState('')
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setOwnerId(user.id)

    const [{ data: p }, { data: d }, { data: c }, { data: ap }] = await Promise.all([
      supabase.from('patents').select('*').eq('id', id).single(),
      supabase.from('patent_deadlines').select('*').eq('patent_id', id).order('due_date', { ascending: true }),
      supabase.from('patent_correspondence').select('*').eq('patent_id', id).order('correspondence_date', { ascending: false }),
      supabase.from('patents').select('*').order('title'),
    ])

    if (!p) { router.push('/dashboard/patents'); return }
    setPatent(p)
    setEditData(p)
    setDeadlines(d || [])
    setCorrespondence((c as PatentCorrespondence[]) || [])
    setAllPatents(ap || [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [id, router])

  async function approveClaims() {
    if (!patent) return
    setClaimsAction('approving')
    setClaimsMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(`/api/patents/${patent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ filing_status: 'approved' }),
    })
    const json = await res.json()
    if (res.ok) {
      setPatent({ ...patent, filing_status: 'approved' })
      setClaimsMsg('Claims approved. Ready for filing assembly.')
    } else {
      setClaimsMsg(`Error: ${json.error}`)
    }
    setClaimsAction('idle')
  }

  async function requestRevision() {
    if (!patent || !revisionNote.trim()) return
    setClaimsAction('requesting')
    setClaimsMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    // Create a review_queue entry for the revision request
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        patent_id: patent.id,
        draft_type: 'claims_revision',
        title: `Claims Revision Request — ${patent.title}`,
        content: revisionNote.trim(),
        version: 1,
      }),
    })
    const json = await res.json()
    if (res.ok) {
      setRevisionNote('')
      setClaimsMsg('Revision request submitted. It will appear in the review queue.')
    } else {
      setClaimsMsg(`Error: ${json.error || 'Failed to submit'}`)
    }
    setClaimsAction('idle')
  }

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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 sm:mb-6">
          <Link href="/dashboard/patents" className="hover:text-[#1a1f36]">Patents</Link>
          <span>/</span>
          <span className="text-[#1a1f36] truncate">{patent.title}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-[#1a1f36] leading-snug">{patent.title}</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
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
          {tab === 'details' && (
            <button
              onClick={() => editing ? saveEdits() : setEditing(true)}
              disabled={saving}
              className="flex-shrink-0 px-3 sm:px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Saving...' : editing ? 'Save' : 'Edit'}
            </button>
          )}
        </div>

        {/* Deadline Alert */}
        {days !== null && days <= 48 && (
          <div className={`mb-5 p-4 rounded-xl border flex items-start gap-3 ${days <= 30 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <span className="text-xl flex-shrink-0">{days <= 30 ? '🚨' : '⚠️'}</span>
            <div>
              <div className={`font-semibold text-sm ${days <= 30 ? 'text-red-800' : 'text-yellow-800'}`}>
                {days <= 0 ? 'DEADLINE OVERDUE' : `Non-provisional deadline in ${days} days`}
              </div>
              <div className={`text-xs mt-0.5 ${days <= 30 ? 'text-red-600' : 'text-yellow-600'}`}>
                Due: {new Date(deadline! + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-full sm:w-auto sm:inline-flex">
          {(['details', 'claims', 'correspondence'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize min-h-[40px] ${
                tab === t ? 'bg-white text-[#1a1f36] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'correspondence' ? `Correspondence (${correspondence.length})` :
               t === 'claims' ? (
                 <span className="flex items-center gap-1.5">
                   Claims
                   {patent.filing_status === 'approved' && <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />}
                   {patent.filing_status === 'draft' && patent.claims_draft && <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />}
                 </span>
               ) : 'Details'}
            </button>
          ))}
        </div>

        {/* Details Tab */}
        {tab === 'details' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
                <h2 className="font-semibold text-[#1a1f36] mb-4">Patent Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px]"
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
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px] bg-white"
                    >
                      {['provisional', 'non_provisional', 'published', 'granted', 'abandoned'].map(s => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {patent.description && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
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
                          <div className="flex items-center justify-between gap-2">
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
                  <div className="text-sm text-gray-400">No application number on file.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Claims Tab */}
        {tab === 'claims' && (
          <div>
            {/* Status banner */}
            {patent.filing_status === 'approved' && (
              <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                <span className="text-xl">✅</span>
                <div>
                  <div className="font-semibold text-green-800 text-sm">Claims approved</div>
                  <div className="text-xs text-green-600 mt-0.5">Ready for drawing generation and filing assembly (Phases 4–6).</div>
                </div>
              </div>
            )}
            {patent.filing_status === 'filed' && (
              <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                <span className="text-xl">📬</span>
                <div>
                  <div className="font-semibold text-blue-800 text-sm">Filed with USPTO</div>
                  <div className="text-xs text-blue-600 mt-0.5">Claims are part of the filed application.</div>
                </div>
              </div>
            )}

            {!patent.claims_draft ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <div className="text-3xl mb-3">⏳</div>
                <p className="text-gray-500 text-sm font-medium mb-1">No claims draft yet</p>
                <p className="text-gray-400 text-xs">Complete payment through the intake flow to generate your claims draft.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Claims text */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">AI-Generated Claims Draft</span>
                      {patent.filing_status && (
                        <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          patent.filing_status === 'approved' ? 'bg-green-100 text-green-700' :
                          patent.filing_status === 'filed' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {patent.filing_status}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{patent.claims_draft.length.toLocaleString()} chars</span>
                  </div>
                  <pre className="px-5 py-4 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-[500px] overflow-y-auto">
                    {patent.claims_draft}
                  </pre>
                </div>

                {/* Action bar — only show if not approved/filed */}
                {patent.filing_status === 'draft' && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <h3 className="font-semibold text-[#1a1f36] text-sm">Review this draft</h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={approveClaims}
                        disabled={claimsAction !== 'idle'}
                        className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors min-h-[44px]"
                      >
                        {claimsAction === 'approving' ? 'Approving…' : '✓ Approve Claims'}
                      </button>
                      <button
                        onClick={() => setClaimsAction(claimsAction === 'requesting' ? 'idle' : 'requesting')}
                        disabled={claimsAction === 'approving'}
                        className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
                      >
                        ↩ Request Revision
                      </button>
                    </div>

                    {claimsAction === 'requesting' && (
                      <div className="space-y-3">
                        <textarea
                          value={revisionNote}
                          onChange={(e) => setRevisionNote(e.target.value)}
                          placeholder="Describe what needs to change — e.g. 'Claim 1 is too narrow, should cover wireless mesh topologies not just QR codes' or 'Add a method claim for the server-side recording component'"
                          rows={4}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] resize-none"
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={requestRevision}
                            disabled={!revisionNote.trim()}
                            className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-40 min-h-[44px]"
                          >
                            Submit Revision Request
                          </button>
                          <button
                            onClick={() => { setClaimsAction('idle'); setRevisionNote('') }}
                            className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 min-h-[44px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {claimsMsg && (
                      <div className={`p-3 rounded-lg text-sm ${claimsMsg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                        {claimsMsg}
                      </div>
                    )}
                  </div>
                )}

                {/* Re-approval option if already approved */}
                {patent.filing_status === 'approved' && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setClaimsAction('requesting')}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Request changes
                    </button>
                  </div>
                )}
                {patent.filing_status === 'approved' && claimsAction === 'requesting' && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                    <h3 className="font-semibold text-[#1a1f36] text-sm">Request changes to approved claims</h3>
                    <textarea
                      value={revisionNote}
                      onChange={(e) => setRevisionNote(e.target.value)}
                      placeholder="Describe the changes needed…"
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] resize-none"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={requestRevision}
                        disabled={!revisionNote.trim()}
                        className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-40 min-h-[44px]"
                      >
                        Submit
                      </button>
                      <button onClick={() => { setClaimsAction('idle'); setRevisionNote('') }}
                        className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 min-h-[44px]">
                        Cancel
                      </button>
                    </div>
                    {claimsMsg && <div className="p-3 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200">{claimsMsg}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Correspondence Tab */}
        {tab === 'correspondence' && (
          <div>
            {/* Add form modal */}
            {showCorrespondenceForm && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-[#1a1f36]">Add Correspondence</h2>
                    <button onClick={() => setShowCorrespondenceForm(false)} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
                  </div>
                  <div className="p-5">
                    <CorrespondenceForm
                      patents={allPatents}
                      preselectedPatentId={patent.id}
                      ownerId={ownerId}
                      onSuccess={() => { setShowCorrespondenceForm(false); loadAll() }}
                      onCancel={() => setShowCorrespondenceForm(false)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{correspondence.length} record{correspondence.length !== 1 ? 's' : ''} for this patent</p>
              <button
                onClick={() => setShowCorrespondenceForm(true)}
                className="px-3 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors min-h-[44px] flex items-center"
              >
                + Add
              </button>
            </div>

            {correspondence.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <div className="text-3xl mb-3">📬</div>
                <p className="text-gray-400 text-sm mb-4">No correspondence for this patent yet.</p>
                <button
                  onClick={() => setShowCorrespondenceForm(true)}
                  className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold min-h-[44px]"
                >
                  Add Record
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {correspondence.map(item => (
                  <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setExpandedCorr(expandedCorr === item.id ? null : item.id)}
                      className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CORRESPONDENCE_TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-600'}`}>
                              {CORRESPONDENCE_TYPE_LABELS[item.type] || item.type}
                            </span>
                          </div>
                          <div className="font-medium text-[#1a1f36] text-sm">{item.title}</div>
                          <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-400">
                            <span>{new Date(item.correspondence_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            {item.from_party && <span>From: {item.from_party}</span>}
                            {item.to_party && <span>To: {item.to_party}</span>}
                          </div>
                        </div>
                        <span className="text-gray-300 flex-shrink-0 text-lg">{expandedCorr === item.id ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {expandedCorr === item.id && (
                      <div className="px-4 pb-4 border-t border-gray-50">
                        {item.content && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">{item.content}</div>
                        )}
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {item.tags.map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Save/cancel when editing details */}
        {tab === 'details' && editing && (
          <div className="mt-4 flex gap-3">
            <button onClick={saveEdits} disabled={saving} className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] disabled:opacity-50 min-h-[44px]">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => { setEditing(false); setEditData(patent) }} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
