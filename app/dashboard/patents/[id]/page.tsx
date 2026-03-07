'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import CorrespondenceForm from '@/components/CorrespondenceForm'
import FilingProgressTracker, { computeStepStatus, currentStep } from '@/components/FilingProgressTracker'
import DocumentUploadZone from '@/components/DocumentUploadZone'
import {
  supabase, Patent, PatentDeadline, PatentCorrespondence,
  getDaysUntil, getUrgencyBadge,
  CORRESPONDENCE_TYPE_LABELS, CORRESPONDENCE_TYPE_COLORS
} from '@/lib/supabase'
import type { ClaimsScore } from '@/lib/claims-score'
import CollaboratorsTab, { Collaborator } from '@/components/CollaboratorsTab'
import Arc3Modal from '@/components/Arc3Modal'

// ── Types ─────────────────────────────────────────────────────────────────────
interface UploadedFile {
  name: string
  size: number
  type: string
  storage_path: string
  uploaded_at: string
}

const STATUS_COLORS: Record<string, string> = {
  provisional: 'bg-blue-100 text-blue-800',
  non_provisional: 'bg-purple-100 text-purple-800',
  published: 'bg-indigo-100 text-indigo-800',
  granted: 'bg-green-100 text-green-800',
  abandoned: 'bg-gray-100 text-gray-800',
}

type Tab = 'details' | 'claims' | 'filing' | 'correspondence' | 'collaborators'

// ── Revision chips ─────────────────────────────────────────────────────────────
const REVISION_CHIPS = [
  { id: 'broaden', label: 'Broaden the independent claims' },
  { id: 'more_dependent', label: 'Add more dependent claims' },
  { id: 'uspto_language', label: 'Improve USPTO language compliance' },
  { id: 'missing_embodiments', label: 'Add missing embodiments' },
  { id: 'prior_art', label: 'Run prior art check and strengthen novelty' },
  { id: 'custom', label: 'Custom note…' },
]

// ── Filing readiness score card ───────────────────────────────────────────────
function ScoreCard({ score }: { score: ClaimsScore }) {
  const readinessColor = score.provisional_ready ? '#059669' : '#d97706'
  const noveltyColor = score.novelty_score >= 8 ? '#059669' : score.novelty_score >= 6 ? '#d97706' : '#dc2626'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Filing Readiness</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: readinessColor }}>
          {score.provisional_ready ? '✅ FILE NOW' : '⚠️ NEEDS WORK'}
        </span>
      </div>
      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-1">Independent Claims</div>
          <div className="text-xl font-bold text-[#1a1f36]">
            {score.independent_claims_count}
            {score.independent_claims_count >= 3 && <span className="text-green-500 text-base ml-1">✅</span>}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">Dependent Claims</div>
          <div className="text-xl font-bold text-[#1a1f36]">
            {score.dependent_claims_count}
            {score.dependent_claims_count >= 6 && <span className="text-green-500 text-base ml-1">✅</span>}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">Novelty Score</div>
          <div className="text-xl font-bold" style={{ color: noveltyColor }}>
            {score.novelty_score}<span className="text-sm font-normal text-gray-400">/10</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">Provisional Ready?</div>
          <div className="text-base font-bold" style={{ color: readinessColor }}>
            {score.provisional_ready ? 'YES' : 'NOT YET'}
          </div>
        </div>
      </div>
      {(score.top_strength || score.top_gap) && (
        <div className="px-5 pb-4 grid sm:grid-cols-2 gap-3">
          {score.top_strength && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <div className="text-xs font-semibold text-green-700 mb-1">💪 Top Strength</div>
              <div className="text-xs text-green-800">{score.top_strength}</div>
            </div>
          )}
          {score.top_gap && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <div className="text-xs font-semibold text-amber-700 mb-1">⚠️ Top Gap</div>
              <div className="text-xs text-amber-800">{score.top_gap}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Pro badge ──────────────────────────────────────────────────────────────────
function ProBadge() {
  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
        <span className="text-base">⚡</span>
        <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Go Deeper with Pro</span>
      </div>
      <div className="px-5 py-4">
        <ul className="space-y-2 mb-4">
          {[
            'Deep Research Pass (12-min Gemini)',
            'Claude Language Refinement Pass',
            'Unlimited revision rounds',
          ].map(f => (
            <li key={f} className="text-xs text-gray-600 flex items-center gap-2">
              <span className="text-amber-500">•</span> {f}
            </li>
          ))}
        </ul>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors"
        >
          Upgrade to Pro →
        </Link>
      </div>
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, background: '#1a1f36', color: '#fff',
      padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
    }}>
      {message}
    </div>
  )
}

