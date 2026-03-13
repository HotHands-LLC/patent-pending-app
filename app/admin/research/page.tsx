'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ResearchRun {
  id: string
  query: string
  run_type: 'keyword' | 'patent_number' | 'category'
  status: 'pending' | 'running' | 'complete' | 'failed'
  summary: string | null
  candidates: PatentCandidate[] | null
  created_at: string
  completed_at: string | null
}

interface PatentCandidate {
  patent_number: string
  title: string
  filing_date: string | null
  assignee: string | null
  abandonment_reason: string | null
  forward_citation_count: number | null
  technology_relevance: number
  acquisition_interest: number
  rationale: string
  risk_flags: string[]
  final_recommendation: 'worth acquiring' | 'investigate further' | 'noise'
}

// ── Constants ─────────────────────────────────────────────────────────────────
const RUN_TYPE_LABELS: Record<string, string> = {
  keyword:        'Keyword',
  patent_number:  'Patent #',
  category:       'Category',
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  pending:  { cls: 'bg-gray-100 text-gray-500',                      label: 'Queued' },
  running:  { cls: 'bg-yellow-100 text-yellow-800',                  label: 'Running' },
  complete: { cls: 'bg-green-100 text-green-800',                    label: 'Complete' },
  failed:   { cls: 'bg-red-100 text-red-800',                        label: 'Failed' },
}

const RECO_BADGE: Record<string, { cls: string; icon: string }> = {
  'worth acquiring':    { cls: 'bg-green-100 text-green-800 border border-green-200',   icon: '🟢' },
  'investigate further':{ cls: 'bg-yellow-100 text-yellow-800 border border-yellow-200', icon: '🟡' },
  'noise':              { cls: 'bg-gray-100 text-gray-500 border border-gray-200',      icon: '⚪' },
}

const RUN_PLACEHOLDERS: Record<string, string> = {
  keyword:       'e.g. "light-based communication" or "haptic feedback wearable"',
  patent_number: 'e.g. US9876543B2',
  category:      'e.g. "free-space optical communications"',
}

