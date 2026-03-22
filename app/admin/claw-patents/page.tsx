'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface ClawPatent {
  id: string
  title: string
  invention_area: string
  novelty_score: number | null
  commercial_score: number | null
  filing_complexity: number | null
  composite_score: number | null
  status: string
  drive_url: string | null
  batch_date: string | null
  batch_rank: number | null
  novelty_rationale: string | null
  claw_notes: string | null
  patent_id: string | null
  created_at: string
  improvement_day: number | null
  provisional_ready: boolean | null
  archived_at: string | null
}

type GroupedBatch = { date: string; patents: ClawPatent[] }

function ScoreBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-gray-700">{value ?? '—'}</span>
    </div>
  )
}

function StatusBadge({ status, provisionalReady }: { status: string; provisionalReady?: boolean | null }) {
  if (provisionalReady) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        🏆 Provisional Ready
      </span>
    )
  }
  const cfg: Record<string, string> = {
    draft:               'bg-gray-100 text-gray-600',
    claimed:             'bg-green-100 text-green-700',
    pipeline_incomplete: 'bg-amber-100 text-amber-700',
    reviewed:            'bg-blue-100 text-blue-700',
    filed:               'bg-indigo-100 text-indigo-700',
    abandoned:           'bg-red-100 text-red-700',
    archived:            'bg-red-50 text-red-400',
  }
  const label: Record<string, string> = {
    draft:               'Draft',
    claimed:             'Claimed ✅',
    pipeline_incomplete: 'Incomplete',
    reviewed:            'Reviewed',
    filed:               'Filed',
    abandoned:           'Abandoned',
    archived:            '📦 Archived',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {label[status] ?? status}
    </span>
  )
}

