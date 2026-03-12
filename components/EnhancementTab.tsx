'use client'
import { useState, useEffect, useCallback } from 'react'
import { Patent } from '@/lib/supabase'

interface ResearchReport {
  id: string
  report_month: string
  generated_at: string
  raw_report: string
  status: 'pending_review' | 'reviewed' | 'dismissed'
  created_at: string
}

interface EnhancementTabProps {
  patent: Patent
  authToken: string
  isPro?: boolean
  onNavigate?: (tab: string) => void
}

// Readiness checklist items with link targets
const READINESS_ITEMS = [
  { key: 'claims',      label: 'Claims reviewed and finalized',                  tab: 'claims' },
  { key: 'spec',        label: 'Specification updated with new embodiments',      tab: 'filing' },
  { key: 'figures',     label: 'All figures at 300 DPI and labeled',              tab: 'filing' },
  { key: 'declaration', label: 'Oath & Declaration completed',                    tab: null },
  { key: 'priorart',    label: 'Prior art search completed (review reports)',      tab: null },
  { key: 'assignment',  label: 'Assignment recorded with USPTO (if applicable)',  tab: 'details' },
  { key: 'fees',        label: 'Non-provisional filing fee confirmed ($320 micro / $640 small / $1,600 large)', tab: null },
]