// ── Import stub modal ─────────────────────────────────────────────────────────
function ImportModal({
  candidate,
  onClose,
}: {
  candidate: PatentCandidate
  onClose: () => void
}) {
  console.log('[research] Import intent:', candidate.patent_number, candidate.title)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="text-3xl mb-3 text-center">📥</div>
        <h2 className="text-lg font-bold text-gray-900 text-center mb-2">Import Patent Record</h2>
        <p className="text-sm text-gray-600 text-center mb-1">
          <span className="font-mono font-bold text-indigo-600">{candidate.patent_number}</span>
        </p>
        <p className="text-xs text-gray-500 text-center mb-5 leading-relaxed">{candidate.title}</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs text-amber-800 font-semibold mb-1">🚧 Coming in next sprint</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Full import will pre-populate a new patent record from USPTO/Google Patents data —
            title, inventors, filing date, abstract, and assignee. Available after sprint 9A.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <a
            href={`https://patents.google.com/patent/${candidate.patent_number}/en`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold text-center hover:bg-indigo-700 transition-colors"
          >
            View on Google Patents →
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Candidates table ──────────────────────────────────────────────────────────
function CandidatesTable({ candidates }: { candidates: PatentCandidate[] }) {
  const [importTarget, setImportTarget] = useState<PatentCandidate | null>(null)

  const ORDER: Record<PatentCandidate['final_recommendation'], number> = {
    'worth acquiring': 0, 'investigate further': 1, 'noise': 2
  }
  const sorted = [...candidates].sort((a, b) => ORDER[a.final_recommendation] - ORDER[b.final_recommendation])

  return (
    <>
      {importTarget && (
        <ImportModal candidate={importTarget} onClose={() => setImportTarget(null)} />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              {['Patent #', 'Title', 'Assignee', 'Rec', 'Risk Flags', ''].map(h => (
                <th key={h} className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => {
              const reco = RECO_BADGE[c.final_recommendation] ?? RECO_BADGE['noise']
              return (
                <tr key={c.patent_number} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  {/* Patent # */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <a
                      href={`https://patents.google.com/patent/${c.patent_number}/en`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-indigo-600 hover:underline"
                    >
                      {c.patent_number}
                    </a>
                    <div className="text-gray-400 mt-0.5">{c.filing_date ?? '—'}</div>
                  </td>
                  {/* Title */}
                  <td className="px-3 py-3 max-w-xs">
                    <div className="font-medium text-gray-900 leading-snug line-clamp-2">{c.title}</div>
                    <div className="text-gray-400 mt-0.5 italic line-clamp-1">"{c.rationale}"</div>
                  </td>
                  {/* Assignee */}
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                    {c.assignee ?? '—'}
                    {c.forward_citation_count != null && (
                      <div className="text-gray-400">{c.forward_citation_count} citations</div>
                    )}
                  </td>
                  {/* Rec */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${reco.cls}`}>
                      {reco.icon} {c.final_recommendation}
                    </span>
                    <div className="flex gap-3 mt-1.5">
                      <div className="text-gray-400">Rel: <span className="font-semibold text-gray-700">{c.technology_relevance}/10</span></div>
                      <div className="text-gray-400">Acq: <span className="font-semibold text-gray-700">{c.acquisition_interest}/10</span></div>
                    </div>
                  </td>
                  {/* Risk flags */}
                  <td className="px-3 py-3 max-w-xs">
                    {c.risk_flags.length > 0 ? (
                      <ul className="space-y-0.5">
                        {c.risk_flags.slice(0, 2).map((f, i) => (
                          <li key={i} className="text-red-600 line-clamp-1">⚠ {f}</li>
                        ))}
                        {c.risk_flags.length > 2 && (
                          <li className="text-gray-400">+{c.risk_flags.length - 2} more</li>
                        )}
                      </ul>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  {/* Import */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <button
                      onClick={() => setImportTarget(c)}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors"
                    >
                      Import ↓
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Run detail panel ──────────────────────────────────────────────────────────
function RunDetail({ run, onClose }: { run: ResearchRun; onClose: () => void }) {
  const candidates = run.candidates ?? []
  const worthCount  = candidates.filter(c => c.final_recommendation === 'worth acquiring').length
  const investCount = candidates.filter(c => c.final_recommendation === 'investigate further').length
  const noiseCount  = candidates.filter(c => c.final_recommendation === 'noise').length
  const elapsed = run.completed_at
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()) / 1000)
    : null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-5xl my-6">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[run.status].cls}`}>
                {STATUS_BADGE[run.status].label}
              </span>
              <span className="text-xs text-gray-400">{RUN_TYPE_LABELS[run.run_type]}</span>
              {elapsed && <span className="text-xs text-gray-400">{elapsed}s</span>}
            </div>
            <h2 className="font-bold text-gray-900 mt-0.5">"{run.query || 'Untitled Run'}"</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats strip */}
          {candidates.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Worth Acquiring', count: worthCount, color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
                { label: 'Investigate',     count: investCount, color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-100' },
                { label: 'Noise',           count: noiseCount,  color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-100' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} border rounded-xl px-4 py-3 text-center`}>
                  <div className={`text-2xl font-extrabold ${s.color}`}>{s.count}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {run.summary && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Gemini Analysis</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{run.summary}</p>
            </div>
          )}

          {/* Candidates table */}
          {candidates.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Candidates ({candidates.length})
                </h3>
                <span className="text-xs text-gray-400">
                  Import button opens pre-fill preview (full import in sprint 9A)
                </span>
              </div>
              <CandidatesTable candidates={candidates} />
            </div>
          ) : run.status === 'running' || run.status === 'pending' ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
              <div className="text-4xl mb-3">⚙️</div>
              <p className="text-sm font-medium animate-pulse">Gemini is researching — refreshing every 5 seconds…</p>
            </div>
          ) : run.status === 'failed' ? (
            <div className="text-center py-12 bg-red-50 rounded-xl border border-red-100">
              <p className="text-sm text-red-600 font-medium">Research run failed.</p>
              {run.summary && <p className="text-xs text-red-500 mt-2 max-w-md mx-auto">{run.summary}</p>}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminResearchPage() {
  const router = useRouter()
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [runs, setRuns] = useState<ResearchRun[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedRun, setSelectedRun] = useState<ResearchRun | null>(null)

  // Form state
  const [query, setQuery]     = useState('')
  const [runType, setRunType] = useState<'keyword' | 'patent_number' | 'category'>('keyword')
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [runningMsg, setRunningMsg]   = useState('')

  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setAuthToken(session.access_token)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/login')
      else setAuthToken(session.access_token)
    })
    return () => subscription.unsubscribe()
  }, [router])

  // ── Load run list ───────────────────────────────────────────────────────────
  const loadRuns = useCallback(async (token: string) => {
    const res = await fetch('/api/research/runs', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.status === 403) { router.replace('/dashboard'); return }
    if (!res.ok) return
    const data: ResearchRun[] = await res.json()
    setRuns(data)
    setLoading(false)
    return data
  }, [router])

  useEffect(() => {
    if (authToken) loadRuns(authToken)
  }, [authToken, loadRuns])

  // ── Poll individual active run via status route ─────────────────────────────
  const pollRun = useCallback((runId: string, token: string) => {
    if (pollTimers.current.has(runId)) return  // already polling

    const timer = setInterval(async () => {
      const res = await fetch(`/api/research/status/${runId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return

      const updated = await res.json() as ResearchRun
      setRuns(prev => prev.map(r => r.id === runId ? { ...r, ...updated } : r))

      // Update selected run if open
      setSelectedRun(prev => prev?.id === runId ? { ...prev, ...updated } : prev)

      if (updated.status === 'complete' || updated.status === 'failed') {
        clearInterval(timer)
        pollTimers.current.delete(runId)
        // Reload full run list to sync summary
        loadRuns(token)
      }
    }, 5000)

    pollTimers.current.set(runId, timer)
  }, [loadRuns])

  // Start polling for any active runs on load
  useEffect(() => {
    if (!authToken) return
    for (const run of runs) {
      if (run.status === 'pending' || run.status === 'running') {
        pollRun(run.id, authToken)
      }
    }
  }, [runs.length, authToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of pollTimers.current.values()) clearInterval(timer)
    }
  }, [])

  // ── Submit new run ──────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || !authToken) return
    setSubmitting(true)
    setSubmitError('')
    setRunningMsg('')
    try {
      const res = await fetch('/api/research/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ query: query.trim(), run_type: runType }),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitError(data.error ?? 'Failed to start run'); return }

      setRunningMsg('Research running… this takes ~60 seconds')
      setQuery('')

      // Fetch new run and prepend to list, start polling
      const runRes = await fetch(`/api/research/status/${data.run_id}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      if (runRes.ok) {
        const newRun: ResearchRun = await runRes.json()
        setRuns(prev => [newRun, ...prev])
        setSelectedRun(newRun)
        pollRun(newRun.id, authToken)
      }
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Open run detail ─────────────────────────────────────────────────────────
  async function openRun(run: ResearchRun) {
    if (!authToken) return
    const res = await fetch(`/api/research/status/${run.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
    setSelectedRun(res.ok ? await res.json() : run)
    if (run.status === 'pending' || run.status === 'running') pollRun(run.id, authToken)
  }

  if (!authToken || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Loading research tool…</p>
      </div>
    )
  }

  const activeCount = runs.filter(r => r.status === 'pending' || r.status === 'running').length

  return (
    <>
      {selectedRun && (
        <RunDetail run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}

      <div className="min-h-screen bg-gray-50">
        {/* Nav */}
        <div className="bg-[#1a1f36] text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg">⚖️ PatentPending</span>
              <span className="text-gray-400 text-xs">›</span>
              <span className="text-sm font-semibold">Patent Research</span>
              <span className="text-xs bg-red-700 text-red-100 px-2 py-0.5 rounded-full font-bold ml-1">ADMIN</span>
            </div>
            {activeCount > 0 && (
              <span className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-full animate-pulse">
                {activeCount} run{activeCount !== 1 ? 's' : ''} in progress…
              </span>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

          {/* ── New Run Form ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">New Research Run</h2>
            <p className="text-xs text-gray-400 mb-5">
              Gemini 2.5 Pro scans USPTO records for abandoned/lapsed patents worth acquiring.
              Two-phase loop: broad sweep + adversarial risk analysis. Runs in ~60 seconds.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-3">
                <select
                  value={runType}
                  onChange={e => setRunType(e.target.value as typeof runType)}
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 shrink-0"
                >
                  <option value="keyword">Keyword Search</option>
                  <option value="patent_number">Patent Number</option>
                  <option value="category">Technology Category</option>
                </select>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={RUN_PLACEHOLDERS[runType]}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  disabled={submitting}
                />
                <button
                  type="submit"
                  disabled={submitting || !query.trim()}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {submitting ? 'Starting…' : 'Run Research'}
                </button>
              </div>

              {runningMsg && !submitError && (
                <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 animate-pulse">
                  ⚙️ {runningMsg}
                </p>
              )}
              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
              )}
            </form>

            <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
              🔒 Admin-only. Results never exposed to patent holders or marketplace visitors.
            </p>
          </div>

          {/* ── Run History Table ────────────────────────────────────────── */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
              Research History
            </h2>

            {runs.length === 0 ? (
              <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
                <div className="text-4xl mb-3">🔭</div>
                <p className="text-sm font-medium">No research runs yet.</p>
                <p className="text-xs mt-1">Submit a query above to start panning for gold.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Query', 'Type', 'Status', 'Candidates', 'Started', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(run => {
                      const candidates = run.candidates as PatentCandidate[] | null
                      const candidateCount = candidates?.length ?? 0
                      const worthCount = candidates?.filter(c => c.final_recommendation === 'worth acquiring').length ?? 0
                      const badge = STATUS_BADGE[run.status]
                      const isActive = run.status === 'pending' || run.status === 'running'

                      return (
                        <tr key={run.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          {/* Query */}
                          <td className="px-4 py-3 max-w-xs">
                            <span className="font-medium text-gray-900 line-clamp-1">"{run.query || 'Untitled Run'}"</span>
                          </td>
                          {/* Type */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {RUN_TYPE_LABELS[run.run_type]}
                            </span>
                          </td>
                          {/* Status */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge.cls} ${isActive ? 'animate-pulse' : ''}`}>
                              {isActive && '⚙️ '}{badge.label}
                            </span>
                          </td>
                          {/* Candidates */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {run.status === 'complete' && candidateCount > 0 ? (
                              <span>
                                <span className="font-semibold text-gray-800">{candidateCount}</span>
                                {worthCount > 0 && (
                                  <span className="text-green-700 font-semibold ml-2">🟢 {worthCount} 🔥</span>
                                )}
                              </span>
                            ) : run.status === 'failed' ? (
                              <span className="text-red-500 text-xs">—</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          {/* Started */}
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">
                            {run.created_at
                              ? new Date(run.created_at).toLocaleDateString('en-US', {
                                  month: 'short', day: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                })
                              : '—'}
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {run.status === 'complete' || run.status === 'failed' ? (
                              <button
                                onClick={() => openRun(run)}
                                className="text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
                              >
                                View →
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400 animate-pulse">Running…</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