function ClaimModal({ patent, authToken, onClose, onClaimed }:
  { patent: ClawPatent; authToken: string; onClose: () => void; onClaimed: () => void }
) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleClaim() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/claw-patents/${patent.id}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Claim failed'); setLoading(false); return }
      onClaimed()
    } catch {
      setError('Network error'); setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Claim This Patent</h2>
        <p className="text-sm text-gray-600 mb-4">
          This will transfer <strong>{patent.title}</strong> to your account (support@hotdeck.com)
          and make you the named inventor. The draft will remain visible here as archived.
          <br /><br />
          <span className="text-xs text-amber-700 font-medium">
            ⚖️ You are certifying you are the inventor of this concept.
            AI cannot be listed as inventor (35 U.S.C. § 101).
          </span>
        </p>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleClaim}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50"
          >
            {loading ? 'Claiming…' : 'Confirm — Claim This Patent'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClawPatentsAdminPage() {
  const [patents, setPatents]         = useState<ClawPatent[]>([])
  const [loading, setLoading]         = useState(true)
  const [authToken, setAuthToken]     = useState('')
  const [claimTarget, setClaimTarget] = useState<ClawPatent | null>(null)
  const [toast, setToast]             = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const router = useRouter()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) setAuthToken(session.access_token)

    const { data, error } = await supabase
      .from('claw_patents')
      .select('id,title,invention_area,novelty_score,commercial_score,filing_complexity,composite_score,status,drive_url,batch_date,batch_rank,novelty_rationale,claw_notes,patent_id,created_at,improvement_day,provisional_ready,archived_at')
      .order('composite_score', { ascending: false })
      .limit(200)

    if (!error && data) setPatents(data as ClawPatent[])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  // Filter: hide archived by default
  const visiblePatents = showArchived ? patents : patents.filter(p => p.status !== 'archived')
  const archivedCount  = patents.filter(p => p.status === 'archived').length

  // Group by batch_date
  const groups: GroupedBatch[] = []
  const seen = new Set<string>()
  for (const p of visiblePatents) {
    const d = p.batch_date ?? p.created_at.slice(0, 10)
    if (!seen.has(d)) { seen.add(d); groups.push({ date: d, patents: [] }) }
    groups.find(g => g.date === d)!.patents.push(p)
  }

  function handleClaimed() {
    setClaimTarget(null)
    setToast('Patent claimed — it\'s now in your dashboard. Ready to review and file.')
    setTimeout(() => setToast(''), 4000)
    load()
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Loading…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1a1f36] text-white px-6 py-4 flex items-center gap-4 flex-wrap">
        <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← Admin</Link>
        <h1 className="font-bold text-lg">🦞 PatentClaw Invents</h1>
        <span className="text-gray-400 text-xs">{visiblePatents.length} drafts</span>
        {patents.filter(p => p.provisional_ready).length > 0 && (
          <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-semibold">
            🏆 {patents.filter(p => p.provisional_ready).length} provisional-ready
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              showArchived
                ? 'bg-red-500 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            📦 {showArchived ? 'Hide' : 'Show'} Archived ({archivedCount})
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        {groups.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-4">🧪</div>
            <p className="font-medium">No PatentClaw drafts yet</p>
            <p className="text-sm mt-1">The nightly pipeline runs at 11 PM CT</p>
          </div>
        )}

        {groups.map(group => (
          <div key={group.date}>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">
              Batch — {group.date}
            </h2>
            <div className="space-y-4">
              {group.patents.map((p, i) => {
                const rank = p.batch_rank ?? (i + 1)
                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-lg">{medals[rank - 1] ?? '🔬'}</span>
                          <h3 className="font-bold text-gray-900 text-sm leading-snug">{p.title}</h3>
                          <StatusBadge status={p.status} provisionalReady={p.provisional_ready} />
                          {p.improvement_day != null && p.improvement_day > 1 && !p.provisional_ready && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">
                              Day {p.improvement_day}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{p.invention_area}</p>
                        {p.archived_at && (
                          <p className="text-xs text-red-400 mt-0.5">
                            Archived {new Date(p.archived_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {p.composite_score != null && (
                        <div className="text-right shrink-0">
                          <div className="text-2xl font-black text-[#1a1f36]">{p.composite_score}</div>
                          <div className="text-xs text-gray-400">/ 100</div>
                        </div>
                      )}
                    </div>

                    {/* Score bars */}
                    <div className="space-y-1.5 mb-4">
                      <ScoreBar label="Novelty"    value={p.novelty_score}      color="bg-blue-400" />
                      <ScoreBar label="Commercial" value={p.commercial_score}   color="bg-green-400" />
                      <ScoreBar label="Complexity" value={p.filing_complexity}  color="bg-amber-400" />
                    </div>

                    {/* Novelty argument */}
                    {p.novelty_rationale && (
                      <p className="text-xs text-gray-600 leading-relaxed mb-3 italic">
                        &ldquo;{p.novelty_rationale.slice(0, 200)}{p.novelty_rationale.length > 200 ? '…' : ''}&rdquo;
                      </p>
                    )}

                    {/* Claw notes */}
                    {p.claw_notes && (
                      <p className="text-xs text-purple-700 mb-3">
                        🦞 {p.claw_notes.slice(0, 180)}{p.claw_notes.length > 180 ? '…' : ''}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-2">
                      {p.drive_url && (
                        <a
                          href={p.drive_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                        >
                          📄 View Full Report
                        </a>
                      )}
                      {p.patent_id && (
                        <Link
                          href={`/dashboard/patents/${p.patent_id}`}
                          className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium"
                        >
                          🔗 View in Dashboard
                        </Link>
                      )}
                      {p.status === 'draft' && (
                        <button
                          onClick={() => setClaimTarget(p)}
                          className="text-xs px-3 py-1.5 bg-[#1a1f36] text-white rounded-lg hover:bg-[#2d3561] font-semibold"
                        >
                          ⚡ Claim This Patent
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {claimTarget && (
        <ClaimModal
          patent={claimTarget}
          authToken={authToken}
          onClose={() => setClaimTarget(null)}
          onClaimed={handleClaimed}
        />
      )}
    </div>
  )
}