export default function EnhancementTab({ patent, authToken, isPro = false, onNavigate }: EnhancementTabProps) {
  const [reports, setReports]           = useState<ResearchReport[]>([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [checklist, setChecklist]       = useState<Record<string, boolean>>({})
  const [downloadingDecl, setDownloadingDecl] = useState(false)

  const filedAt   = patent.provisional_filed_at ? new Date(patent.provisional_filed_at) : null
  const deadlineAt = patent.nonprov_deadline_at  ? new Date(patent.nonprov_deadline_at)  : null

  // Timeline computation
  const now = new Date()
  const totalMs   = deadlineAt && filedAt ? deadlineAt.getTime() - filedAt.getTime() : 0
  const elapsedMs = filedAt ? now.getTime() - filedAt.getTime() : 0
  const progressPct = totalMs > 0 ? Math.min(100, Math.round((elapsedMs / totalMs) * 100)) : 0
  const daysRemaining = deadlineAt ? Math.max(0, Math.ceil((deadlineAt.getTime() - now.getTime()) / 86400000)) : null

  function progressColor() {
    if (daysRemaining === null) return 'bg-gray-400'
    if (daysRemaining <= 30)  return 'bg-red-500'
    if (daysRemaining <= 90)  return 'bg-orange-400'
    if (daysRemaining <= 180) return 'bg-yellow-400'
    return 'bg-green-500'
  }

  // Fetch research reports
  const fetchReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const res = await fetch(`/api/patents/${patent.id}/research-reports`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const { reports: data } = await res.json()
        setReports(data ?? [])
      }
    } finally {
      setLoadingReports(false)
    }
  }, [patent.id, authToken])

  useEffect(() => { fetchReports() }, [fetchReports])

  // Load persisted checklist from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`enhancement-checklist-${patent.id}`)
      if (saved) setChecklist(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [patent.id])

  function toggleCheck(key: string) {
    setChecklist(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(`enhancement-checklist-${patent.id}`, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  async function updateReportStatus(reportId: string, status: 'reviewed' | 'dismissed') {
    setUpdatingStatus(reportId)
    try {
      const res = await fetch(`/api/patents/${patent.id}/research-reports`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ report_id: reportId, status }),
      })
      if (res.ok) {
        setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r))
      }
    } finally {
      setUpdatingStatus(null)
    }
  }

  async function downloadDeclaration() {
    setDownloadingDecl(true)
    try {
      const res = await fetch(`/api/patents/${patent.id}/oath-declaration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Error ${res.status}`)
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `oath-declaration-${patent.id.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingDecl(false)
    }
  }

  const pendingReports = reports.filter(r => r.status === 'pending_review')
  const checkedCount   = Object.values(checklist).filter(Boolean).length

  if (!filedAt || patent.filing_status !== 'provisional_filed') {
    return (
      <div className="py-12 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <div className="text-gray-500 text-sm">Enhancement tools unlock after you mark the patent as filed.</div>
      </div>
    )
  }

  const filedDateStr = filedAt
    ? filedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''
  const deadlineDateStr = deadlineAt
    ? deadlineAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''
  const appNumber = (patent as Record<string, unknown>).provisional_app_number as string | null

  return (
    <div className="space-y-6">

      {/* ── 🎉 Patent Filed Moment ────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="text-4xl shrink-0">🎉</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-emerald-900">Patent Application Filed</h2>
            <p className="text-sm text-emerald-700 mt-0.5 font-mono">
              {appNumber} · Filed {filedDateStr} · Protected for 12 months
            </p>
            <p className="text-sm text-gray-700 mt-3 leading-relaxed">
              Your invention is now protected under US patent law while you prepare your non-provisional application.
              Here&apos;s how PatentPending helps you make the most of this window:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              {[
                {
                  icon: '🔬',
                  title: 'Monthly Research',
                  desc: 'AI finds new prior art and claim improvements each month while patent pending',
                },
                {
                  icon: '🏪',
                  title: 'Marketplace',
                  desc: 'List your patent for licensing or sale while patent pending',
                  onClick: () => onNavigate?.('leads'),
                },
                {
                  icon: '📋',
                  title: 'Non-Pro Prep',
                  desc: `Tools and checklist to convert to non-provisional before ${deadlineDateStr}`,
                },
              ].map(card => (
                <div
                  key={card.title}
                  onClick={card.onClick}
                  className={`p-3.5 bg-white border border-emerald-100 rounded-xl ${card.onClick ? 'cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all' : ''}`}
                >
                  <div className="text-xl mb-1.5">{card.icon}</div>
                  <div className="text-xs font-bold text-emerald-900">{card.title}</div>
                  <div className="text-xs text-gray-500 mt-1 leading-relaxed">{card.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 🗓 Your 12-Month Roadmap ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          🗓 Your 12-Month Roadmap
        </h3>
        <div className="space-y-3">
          {[
            {
              range: 'Month 1–3',
              color: 'border-blue-200 bg-blue-50',
              titleColor: 'text-blue-800',
              title: 'Strengthen Your Application',
              items: ['Refine claims based on Pattie suggestions', 'Add new embodiments and use cases', 'Monitor prior art with monthly research reports'],
            },
            {
              range: 'Month 3–6',
              color: 'border-violet-200 bg-violet-50',
              titleColor: 'text-violet-800',
              title: 'Consider International Protection',
              items: ['PCT application deadline = 12 months from filing', 'Foreign national phase deadline = 30 months from filing', 'Consult an attorney if global coverage matters'],
            },
            {
              range: 'Month 6–9',
              color: 'border-amber-200 bg-amber-50',
              titleColor: 'text-amber-800',
              title: 'Prepare Non-Provisional',
              items: ['Draft full claims and specification', 'Generate USPTO-compliant drawings', 'Complete Oath & Declaration (PTO/AIA/01)'],
            },
            {
              range: `Month 9–12`,
              color: 'border-red-200 bg-red-50',
              titleColor: 'text-red-800',
              title: `File Before ${deadlineDateStr}`,
              items: ['File non-provisional at Patent Center', 'Pay non-provisional fees (micro ~$320 / small ~$640)', 'Activate Marketplace listing — "Patent Pending" sells'],
            },
          ].map(phase => (
            <div key={phase.range} className={`flex gap-4 p-4 rounded-xl border ${phase.color}`}>
              <div className="shrink-0 text-xs font-bold text-gray-400 w-20 pt-0.5 text-right">{phase.range}</div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold mb-1.5 ${phase.titleColor}`}>{phase.title}</div>
                <ul className="space-y-0.5">
                  {phase.items.map(item => (
                    <li key={item} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-gray-400 shrink-0 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 💎 Free-tier upgrade prompt (hidden for Pro/attorney) ────────────── */}
      {!isPro && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-bold text-indigo-900 text-sm mb-2">
                Unlock your full 12-month protection
              </h3>
              <ul className="space-y-1">
                {[
                  '✓ Monthly AI research reports',
                  '✓ Marketplace listing for licensing & sale',
                  '✓ Unlimited Pattie sessions',
                ].map(item => (
                  <li key={item} className="text-xs text-indigo-800">{item}</li>
                ))}
              </ul>
            </div>
            <a
              href="/dashboard/upgrade"
              className="shrink-0 flex flex-col items-center gap-1 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
            >
              <span>Upgrade to Pro</span>
              <span className="text-xs font-normal opacity-80">$149/mo · $99/mo annual</span>
            </a>
          </div>
        </div>
      )}

      {/* ── Section A: 12-Month Timeline ─────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          📅 12-Month Enhancement Timeline
          {daysRemaining !== null && (
            <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${
              daysRemaining <= 30  ? 'bg-red-100 text-red-700' :
              daysRemaining <= 90  ? 'bg-orange-100 text-orange-700' :
              daysRemaining <= 180 ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>
              {daysRemaining}d remaining
            </span>
          )}
        </h3>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>Filed {filedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span>Due {deadlineAt?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? '—'}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressColor()}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1 text-right">{progressPct}% of enhancement window elapsed</div>
        </div>

        {/* Milestones */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs mt-4">
          {[
            { label: '6-Month Check-In',   pct: 50,  desc: 'Claims review' },
            { label: '9-Month Final Push',  pct: 75,  desc: 'Non-prov prep' },
            { label: 'File By Deadline',    pct: 100, desc: deadlineAt?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? '' },
          ].map(m => (
            <div key={m.label} className={`p-2 rounded-xl border ${progressPct >= m.pct ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
              <div className={`font-semibold ${progressPct >= m.pct ? 'text-green-700' : 'text-gray-500'}`}>
                {progressPct >= m.pct ? '✓ ' : ''}{m.label}
              </div>
              <div className="text-gray-400 mt-0.5">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section B: Enhancement Actions ───────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          🔬 Enhancement Actions
          {pendingReports.length > 0 && (
            <span className="ml-1 w-2 h-2 rounded-full bg-blue-500 inline-block" title={`${pendingReports.length} unreviewed report(s)`} />
          )}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: '✏️', label: 'Review & Refine Claims',
              desc: 'Edit claims with AI suggestions panel',
              onClick: () => onNavigate?.('claims'),
            },
            {
              icon: '📋', label: 'Prepare Oath & Declaration',
              desc: 'Generate pre-filled PTO/AIA/01 PDF',
              onClick: downloadDeclaration,
              loading: downloadingDecl,
            },
            {
              icon: '📊', label: `Monthly Research Reports`,
              desc: pendingReports.length > 0
                ? `${pendingReports.length} unreviewed — scroll down`
                : reports.length > 0 ? `${reports.length} report(s) on file` : 'Generated monthly after filing',
              onClick: () => document.getElementById('research-reports-section')?.scrollIntoView({ behavior: 'smooth' }),
            },
            {
              icon: '📁', label: 'Upload New Embodiment',
              desc: 'Add drawings or docs describing improvements',
              onClick: () => onNavigate?.('filing'),
            },
          ].map(action => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.loading}
              className="flex items-start gap-3 p-3.5 border border-gray-200 rounded-xl hover:border-[#1a1f36]/30 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
            >
              <span className="text-2xl shrink-0">{action.icon}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#1a1f36]">
                  {action.loading ? 'Generating...' : action.label}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{action.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Section C: Non-Provisional Readiness Checklist ───────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
          📋 Non-Provisional Readiness
          <span className="ml-auto text-xs text-gray-400 font-normal">{checkedCount}/{READINESS_ITEMS.length} complete</span>
        </h3>

        {/* Progress ring (simple bar for now) */}
        <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-[#1a1f36] rounded-full transition-all"
            style={{ width: `${Math.round((checkedCount / READINESS_ITEMS.length) * 100)}%` }}
          />
        </div>

        <div className="space-y-2">
          {READINESS_ITEMS.map(item => (
            <div key={item.key} className="flex items-center gap-3">
              <button
                onClick={() => toggleCheck(item.key)}
                className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                  checklist[item.key]
                    ? 'bg-[#1a1f36] border-[#1a1f36] text-white'
                    : 'border-gray-300 hover:border-[#1a1f36]/50'
                }`}
              >
                {checklist[item.key] && <span className="text-xs font-bold">X</span>}
              </button>
              <span className={`text-sm flex-1 ${checklist[item.key] ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {item.label}
              </span>
              {item.tab && (
                <button
                  onClick={() => onNavigate?.(item.tab!)}
                  className="text-xs text-[#1a1f36]/60 hover:text-[#1a1f36] shrink-0"
                >
                  Go →
                </button>
              )}
              {item.key === 'declaration' && (
                <button
                  onClick={downloadDeclaration}
                  disabled={downloadingDecl}
                  className="text-xs text-[#1a1f36]/60 hover:text-[#1a1f36] shrink-0disabled:opacity-40"
                >
                  Generate →
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">Checklist is saved in your browser — not synced to the server.</p>
      </div>

      {/* ── Section B (continued): Research Reports ───────────────────────────── */}
      <div id="research-reports-section" className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          📊 Monthly Research Reports
          {pendingReports.length > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
              {pendingReports.length} unreviewed
            </span>
          )}
        </h3>

        {loadingReports ? (
          <div className="text-sm text-gray-400 text-center py-6">Loading reports…</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">📭</div>
            <div className="text-sm text-gray-500">No research reports yet.</div>
            <div className="text-xs text-gray-400 mt-1">
              Reports are generated on the 1st of each month once
              {' '}<code className="bg-gray-100 px-1 rounded">ENABLE_MONTHLY_RESEARCH=true</code>{' '}
              is set in the environment.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(report => {
              const monthLabel = new Date(report.report_month + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'long', year: 'numeric',
              })
              const isExpanded = expandedReport === report.id
              const isPending  = report.status === 'pending_review'

              return (
                <div
                  key={report.id}
                  className={`border rounded-xl overflow-hidden ${
                    isPending ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
                  }`}
                >
                  <div
                    className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isPending && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{monthLabel} Research</div>
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                          {report.raw_report.slice(0, 120).replace(/\n/g, ' ')}…
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        report.status === 'reviewed'   ? 'bg-green-100 text-green-700' :
                        report.status === 'dismissed'  ? 'bg-gray-100 text-gray-400' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {report.status.replace('_', ' ')}
                      </span>
                      <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap font-mono text-xs bg-gray-50 rounded-xl p-3 max-h-80 overflow-y-auto">
                        {report.raw_report}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => updateReportStatus(report.id, 'reviewed')}
                          disabled={updatingStatus === report.id || report.status === 'reviewed'}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors"
                        >
                          {updatingStatus === report.id ? '…' : '✓ Mark Reviewed'}
                        </button>
                        <button
                          onClick={() => updateReportStatus(report.id, 'dismissed')}
                          disabled={updatingStatus === report.id || report.status === 'dismissed'}
                          className="px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        >
                          Dismiss
                        </button>
                        {report.status !== 'pending_review' && (
                          <button
                            onClick={() => updateReportStatus(report.id, 'dismissed')}
                            disabled={updatingStatus === report.id}
                            className="px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-40 transition-colors"
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