// ── Claims text with individual copy ──────────────────────────────────────────
function ClaimsText({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  // Split into individual claims by numbered lines
  const claims = text.split(/(?=^\d+\.\s)/m).filter(s => s.trim())

  return (
    <div className="px-5 py-4 font-mono text-xs text-gray-700 leading-relaxed max-h-[500px] overflow-y-auto">
      {claims.length > 1 ? (
        claims.map((claim, i) => (
          <div
            key={i}
            className="group relative mb-3 p-2 -mx-2 rounded hover:bg-gray-50 transition-colors"
          >
            <button
              onClick={() => onCopy(claim.trim())}
              className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200"
              title="Copy this claim"
            >
              <span className="text-gray-400 text-xs">📋</span>
            </button>
            <pre className="whitespace-pre-wrap pr-6">{claim}</pre>
          </div>
        ))
      ) : (
        <pre className="whitespace-pre-wrap">{text}</pre>
      )}
    </div>
  )
}

// ── File type icon ────────────────────────────────────────────────────────────
function fileIcon(type: string): string {
  if (type === 'application/pdf') return '📄'
  if (type.includes('word') || type.includes('doc')) return '📝'
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'text/plain') return '📃'
  if (type === 'text/markdown') return '🗒️'
  return '📁'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PatentDetail() {
  const [patent, setPatent] = useState<Patent | null>(null)
  const [deadlines, setDeadlines] = useState<PatentDeadline[]>([])
  const [correspondence, setCorrespondence] = useState<PatentCorrespondence[]>([])
  const [allPatents, setAllPatents] = useState<Patent[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [fileSignedUrls, setFileSignedUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Patent>>({})
  const [tab, setTab] = useState<Tab>('details')
  const [claimsAction, setClaimsAction] = useState<'idle' | 'approving' | 'requesting'>('idle')
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [customNote, setCustomNote] = useState('')
  const [claimsMsg, setClaimsMsg] = useState('')
  const [showCorrespondenceForm, setShowCorrespondenceForm] = useState(false)
  const [expandedCorr, setExpandedCorr] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [isCollaborator, setIsCollaborator] = useState(false)
  const [collaboratorRole, setCollaboratorRole] = useState<string | null>(null)
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [showArc3Modal, setShowArc3Modal] = useState(false)
  const [arc3Slug, setArc3Slug] = useState<string | null>(null)
  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [draftingSpec, setDraftingSpec] = useState(false)
  const [showSpecDraft, setShowSpecDraft] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string

  const showToast = useCallback((msg: string) => { setToast(msg) }, [])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setOwnerId(user.id)

    const { data: { session: authSession } } = await supabase.auth.getSession()
    if (authSession?.access_token) setAuthToken(authSession.access_token)
    const token = authSession?.access_token ?? ''

    const [{ data: p }, { data: d }, { data: c }, { data: ap }] = await Promise.all([
      supabase.from('patents').select('*').eq('id', id).single(),
      supabase.from('patent_deadlines').select('*').eq('patent_id', id).order('due_date', { ascending: true }),
      supabase.from('patent_correspondence').select('*').eq('patent_id', id).order('correspondence_date', { ascending: false }),
      supabase.from('patents').select('*').order('title'),
    ])

    if (!p) { router.push('/dashboard/patents'); return }

    // Detect if user is a collaborator (not the owner)
    const isOwner = p.owner_id === user.id
    if (!isOwner) {
      // Check collaborator record
      const { data: collabRecord } = await supabase
        .from('patent_collaborators')
        .select('role')
        .eq('patent_id', id)
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .single()
      if (collabRecord) {
        setIsCollaborator(true)
        setCollaboratorRole(collabRecord.role)
      }
    }

    // Load collaborators list (owner only)
    if (isOwner && token) {
      try {
        const collabRes = await fetch(`/api/patents/${id}/invite`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (collabRes.ok) {
          const collabData = await collabRes.json()
          setCollaborators(collabData.collaborators ?? [])
        }
      } catch { /* non-critical */ }
    }

    setPatent(p)
    setEditData(p)
    setDeadlines(d || [])
    setCorrespondence((c as PatentCorrespondence[]) || [])
    setAllPatents(ap || [])

    // ── BUG 1 FIX: load uploaded files from intake session ────────────────
    if (p.intake_session_id) {
      const { data: intakeSession } = await supabase
        .from('patent_intake_sessions')
        .select('uploaded_files')
        .eq('id', p.intake_session_id)
        .single()

      const files: UploadedFile[] = (intakeSession?.uploaded_files as UploadedFile[]) || []
      setUploadedFiles(files)

      // Generate signed URLs for files with storage paths
      if (files.length > 0) {
        const urls: Record<string, string> = {}
        for (const f of files) {
          if (f.storage_path) {
            const { data: signed } = await supabase.storage
              .from('patent-uploads')
              .createSignedUrl(f.storage_path, 3600) // 1 hour
            if (signed?.signedUrl) urls[f.storage_path] = signed.signedUrl
          }
        }
        setFileSignedUrls(urls)
      }
    }

    setLoading(false)
  }

  useEffect(() => { loadAll() }, [id, router])

  // Handle cover-sheet acknowledgment redirect from cover-sheet page
  useEffect(() => {
    if (searchParams.get('ack') === 'cover-sheet' && patent && authToken && !patent.cover_sheet_acknowledged) {
      fetch(`/api/patents/${patent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ cover_sheet_acknowledged: true }),
      }).then(r => r.ok && r.json()).then(updated => {
        if (updated) {
          setPatent(prev => prev ? { ...prev, cover_sheet_acknowledged: true } : null)
          showToast('✅ Cover sheet marked complete — Step 7 done!')
          setTab('filing')
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, authToken, patent?.id])

  // Focus title input when entering edit mode
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingTitle])

  // ── Inline title save ──────────────────────────────────────────────────────
  async function saveTitleInline() {
    if (!patent || !titleDraft.trim() || titleDraft.trim() === patent.title) {
      setEditingTitle(false)
      return
    }
    const newTitle = titleDraft.trim()
    const res = await fetch(`/api/patents/${patent.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ title: newTitle }),
    })
    if (res.ok) {
      setPatent(prev => prev ? { ...prev, title: newTitle } : null)
      setEditData(prev => ({ ...prev, title: newTitle }))
    }
    setEditingTitle(false)
  }

  // ── Claims actions ─────────────────────────────────────────────────────────
  async function approveClaims() {
    if (!patent) return
    setClaimsAction('approving')
    setClaimsMsg('')
    const res = await fetch(`/api/patents/${patent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
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
    if (!patent) return
    const chips = selectedChips.filter(c => c !== 'custom')
    const chipLabels = chips.map(c => REVISION_CHIPS.find(r => r.id === c)?.label || c)
    const parts = [...chipLabels]
    if (customNote.trim()) parts.push(`Custom: ${customNote.trim()}`)
    const content = parts.join('. ')
    if (!content) return

    setClaimsAction('requesting')
    setClaimsMsg('')
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        patent_id: patent.id,
        draft_type: 'claims_revision',
        title: `Claims Revision Request — ${patent.title}`,
        content,
        version: 1,
      }),
    })
    const json = await res.json()
    if (res.ok) {
      setSelectedChips([])
      setCustomNote('')
      setClaimsMsg('Revision request submitted. Updated claims will appear here shortly.')
    } else {
      setClaimsMsg(`Error: ${json.error || 'Failed to submit'}`)
    }
    setClaimsAction('idle')
  }

  // ── Copy to clipboard ──────────────────────────────────────────────────────
  async function copyToClipboard(text: string, label = 'Copied!') {
    try {
      await navigator.clipboard.writeText(text)
      showToast(label)
    } catch {
      showToast('Copy failed — try selecting manually')
    }
  }

  // ── Details save ───────────────────────────────────────────────────────────
  async function saveEdits() {
    if (!patent) return
    setSaving(true)
    const res = await fetch(`/api/patents/${patent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(editData),
    })
    if (res.ok) {
      const updated = await res.json()
      setPatent(updated)
      setEditing(false)
    }
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading...</div></div>
  if (!patent) return null

  const deadline = patent.provisional_deadline
  const days = deadline ? getDaysUntil(deadline) : null
  const claimsScore = patent.claims_score as ClaimsScore | null
  const revisionContentReady = selectedChips.some(c => c !== 'custom') || customNote.trim().length > 0

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

        {/* Header — BUG 2 FIX: inline title editing */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitleInline}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitleInline()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                className="text-lg sm:text-2xl font-bold text-[#1a1f36] leading-snug bg-transparent border-b-2 border-[#1a1f36] outline-none w-full pb-0.5"
              />
            ) : (
              <div
                className="group flex items-center gap-2 cursor-pointer"
                onClick={() => { setTitleDraft(patent.title); setEditingTitle(true) }}
                title="Click to edit title"
              >
                <h1 className="text-lg sm:text-2xl font-bold text-[#1a1f36] leading-snug">{patent.title}</h1>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 text-sm flex-shrink-0">✏️</span>
              </div>
            )}
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

        {/* Co-inventor read-only banner */}
        {isCollaborator && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <span className="text-amber-500 text-lg">👁</span>
            <div>
              <span className="text-sm font-semibold text-amber-800">Read-Only Access</span>
              <span className="text-sm text-amber-700 ml-2">
                You are viewing this patent as a{' '}
                <span className="font-semibold capitalize">{collaboratorRole?.replace('_', '-') ?? 'collaborator'}</span>.
                Contact the patent owner to make changes.
              </span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-full sm:w-auto sm:inline-flex flex-wrap sm:flex-nowrap">
          {(([
            'details', 'claims', 'filing', 'correspondence',
            ...(!isCollaborator ? ['collaborators'] : []),
          ]) as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize min-h-[40px] ${
                tab === t ? 'bg-white text-[#1a1f36] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'correspondence'
                ? `Correspondence (${correspondence.length + uploadedFiles.length})`
                : t === 'filing'
                ? (() => {
                    const statuses = computeStepStatus(patent)
                    const cur = currentStep(statuses)
                    return (
                      <span className="flex items-center gap-1.5">
                        Filing
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                          cur === 9 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {cur}/9
                        </span>
                      </span>
                    )
                  })()
                : t === 'claims' ? (
                  <span className="flex items-center gap-1.5">
                    Claims
                    {patent.filing_status === 'approved' && <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />}
                    {(patent.claims_status === 'pending' || patent.claims_status === 'generating') && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />}
                    {patent.claims_status === 'failed' && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
                    {patent.claims_status === 'complete' && patent.filing_status === 'draft' && <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />}
                  </span>
                ) : t === 'collaborators' ? (
                  <span className="flex items-center gap-1.5">
                    Collaborators
                    {collaborators.length > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">{collaborators.length}</span>
                    )}
                  </span>
                ) : 'Details'
              }
            </button>
          ))}
        </div>

        {/* ── DETAILS TAB ─────────────────────────────────────────────────────── */}
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

              {/* ── Arc 3: Deal Page ──────────────────────────────────────────── */}
              {!isCollaborator && (
                <div className={`rounded-xl border p-5 ${
                  (patent as Patent & { arc3_active?: boolean }).arc3_active
                    ? 'border-green-200 bg-green-50'
                    : 'border-indigo-100 bg-indigo-50'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🏛️</span>
                    <h2 className="font-semibold text-[#1a1f36] text-sm">Arc 3 — Deal Page</h2>
                  </div>
                  {(patent as Patent & { arc3_active?: boolean }).arc3_active ? (
                    <div>
                      <div className="text-xs text-green-700 font-semibold mb-2">✅ Deal page active</div>
                      <a
                        href={`/patents/${arc3Slug ?? (patent as Patent & { slug?: string }).slug ?? patent.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 underline block mb-2"
                      >
                        View public deal page →
                      </a>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-indigo-700 mb-3">
                        List this patent for licensing. HHLLC represents you for 20% commission. No upfront cost.
                      </p>
                      <button
                        onClick={() => setShowArc3Modal(true)}
                        className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
                      >
                        Activate Deal Page →
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Arc 3 activation modal */}
        {showArc3Modal && patent && (
          <Arc3Modal
            patentId={patent.id}
            patentTitle={patent.title}
            authToken={authToken}
            onSuccess={(slug, _url) => {
              setArc3Slug(slug)
              setShowArc3Modal(false)
              setPatent(prev => prev ? { ...prev, arc3_active: true } as typeof prev : null)
              showToast('🏛️ Arc 3 activated! Deal page is live.')
            }}
            onClose={() => setShowArc3Modal(false)}
          />
        )}

        {/* ── CLAIMS TAB ──────────────────────────────────────────────────────── */}
        {tab === 'claims' && (
          <div>
            {patent.filing_status === 'approved' && (
              <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                <span className="text-xl">✅</span>
                <div>
                  <div className="font-semibold text-green-800 text-sm">Claims approved</div>
                  <div className="text-xs text-green-600 mt-0.5">Ready for drawing generation and filing assembly (Phases 4–6).</div>
                </div>
              </div>
            )}

            {patent.claims_status === 'pending' || patent.claims_status === 'generating' ? (
              <div className="bg-white rounded-xl border border-amber-200 p-10 text-center">
                <div className="text-3xl mb-3 animate-pulse">⚙️</div>
                <p className="text-amber-700 text-sm font-semibold mb-1">Your claims draft is being generated…</p>
                <p className="text-gray-400 text-xs">This usually takes 1–2 minutes. Refresh to check progress.</p>
              </div>
            ) : patent.claims_status === 'failed' ? (
              <div className="bg-white rounded-xl border border-red-200 p-10 text-center">
                <div className="text-3xl mb-3">❌</div>
                <p className="text-red-600 text-sm font-semibold mb-1">Generation failed</p>
                <p className="text-gray-400 text-xs">Contact support — your payment was captured and we'll make it right.</p>
              </div>
            ) : !patent.claims_draft ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <div className="text-3xl mb-3">⏳</div>
                <p className="text-gray-500 text-sm font-medium mb-1">No claims draft yet</p>
                <p className="text-gray-400 text-xs">Complete payment through the intake flow to generate your claims draft.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Filing Readiness Score card — FEATURE 1B */}
                {claimsScore && <ScoreCard score={claimsScore} />}

                {/* Pro badge + Deep Research / Refinement actions — FEATURE 1D */}
                <ProBadge />

                {/* Pro AI passes — shown for Pro users, clickable */}
                {!isCollaborator && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
                    <button
                      onClick={async () => {
                        if (!confirm('Run Deep Research Pass? This will strengthen claims using prior art analysis (~2 min).')) return
                        const res = await fetch(`/api/patents/${patent.id}/deep-research`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${authToken}` },
                        })
                        const d = await res.json()
                        if (!res.ok) {
                          if (res.status === 403 && d.upgrade_url) { window.location.href = d.upgrade_url; return }
                          showToast(d.error ?? 'Failed')
                        } else {
                          showToast('🔬 Deep Research Pass started — claims will update in ~2 min')
                          setPatent(prev => prev ? { ...prev, claims_status: 'generating' } : null)
                        }
                      }}
                      disabled={patent.claims_status === ('generating' as string)}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      🔬 Deep Research Pass
                      <span className="text-xs bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">Pro</span>
                    </button>
                    <button
                      onClick={() => showToast('Claude Refinement Pass coming soon — add ANTHROPIC_API_KEY to Vercel to enable')}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors"
                    >
                      ✨ Claude Refinement Pass
                      <span className="text-xs bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded font-bold">Pro</span>
                    </button>
                  </div>
                )}

                {/* Claims viewer — FEATURE 1A: copy buttons */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">AI-Generated Claims Draft</span>
                      {patent.filing_status && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          patent.filing_status === 'approved' ? 'bg-green-100 text-green-700' :
                          patent.filing_status === 'filed' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {patent.filing_status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{patent.claims_draft.length.toLocaleString()} chars</span>
                      <button
                        onClick={() => copyToClipboard(patent.claims_draft!, '📋 All claims copied!')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1f36] text-white rounded-lg text-xs font-semibold hover:bg-[#2d3561] transition-colors"
                      >
                        📋 Copy All
                      </button>
                    </div>
                  </div>
                  <ClaimsText
                    text={patent.claims_draft}
                    onCopy={(claim) => copyToClipboard(claim, '📋 Claim copied!')}
                  />
                </div>

                {/* Action bar */}
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

                    {/* FEATURE 1C: AI-assisted revision chips */}
                    {claimsAction === 'requesting' && (
                      <div className="space-y-4 pt-2 border-t border-gray-100">
                        <h4 className="text-sm font-semibold text-[#1a1f36]">What would you like improved?</h4>
                        <div className="flex flex-wrap gap-2">
                          {REVISION_CHIPS.map((chip) => {
                            const selected = selectedChips.includes(chip.id)
                            return (
                              <button
                                key={chip.id}
                                onClick={() => setSelectedChips(prev =>
                                  selected ? prev.filter(c => c !== chip.id) : [...prev, chip.id]
                                )}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                  selected
                                    ? 'bg-[#1a1f36] text-white border-[#1a1f36]'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-[#1a1f36]'
                                }`}
                              >
                                {chip.label}
                              </button>
                            )
                          })}
                        </div>
                        {selectedChips.includes('custom') && (
                          <textarea
                            value={customNote}
                            onChange={(e) => setCustomNote(e.target.value)}
                            placeholder="Describe what needs to change in detail…"
                            rows={3}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] resize-none"
                          />
                        )}
                        <div className="flex gap-3">
                          <button
                            onClick={requestRevision}
                            disabled={!revisionContentReady || claimsAction !== 'requesting'}
                            className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-40 min-h-[44px]"
                          >
                            Submit Revision Request
                          </button>
                          <button
                            onClick={() => { setClaimsAction('idle'); setSelectedChips([]); setCustomNote('') }}
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

                {/* Re-revision option when approved */}
                {patent.filing_status === 'approved' && (
                  <div className="flex justify-end">
                    <button onClick={() => setClaimsAction('requesting')} className="text-xs text-gray-400 hover:text-gray-600 underline">
                      Request changes
                    </button>
                  </div>
                )}
                {patent.filing_status === 'approved' && claimsAction === 'requesting' && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <h3 className="font-semibold text-[#1a1f36] text-sm">Request changes to approved claims</h3>
                    <div className="flex flex-wrap gap-2">
                      {REVISION_CHIPS.map((chip) => {
                        const selected = selectedChips.includes(chip.id)
                        return (
                          <button key={chip.id} onClick={() => setSelectedChips(prev => selected ? prev.filter(c => c !== chip.id) : [...prev, chip.id])}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selected ? 'bg-[#1a1f36] text-white border-[#1a1f36]' : 'bg-white text-gray-600 border-gray-300 hover:border-[#1a1f36]'}`}>
                            {chip.label}
                          </button>
                        )
                      })}
                    </div>
                    {selectedChips.includes('custom') && (
                      <textarea value={customNote} onChange={(e) => setCustomNote(e.target.value)} placeholder="Describe the changes needed…" rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] resize-none" />
                    )}
                    <div className="flex gap-3">
                      <button onClick={requestRevision} disabled={!revisionContentReady}
                        className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-40 min-h-[44px]">
                        Submit
                      </button>
                      <button onClick={() => { setClaimsAction('idle'); setSelectedChips([]); setCustomNote('') }}
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

        {/* ── FILING TAB ──────────────────────────────────────────────────────── */}
        {tab === 'filing' && (
          <div className="space-y-5">
            {/* 9-step progress tracker */}
            <FilingProgressTracker patent={patent} />

            {/* What's Next guidance card */}
            {(() => {
              const statuses = computeStepStatus(patent)
              const cur = currentStep(statuses)

              const GUIDANCE: Record<number, {
                icon: string; title: string; body: string; action?: { label: string; href?: string; onClick?: () => void }
              }> = {
                4: {
                  icon: '✍️',
                  title: 'Step 4: Approve your claims draft',
                  body: 'Your AI-generated claims are ready. Review them in the Claims tab. When you\'re satisfied, click "Approve Claims" to move forward.',
                  action: { label: 'Go to Claims →', onClick: () => setTab('claims') },
                },
                5: {
                  icon: '📋',
                  title: 'Step 5: Upload your specification document',
                  body: 'A provisional filing requires a written description: Background, Summary, and Detailed Description. Upload your spec below (PDF, DOCX, or MD). Don\'t have one yet? We\'ll help you draft it in a future step.',
                },
                6: {
                  icon: '📐',
                  title: 'Step 6: Upload your drawings / figures',
                  body: 'USPTO provisionals benefit from drawings that illustrate your invention. Upload your figures below (PDF or PNG/JPG). Even rough diagrams help establish your priority date.',
                },
                7: {
                  icon: '📄',
                  title: 'Step 7: Generate and save your cover sheet',
                  body: 'The USPTO cover sheet (Form SB/16) identifies your invention and inventor. We\'ve pre-filled it from your intake data. Open it, review, print or save as PDF, then mark it complete.',
                  action: { label: 'Open Cover Sheet →', href: `/dashboard/patents/${patent.id}/cover-sheet` },
                },
                8: {
                  icon: '🏛️',
                  title: 'Step 8: File with USPTO Patent Center',
                  body: 'You now have your claims, spec, drawings, and cover sheet. Go to patentcenter.uspto.gov, create an account, and file your provisional application. Filing fee: ~$320 (micro entity) or ~$640 (small entity).',
                  action: { label: 'Open USPTO Patent Center ↗', href: 'https://patentcenter.uspto.gov' },
                },
                9: {
                  icon: '🎉',
                  title: 'Patent Pending!',
                  body: 'You\'ve filed your provisional application. Your non-provisional must be filed within 12 months of your provisional filing date to claim priority. Mark it on your calendar.',
                },
              }

              const guide = GUIDANCE[cur]
              if (!guide) return null

              return (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{guide.icon}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-blue-900 text-sm mb-1">{guide.title}</div>
                      <p className="text-sm text-blue-700 leading-relaxed mb-3">{guide.body}</p>
                      {guide.action && (
                        guide.action.href ? (
                          <Link
                            href={guide.action.href}
                            target={guide.action.href.startsWith('http') ? '_blank' : undefined}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                          >
                            {guide.action.label}
                          </Link>
                        ) : (
                          <button
                            onClick={guide.action.onClick}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                          >
                            {guide.action.label}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Step 5: Specification — AI draft or manual upload */}
            {/* draftingSpec + showSpecDraft live at component level — no hooks inside IIFEs */}
            <div className="space-y-3">
              {computeStepStatus(patent)[3] && !patent.spec_uploaded && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                    <span>✨</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">AI Spec Drafting Assistant</span>
                    {patent.spec_draft && <span className="ml-auto text-xs text-green-600 font-semibold">Draft ready</span>}
                  </div>
                  <div className="p-5">
                    {!patent.spec_draft ? (
                      <>
                        <p className="text-sm text-gray-600 mb-4">
                          Don&apos;t have a specification yet? Let AI draft one from your claims. It&apos;ll generate Background, Summary, and Detailed Description sections — you review and refine.
                        </p>
                        <button
                          onClick={async () => {
                            setDraftingSpec(true)
                            try {
                              const res = await fetch(`/api/patents/${patent.id}/draft-spec`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${authToken}` },
                              })
                              const json = await res.json()
                              if (!res.ok) { showToast(`❌ ${json.error}`); return }
                              setPatent(prev => prev ? { ...prev, spec_draft: json.spec_draft } : null)
                              setShowSpecDraft(true)
                              showToast('✅ Spec draft generated — review below')
                            } catch { showToast('❌ Network error') }
                            finally { setDraftingSpec(false) }
                          }}
                          disabled={draftingSpec}
                          className="px-5 py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50 transition-colors"
                        >
                          {draftingSpec ? '⏳ Drafting specification…' : '✨ Draft Specification with AI →'}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm text-gray-600">Your AI-drafted specification is ready. Review, copy to a document, or use it as your upload file.</p>
                          <button
                            onClick={() => setShowSpecDraft(s => !s)}
                            className="ml-4 text-xs text-blue-600 hover:underline flex-shrink-0"
                          >
                            {showSpecDraft ? 'Hide ▲' : 'Show ▼'}
                          </button>
                        </div>
                        {showSpecDraft && (
                          <div className="relative">
                            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono text-gray-700 max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                              {patent.spec_draft}
                            </pre>
                            <button
                              onClick={() => {
                                if (patent.spec_draft) {
                                  navigator.clipboard.writeText(patent.spec_draft)
                                  showToast('📋 Spec draft copied to clipboard')
                                }
                              }}
                              className="absolute top-2 right-2 px-2 py-1 bg-white border border-gray-200 rounded text-xs hover:bg-gray-50"
                            >
                              Copy
                            </button>
                          </div>
                        )}
                        <button
                          onClick={async () => {
                            setDraftingSpec(true)
                            try {
                              const res = await fetch(`/api/patents/${patent.id}/draft-spec`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${authToken}` },
                              })
                              const json = await res.json()
                              if (!res.ok) { showToast(`❌ ${json.error}`); return }
                              setPatent(prev => prev ? { ...prev, spec_draft: json.spec_draft } : null)
                              showToast('✅ Spec draft regenerated')
                            } catch { showToast('❌ Network error') }
                            finally { setDraftingSpec(false) }
                          }}
                          disabled={draftingSpec}
                          className="mt-3 text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
                        >
                          {draftingSpec ? 'Regenerating…' : '🔄 Regenerate'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              <DocumentUploadZone
                type="spec"
                patentId={patent.id}
                authToken={authToken}
                disabled={!computeStepStatus(patent)[3]}
                disabledReason={!computeStepStatus(patent)[3] ? 'Approve claims first (Step 4)' : undefined}
                onSuccess={() => {
                  setPatent(prev => prev ? { ...prev, spec_uploaded: true } : null)
                  showToast('✅ Specification uploaded — Step 5 complete!')
                  loadAll()
                }}
              />
            </div>

            {/* Step 6: Figures upload */}
            {(() => {
              const statuses = computeStepStatus(patent)
              const specUploaded = statuses[4] // step 5
              return (
                <DocumentUploadZone
                  type="figures"
                  patentId={patent.id}
                  authToken={authToken}
                  disabled={!specUploaded}
                  disabledReason={!specUploaded ? 'Upload specification first (Step 5)' : undefined}
                  onSuccess={() => {
                    setPatent(prev => prev ? { ...prev, figures_uploaded: true } : null)
                    showToast('✅ Figures uploaded — Step 6 complete!')
                    loadAll()
                  }}
                />
              )
            })()}

            {/* Step 7: Cover sheet */}
            {(() => {
              const statuses = computeStepStatus(patent)
              const figuresUploaded = statuses[5] // step 6
              const coverDone = patent.cover_sheet_acknowledged

              if (!figuresUploaded && !coverDone) return null

              return (
                <div className={`bg-white rounded-xl border ${coverDone ? 'border-green-200' : 'border-gray-200'} overflow-hidden`}>
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>📄</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Cover Sheet (USPTO Form SB/16)</span>
                    </div>
                    {coverDone && <span className="text-xs font-semibold text-green-700">✅ Complete</span>}
                  </div>
                  <div className="p-5">
                    <p className="text-sm text-gray-600 mb-4">
                      {coverDone
                        ? 'Your cover sheet has been generated and acknowledged. You can regenerate it at any time.'
                        : 'We\'ve pre-filled a cover sheet from your patent data. Open it, review, print or save as PDF, then mark it complete below.'}
                    </p>
                    <div className="flex gap-3 flex-wrap">
                      <Link
                        href={`/dashboard/patents/${patent.id}/cover-sheet`}
                        target="_blank"
                        className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors"
                      >
                        {coverDone ? '🔄 Regenerate Cover Sheet ↗' : '📄 Open Cover Sheet ↗'}
                      </Link>
                      {!coverDone && (
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/patents/${patent.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                              body: JSON.stringify({ cover_sheet_acknowledged: true }),
                            })
                            if (res.ok) {
                              setPatent(prev => prev ? { ...prev, cover_sheet_acknowledged: true } : null)
                              showToast('✅ Cover sheet marked complete — Step 7 done!')
                            }
                          }}
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                        >
                          ✅ I've saved my cover sheet
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── CORRESPONDENCE TAB ──────────────────────────────────────────────── */}
        {tab === 'correspondence' && (
          <div>
            {showCorrespondenceForm && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-[#1a1f36]">Add Correspondence</h2>
                    <button onClick={() => setShowCorrespondenceForm(false)} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
                  </div>
                  <div className="p-5">
                    <CorrespondenceForm patents={allPatents} preselectedPatentId={patent.id} ownerId={ownerId}
                      onSuccess={() => { setShowCorrespondenceForm(false); loadAll() }}
                      onCancel={() => setShowCorrespondenceForm(false)} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {uploadedFiles.length + correspondence.length} record{(uploadedFiles.length + correspondence.length) !== 1 ? 's' : ''} for this patent
              </p>
              <button onClick={() => setShowCorrespondenceForm(true)}
                className="px-3 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors min-h-[44px] flex items-center">
                + Add
              </button>
            </div>

            {/* BUG 1 FIX: Uploaded files section — shown before AI-generated items */}
            {uploadedFiles.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">User Uploaded Documents</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-semibold">{uploadedFiles.length}</span>
                </div>
                <div className="space-y-2">
                  {uploadedFiles.map((file, i) => (
                    <div key={i} className="bg-white rounded-xl border border-amber-100 p-4 flex items-center gap-3">
                      <span className="text-2xl flex-shrink-0">{fileIcon(file.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[#1a1f36] truncate">{file.name}</div>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-xs text-gray-400">{formatBytes(file.size)}</span>
                          <span className="text-xs text-gray-400">
                            {new Date(file.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                      {fileSignedUrls[file.storage_path] ? (
                        <a
                          href={fileSignedUrls[file.storage_path]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 px-3 py-1.5 bg-[#1a1f36] text-white rounded-lg text-xs font-semibold hover:bg-[#2d3561] transition-colors"
                        >
                          View ↗
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">No link</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {correspondence.length === 0 && uploadedFiles.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <div className="text-3xl mb-3">📬</div>
                <p className="text-gray-400 text-sm mb-4">No correspondence for this patent yet.</p>
                <button onClick={() => setShowCorrespondenceForm(true)}
                  className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold min-h-[44px]">
                  Add Record
                </button>
              </div>
            ) : correspondence.length > 0 && (
              <div className="space-y-2">
                {correspondence.map(item => (
                  <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button onClick={() => setExpandedCorr(expandedCorr === item.id ? null : item.id)}
                      className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
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

        {/* ── COLLABORATORS TAB ───────────────────────────────────────────────── */}
        {tab === 'collaborators' && !isCollaborator && (
          <CollaboratorsTab
            patentId={patent.id}
            authToken={authToken}
            collaborators={collaborators}
            onRefresh={loadAll}
          />
        )}

        {/* Save/cancel when editing details */}
        {tab === 'details' && editing && (
          <div className="mt-4 flex gap-3">
            <button onClick={saveEdits} disabled={saving}
              className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] disabled:opacity-50 min-h-[44px]">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => { setEditing(false); setEditData(patent) }}
              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
