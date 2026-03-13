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
  keyword:        'Keyword Search',
  patent_number:  'Patent Number',
  category:       'Technology Category',
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-800',
  running:  'bg-blue-100 text-blue-800 animate-pulse',
  complete: 'bg-green-100 text-green-800',
  failed:   'bg-red-100 text-red-800',
}

const RECO_BADGE: Record<string, { cls: string; icon: string }> = {
  'worth acquiring':    { cls: 'bg-green-100 text-green-800 border border-green-200',  icon: '🟢' },
  'investigate further':{ cls: 'bg-yellow-100 text-yellow-800 border border-yellow-200', icon: '🟡' },
  'noise':              { cls: 'bg-gray-100 text-gray-500 border border-gray-200',     icon: '⚪' },
}

const RUN_PLACEHOLDERS: Record<string, string> = {
  keyword:       'e.g. "light-based communication" or "haptic feedback assistive"',
  patent_number: 'e.g. US9876543B2 or 15/123,456',
  category:      'e.g. "free-space optical communications" or "assistive wearables"',
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ value, max = 10, color }: { value: number; max?: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{value}/{max}</span>
    </div>
  )
}

// ── Candidate card ────────────────────────────────────────────────────────────
function CandidateCard({ c }: { c: PatentCandidate }) {
  const [expanded, setExpanded] = useState(false)
  const reco = RECO_BADGE[c.final_recommendation] ?? RECO_BADGE['noise']

  return (
    <div className={`bg-white rounded-xl border p-4 ${c.final_recommendation === 'worth acquiring' ? 'border-green-200' : c.final_recommendation === 'investigate further' ? 'border-yellow-200' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={`https://patents.google.com/patent/${c.patent_number}/en`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm font-bold text-indigo-600 hover:underline shrink-0"
          >
            {c.patent_number}
          </a>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${reco.cls}`}>
            {reco.icon} {c.final_recommendation}
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-0.5">Relevance</div>
            <ScoreBar value={c.technology_relevance} color="bg-indigo-500" />
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-0.5">Acquisition</div>
            <ScoreBar value={c.acquisition_interest} color="bg-green-500" />
          </div>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-1">{c.title}</h3>

      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-2 text-xs text-gray-500">
        {c.assignee && <span>🏢 {c.assignee}</span>}
        {c.filing_date && <span>📅 Filed {c.filing_date}</span>}
        {c.forward_citation_count != null && <span>🔗 {c.forward_citation_count} forward citations</span>}
        {c.abandonment_reason && <span>⚠️ {c.abandonment_reason}</span>}
      </div>

      <p className="text-xs text-gray-600 leading-relaxed mb-2 italic">"{c.rationale}"</p>

      {c.risk_flags.length > 0 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {expanded ? '▲ Hide' : '▼ Show'} {c.risk_flags.length} risk flag{c.risk_flags.length !== 1 ? 's' : ''}
        </button>
      )}
      {expanded && c.risk_flags.length > 0 && (
        <ul className="mt-2 space-y-1">
          {c.risk_flags.map((f, i) => (
            <li key={i} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">⚠ {f}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Run detail panel ──────────────────────────────────────────────────────────
function RunDetail({
  run,
  onClose,
}: {
  run: ResearchRun
  onClose: () => void
}) {
  const candidates = run.candidates ?? []
  const worthCount   = candidates.filter(c => c.final_recommendation === 'worth acquiring').length
  const investCount  = candidates.filter(c => c.final_recommendation === 'investigate further').length
  const noiseCount   = candidates.filter(c => c.final_recommendation === 'noise').length

  // Sort: worth acquiring first, then investigate, then noise
  const ORDER = { 'worth acquiring': 0, 'investigate further': 1, 'noise': 2 }
  const sorted = [...candidates].sort(
    (a, b) => (ORDER[a.final_recommendation] ?? 3) - (ORDER[b.final_recommendation] ?? 3)
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-4xl my-6">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[run.status]}`}>
                {run.status}
              </span>
              <span className="text-xs text-gray-400">{RUN_TYPE_LABELS[run.run_type]}</span>
            </div>
            <h2 className="font-bold text-gray-900 mt-0.5">"{run.query}"</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats strip */}
          {candidates.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Worth Acquiring', count: worthCount, color: 'text-green-700', bg: 'bg-green-50' },
                { label: 'Investigate',     count: investCount, color: 'text-yellow-700', bg: 'bg-yellow-50' },
                { label: 'Noise',           count: noiseCount,  color: 'text-gray-500',   bg: 'bg-gray-50' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl px-4 py-3 text-center`}>
                  <div className={`text-2xl font-extrabold ${s.color}`}>{s.count}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {run.summary && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                Gemini Analysis
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">{run.summary}</p>
            </div>
          )}

          {/* Candidates */}
          {sorted.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Candidates ({sorted.length})
              </h3>
              {sorted.map(c => (
                <CandidateCard key={c.patent_number} c={c} />
              ))}
            </div>
          ) : run.status === 'running' || run.status === 'pending' ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3 animate-spin">⚙️</div>
              <p className="text-sm font-medium">Gemini is researching — check back in 30–90 seconds.</p>
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
  const [loading, setLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState<ResearchRun | null>(null)

  // Form state
  const [query, setQuery]       = useState('')
  const [runType, setRunType]   = useState<'keyword' | 'patent_number' | 'category'>('keyword')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
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

  // ── Load runs ─────────────────────────────────────────────────────────────
  const loadRuns = useCallback(async (token: string) => {
    const res = await fetch('/api/research/runs', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.status === 403) { router.replace('/dashboard'); return }
    if (!res.ok) return
    const data = await res.json()
    setRuns(data)
    setLoading(false)
  }, [router])

  useEffect(() => {
    if (!authToken) return
    loadRuns(authToken)
  }, [authToken, loadRuns])

  // ── Poll active runs ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!authToken) return
    const hasActive = runs.some(r => r.status === 'pending' || r.status === 'running')
    if (hasActive && !pollingRef.current) {
      pollingRef.current = setInterval(() => loadRuns(authToken), 5000)
    } else if (!hasActive && pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    }
  }, [runs, authToken, loadRuns])

  // ── Refresh selected run detail ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedRun || !authToken) return
    if (selectedRun.status === 'pending' || selectedRun.status === 'running') {
      const t = setInterval(async () => {
        const res = await fetch(`/api/research/runs?id=${selectedRun.id}`, {
          headers: { Authorization: `Bearer ${authToken}` }
        })
        if (res.ok) {
          const updated = await res.json()
          setSelectedRun(updated)
          if (updated.status === 'complete' || updated.status === 'failed') {
            clearInterval(t)
            loadRuns(authToken)
          }
        }
      }, 5000)
      return () => clearInterval(t)
    }
  }, [selectedRun?.id, selectedRun?.status, authToken, loadRuns])

  // ── Submit run ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || !authToken) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/research/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ query: query.trim(), run_type: runType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error ?? 'Failed to start run')
        return
      }
      setQuery('')
      // Fetch the new run and prepend
      const runRes = await fetch(`/api/research/runs?id=${data.run_id}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      if (runRes.ok) {
        const newRun = await runRes.json()
        setRuns(prev => [newRun, ...prev])
        setSelectedRun(newRun)
      }
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Open run detail ───────────────────────────────────────────────────────
  async function openRun(run: ResearchRun) {
    if (!authToken) return
    const res = await fetch(`/api/research/runs?id=${run.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
    if (res.ok) setSelectedRun(await res.json())
    else setSelectedRun(run)
  }

  if (!authToken || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Loading research tool…</div>
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
        {/* Header */}
        <div className="bg-[#1a1f36] text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg">⚖️ PatentPending</span>
              <span className="text-gray-400 text-xs">›</span>
              <span className="text-sm font-semibold">Patent Research</span>
              <span className="text-xs bg-red-700 text-red-100 px-2 py-0.5 rounded-full font-bold">ADMIN</span>
            </div>
            {activeCount > 0 && (
              <span className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-full animate-pulse">
                {activeCount} run{activeCount !== 1 ? 's' : ''} in progress…
              </span>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

          {/* ── New Run Form ────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">New Research Run</h2>
            <p className="text-xs text-gray-400 mb-5">
              Gemini 2.5 Pro scans USPTO public records for abandoned/lapsed patents worth acquiring.
              Runs take 30–90 seconds. Results are saved automatically.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                  {submitting ? 'Starting…' : 'Run →'}
                </button>
              </div>

              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
              )}
            </form>

            <p className="text-xs text-gray-400 mt-4 border-t border-gray-100 pt-3">
              🔒 Admin-only tool. Results never shown to patent holders or marketplace visitors.
              All research is saved to the research_runs table.
            </p>
          </div>

          {/* ── Run History ─────────────────────────────────────────────── */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
              Research History ({runs.length})
            </h2>

            {runs.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">🔭</div>
                <p className="text-sm font-medium">No research runs yet.</p>
                <p className="text-xs mt-1">Submit a query above to start panning for gold.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {runs.map(run => {
                  const candidateCount = (run.candidates as PatentCandidate[] | null)?.length ?? 0
                  const worthCount = (run.candidates as PatentCandidate[] | null)
                    ?.filter(c => c.final_recommendation === 'worth acquiring').length ?? 0
                  const elapsed = run.completed_at
                    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()) / 1000)
                    : null

                  return (
                    <button
                      key={run.id}
                      onClick={() => openRun(run)}
                      className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-indigo-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[run.status]}`}>
                            {run.status}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">{RUN_TYPE_LABELS[run.run_type]}</span>
                          <span className="text-sm font-semibold text-gray-900 truncate">"{run.query}"</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
                          {run.status === 'complete' && candidateCount > 0 && (
                            <>
                              <span>{candidateCount} candidates</span>
                              {worthCount > 0 && (
                                <span className="text-green-700 font-semibold">🟢 {worthCount} worth acquiring</span>
                              )}
                              {elapsed && <span>{elapsed}s</span>}
                            </>
                          )}
                          <span>{new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-indigo-500 font-medium">View →</span>
                        </div>
                      </div>
                      {run.summary && (
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2">{run.summary}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
