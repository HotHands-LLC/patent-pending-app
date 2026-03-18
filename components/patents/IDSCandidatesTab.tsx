'use client'

/**
 * IDSCandidatesTab.tsx
 * IDS (Information Disclosure Statement) Candidates — review and triage prior art
 * found by autoresearch. Mark each as include / exclude / pending.
 * Generate a formatted IDS draft → saved to Correspondence.
 */

import { useState, useEffect, useCallback } from 'react'

interface IDSCandidate {
  id:                string
  application_number: string | null
  patent_number:     string | null
  title:             string
  inventor_names:    string[] | null
  filing_date:       string | null
  cpc_codes:         string[] | null
  status:            'pending' | 'include' | 'exclude'
  relevance_notes:   string | null
  added_by:          string
}

interface IDSCandidatesTabProps {
  patentId:  string
  authToken: string
  onToast:   (msg: string) => void
}

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-600',
  include: 'bg-green-100 text-green-700',
  exclude: 'bg-red-100  text-red-600',
}

const STATUS_LABELS = {
  pending: '⏳ Pending',
  include: '✅ Include',
  exclude: '❌ Exclude',
}

function CandidateCard({
  c,
  authToken,
  patentId,
  onUpdated,
}: {
  c:         IDSCandidate
  authToken: string
  patentId:  string
  onUpdated: () => void
}) {
  const [notes, setNotes]       = useState(c.relevance_notes ?? '')
  const [editNotes, setEditNotes] = useState(false)
  const [saving, setSaving]     = useState(false)

  const setStatus = async (status: 'pending' | 'include' | 'exclude') => {
    setSaving(true)
    await fetch(`/api/patents/${patentId}/ids-candidates/${c.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body:    JSON.stringify({ status }),
    })
    setSaving(false)
    onUpdated()
  }

  const saveNotes = async () => {
    setSaving(true)
    await fetch(`/api/patents/${patentId}/ids-candidates/${c.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body:    JSON.stringify({ relevance_notes: notes }),
    })
    setSaving(false)
    setEditNotes(false)
    onUpdated()
  }

  const remove = async () => {
    if (!confirm('Remove this candidate?')) return
    await fetch(`/api/patents/${patentId}/ids-candidates/${c.id}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    })
    onUpdated()
  }

  const refNum = c.application_number ?? c.patent_number ?? '—'
  const date   = c.filing_date
    ? new Date(c.filing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className={`rounded-xl border p-4 space-y-2.5 ${c.status === 'exclude' ? 'opacity-60' : ''}`}
      style={{ borderColor: c.status === 'include' ? '#86efac' : c.status === 'exclude' ? '#fca5a5' : '#e5e7eb' }}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{c.title}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-gray-500 font-mono">{refNum}</span>
            {c.inventor_names && c.inventor_names.length > 0 && (
              <span className="text-xs text-gray-400">{c.inventor_names.join(', ')}</span>
            )}
            {date && <span className="text-xs text-gray-400">{date}</span>}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_STYLES[c.status]}`}>
              {STATUS_LABELS[c.status]}
            </span>
            {c.added_by === 'autoresearch' && (
              <span className="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">Auto</span>
            )}
          </div>
        </div>
        <button onClick={remove} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5" title="Remove">
          ×
        </button>
      </div>

      {/* Relevance notes */}
      {editNotes ? (
        <div className="space-y-1.5">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Why is this reference relevant to your patent?"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={saveNotes} disabled={saving}
              className="text-xs px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : 'Save Notes'}
            </button>
            <button onClick={() => setEditNotes(false)}
              className="text-xs px-3 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {c.relevance_notes ? (
            <p className="text-xs text-gray-600 italic">&ldquo;{c.relevance_notes}&rdquo;</p>
          ) : null}
          <button onClick={() => setEditNotes(true)}
            className="text-xs text-indigo-500 hover:text-indigo-700 underline transition-colors mt-0.5">
            {c.relevance_notes ? 'Edit notes' : '+ Add relevance note'}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setStatus('include')}
          disabled={saving || c.status === 'include'}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            c.status === 'include'
              ? 'bg-green-600 text-white'
              : 'border border-green-300 text-green-700 hover:bg-green-50'
          } disabled:opacity-60`}
        >
          ✅ Include
        </button>
        <button
          onClick={() => setStatus('exclude')}
          disabled={saving || c.status === 'exclude'}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            c.status === 'exclude'
              ? 'bg-red-500 text-white'
              : 'border border-red-200 text-red-600 hover:bg-red-50'
          } disabled:opacity-60`}
        >
          ❌ Exclude
        </button>
        {c.status !== 'pending' && (
          <button
            onClick={() => setStatus('pending')}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

export default function IDSCandidatesTab({ patentId, authToken, onToast }: IDSCandidatesTabProps) {
  const [candidates, setCandidates] = useState<IDSCandidate[]>([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/patents/${patentId}/ids-candidates`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      const d = await res.json()
      setCandidates(d.candidates ?? [])
    } catch { /* non-fatal */ }
    setLoading(false)
  }, [patentId, authToken])

  useEffect(() => { load() }, [load])

  const generateDraft = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/patents/${patentId}/ids-candidates/generate-draft`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const d = await res.json()
      if (res.ok) {
        onToast(`✅ IDS draft saved to Correspondence (${d.candidate_count} references)`)
      } else {
        onToast(`⚠️ ${d.error ?? 'Generate failed'}`)
      }
    } catch {
      onToast('⚠️ Failed to generate IDS draft')
    }
    setGenerating(false)
  }

  const includeCount = candidates.filter(c => c.status === 'include').length
  const pendingCount = candidates.filter(c => c.status === 'pending').length

  if (loading) {
    return <div className="py-12 text-center text-gray-400 text-sm">Loading candidates…</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">IDS Candidates</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Prior art identified by autoresearch. Mark each as Include or Exclude, then generate your IDS draft.
          </p>
        </div>
        {includeCount > 0 && (
          <button
            onClick={generateDraft}
            disabled={generating}
            className="flex-shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {generating ? 'Generating…' : `Generate IDS Draft → (${includeCount})`}
          </button>
        )}
      </div>

      {/* Notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed">
        <strong>Note:</strong> PTO/SB/08 is an XFA form — it cannot be auto-filled by software.
        The generated draft is formatted plain text for manual entry into USPTO Patent Center.
        <a href="https://www.uspto.gov/patents/apply/forms-patent-applications-filed-on-or-after-september-16-2012" target="_blank" rel="noreferrer" className="underline ml-1 hover:text-amber-900">
          Official IDS form →
        </a>
      </div>

      {/* Candidates */}
      {candidates.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-10 text-center">
          <p className="text-3xl mb-3">🔍</p>
          <p className="text-sm font-medium text-gray-500 mb-1">No IDS candidates yet</p>
          <p className="text-xs text-gray-400">
            Run autoresearch from the admin panel to identify prior art, or add candidates manually.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingCount > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⏳ {pendingCount} candidate{pendingCount !== 1 ? 's' : ''} pending review — mark each as Include or Exclude before generating the IDS draft.
            </p>
          )}
          {candidates.map(c => (
            <CandidateCard
              key={c.id}
              c={c}
              authToken={authToken}
              patentId={patentId}
              onUpdated={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}
