'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
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
import UpgradeModal from '@/components/UpgradeModal'
import CollaboratorsTab, { Collaborator } from '@/components/CollaboratorsTab'
import Arc3Modal from '@/components/Arc3Modal'
import DownloadPackageModal from '@/components/DownloadPackageModal'
import MarkFiledModal from '@/components/MarkFiledModal'
import { computeIpReadinessScore, getIpReadinessCriteria } from '@/lib/ip-readiness'
import FilingGuide from '@/components/FilingGuide'
import EnhancementTab from '@/components/EnhancementTab'
import PattieChatDrawer from '@/components/PattieChatDrawer'
import { USPTO_FEES } from '@/lib/uspto-fees'

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

type Tab = 'details' | 'claims' | 'filing' | 'enhancement' | 'correspondence' | 'collaborators' | 'leads'

// ── Revision chips ─────────────────────────────────────────────────────────────
const REVISION_CHIPS = [
  { id: 'broaden', label: 'Broaden the independent claims' },
  { id: 'more_dependent', label: 'Add more dependent claims' },
  { id: 'uspto_language', label: 'Improve USPTO language compliance' },
  { id: 'missing_embodiments', label: 'Add missing embodiments' },
  { id: 'prior_art', label: 'Run prior art check and strengthen novelty' },
  { id: 'custom', label: 'Custom note…' },
]

// ── Research Report Viewer ────────────────────────────────────────────────────
const RESEARCH_PREVIEW_CHARS = 500
function ResearchReportViewer({ content, metadata }: { content: string; metadata: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = React.useState(false)
  const isLong = content.length > RESEARCH_PREVIEW_CHARS
  const displayContent = expanded || !isLong ? content : content.slice(0, RESEARCH_PREVIEW_CHARS) + '…'
  const generatedAt = metadata?.generated_at as string | undefined
  return (
    <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
        <span className="text-sm">🔬</span>
        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">AI Research Report</span>
        {generatedAt && (
          <span className="ml-auto text-xs text-indigo-400">
            {new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
      </div>
      <div className="p-4 text-sm text-gray-800 prose prose-sm prose-headings:text-[#1a1f36] prose-headings:font-bold prose-h2:text-base prose-h2:mt-4 prose-h2:mb-2 max-w-none">
        <ReactMarkdown>{displayContent}</ReactMarkdown>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full text-xs text-indigo-600 hover:text-indigo-800 py-2 border-t border-indigo-100 hover:bg-indigo-50 transition-colors font-medium"
        >
          {expanded ? 'Show less ▲' : 'View full report ▾'}
        </button>
      )}
    </div>
  )
}

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
function ProBadge({ patentId }: { patentId: string }) {
  function handleUpgradeClick() {
    // Store origin patent so we can redirect back after upgrade
    if (typeof window !== 'undefined') {
      localStorage.setItem('pp_upgrade_return_patent', patentId)
    }
  }
  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
        <span className="text-base">⚡</span>
        <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Go Deeper with Pro</span>
      </div>
      <div className="px-5 py-4">
        <ul className="space-y-2 mb-4">
          {[
            'Deep Research Pass (12 min)',
            'Pattie Polish',
            'Unlimited revision rounds',
          ].map(f => (
            <li key={f} className="text-xs text-gray-600 flex items-center gap-2">
              <span className="text-amber-500">•</span> {f}
            </li>
          ))}
        </ul>
        <Link
          href="/pricing"
          onClick={handleUpgradeClick}
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

// ── Abstract Field ────────────────────────────────────────────────────────────
function AbstractField({
  patent,
  authToken,
  canWrite,
  onUpdate,
}: {
  patent: Patent
  authToken: string
  canWrite: boolean
  onUpdate: (val: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(patent.abstract_draft ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const wordCount = value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0
  const isOverLimit = wordCount > 150

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/patents/${patent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ abstract_draft: value.trim() || null }),
      })
      if (res.ok) {
        onUpdate(value.trim() || null)
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${patent.abstract_draft ? 'border-blue-200' : 'border-dashed border-gray-300'}`}>
      <div className={`px-5 py-3 border-b border-gray-100 flex items-center justify-between ${patent.abstract_draft ? 'bg-blue-50' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <span>📝</span>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Abstract</span>
          {patent.abstract_draft
            ? <span className="text-xs text-blue-600 font-semibold">✅ Present</span>
            : <span className="text-xs text-amber-600 font-medium">⚠ Recommended for provisional · Required for non-provisional</span>
          }
          {saved && <span className="text-xs text-green-600 font-semibold ml-2">Saved ✓</span>}
        </div>
        {canWrite && !editing && (
          <button
            onClick={() => { setValue(patent.abstract_draft ?? ''); setEditing(true) }}
            className="text-xs text-indigo-600 hover:underline font-medium"
          >
            {patent.abstract_draft ? 'Edit' : '+ Add Abstract'}
          </button>
        )}
      </div>
      <div className="p-5">
        {editing ? (
          <>
            <textarea
              value={value}
              onChange={e => setValue(e.target.value)}
              rows={6}
              className="w-full text-sm border border-gray-200 rounded-lg p-3 font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="A brief description of the invention — 150 words or less. No claim language. Single paragraph."
            />
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-xs font-medium ${isOverLimit ? 'text-red-600' : wordCount > 130 ? 'text-amber-600' : 'text-gray-400'}`}>
                {wordCount} / 150 words{isOverLimit ? ' — ⚠️ Exceeds USPTO limit' : ''}
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || isOverLimit}
                  className="px-4 py-1.5 bg-[#1a1f36] text-white rounded-lg text-xs font-semibold hover:bg-[#2d3561] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Abstract'}
                </button>
              </div>
            </div>
          </>
        ) : patent.abstract_draft ? (
          <p className="text-sm text-gray-700 leading-relaxed">{patent.abstract_draft}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">
            No abstract yet. Abstracts must be 150 words or less. Required for non-provisional applications.
            {canWrite && (
              <> <button onClick={() => { setValue(''); setEditing(true) }} className="ml-1 text-indigo-500 hover:underline not-italic">Add one now →</button></>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Marketplace Settings Card ─────────────────────────────────────────────────
function MarketplaceSettingsCard({
  patent,
  authToken,
  canWrite,
  onUpdate,
}: {
  patent: Patent
  authToken: string
  canWrite: boolean
  onUpdate: (fields: Partial<Record<string, unknown>>) => void
}) {
  const [open, setOpen]           = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [mktEnabled, setMktEnabled] = useState(
    !!((patent as Record<string, unknown>).marketplace_enabled)
  )
  const [slug, setSlug]           = useState(
    ((patent as Record<string, unknown>).marketplace_slug as string | null) ?? ''
  )
  const [price, setPrice]         = useState(
    ((patent as Record<string, unknown>).asking_price_range as string | null) ?? ''
  )
  const [brief, setBrief]         = useState(
    ((patent as Record<string, unknown>).deal_page_brief as string | null) ?? ''
  )
  const [mktTags, setMktTags]     = useState<string[]>(
    ((patent as Record<string, unknown>).marketplace_tags as string[] | null) ?? []
  )
  const [youtubeUrl, setYoutubeUrl] = useState(
    ((patent as Record<string, unknown>).youtube_embed_url as string | null) ?? ''
  )
  const [tagInput, setTagInput]   = useState('')

  function addTag(raw: string) {
    const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (cleaned && !mktTags.includes(cleaned)) {
      setMktTags(t => [...t, cleaned])
    }
    setTagInput('')
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === 'Backspace' && tagInput === '' && mktTags.length > 0) {
      setMktTags(t => t.slice(0, -1))
    }
  }

  function autoSlug() {
    if (!slug && patent.title) {
      setSlug(patent.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60))
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/patents/${patent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          marketplace_enabled: mktEnabled,
          marketplace_slug: slug.trim() || null,
          asking_price_range: price.trim() || null,
          deal_page_brief: brief.trim() || null,
          marketplace_tags: mktTags,
          youtube_embed_url: youtubeUrl.trim() || null,
          ...(mktEnabled && !(patent as Record<string, unknown>).marketplace_published_at
            ? { marketplace_published_at: new Date().toISOString() }
            : {}),
        }),
      })
      if (res.ok) {
        onUpdate({
          marketplace_enabled: mktEnabled,
          marketplace_slug: slug.trim() || null,
          asking_price_range: price.trim() || null,
          deal_page_brief: brief.trim() || null,
          marketplace_tags: mktTags,
          youtube_embed_url: youtubeUrl.trim() || null,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  const isListed = !!(patent as Record<string, unknown>).marketplace_enabled
  const liveSlug = (patent as Record<string, unknown>).marketplace_slug as string | null

  return (
    <div className={`bg-white rounded-xl border overflow-hidden mt-4 ${isListed ? 'border-purple-200' : 'border-gray-200'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full px-5 py-3 flex items-center justify-between ${isListed ? 'bg-purple-50' : 'bg-gray-50'} border-b border-gray-100`}
      >
        <div className="flex items-center gap-2">
          <span>🏪</span>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Marketplace Settings</span>
          {isListed
            ? <span className="text-xs text-purple-600 font-semibold">✅ Listed</span>
            : <span className="text-xs text-gray-400">Not listed</span>
          }
          {saved && <span className="text-xs text-green-600 font-semibold ml-2">Saved ✓</span>}
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-5 space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-800">List on Marketplace</div>
              <div className="text-xs text-gray-400 mt-0.5">Makes this patent visible at /marketplace/[slug]</div>
            </div>
            <button
              onClick={() => canWrite && setMktEnabled(e => !e)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                mktEnabled ? 'bg-purple-600' : 'bg-gray-200'
              } ${!canWrite ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                mktEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Marketplace Slug</label>
            <div className="flex gap-2">
              <input
                disabled={!canWrite}
                value={slug}
                onChange={e => setSlug(e.target.value)}
                onFocus={autoSlug}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50"
                placeholder="e.g. light-communication-system"
              />
            </div>
            {liveSlug && (
              <a href={`/marketplace/${liveSlug}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-purple-600 hover:underline mt-1 inline-block">
                /marketplace/{liveSlug} →
              </a>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Asking Price / Terms</label>
            <input
              disabled={!canWrite}
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50"
              placeholder='e.g. "$50K–$200K" or "Open to offers"'
            />
          </div>

          {/* Brief */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Deal Page Brief</label>
            <p className="text-xs text-gray-400 mb-1.5">Plain language summary. Pattie can draft this for you.</p>
            <textarea
              disabled={!canWrite}
              value={brief}
              onChange={e => setBrief(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50"
              placeholder="Describe the technology and its applications in plain language…"
            />
          </div>

          {/* Search Tags */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Search Tags</label>
            <p className="text-xs text-gray-400 mb-1.5">Type a tag and press Enter or comma to add. Click × to remove.</p>
            <div className={`flex flex-wrap gap-1.5 items-center min-h-[38px] px-3 py-1.5 border border-gray-200 rounded-lg bg-white ${!canWrite ? 'bg-gray-50' : ''} focus-within:ring-2 focus-within:ring-purple-300`}>
              {mktTags.map(t => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-100">
                  #{t}
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => setMktTags(tags => tags.filter(x => x !== t))}
                      className="text-indigo-400 hover:text-indigo-700 leading-none"
                    >×</button>
                  )}
                </span>
              ))}
              {canWrite && (
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => tagInput && addTag(tagInput)}
                  className="flex-1 min-w-[80px] text-sm outline-none bg-transparent py-0.5"
                  placeholder={mktTags.length === 0 ? 'e.g. IoT, energy, wireless…' : ''}
                />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">{mktTags.length} tag{mktTags.length !== 1 ? 's' : ''} · 3+ unlocks 5 IP Readiness points</p>
          </div>

          {/* YouTube Video URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">YouTube Video URL</label>
            <p className="text-xs text-gray-400 mb-1.5">Appears as the "Watch Overview" embed on the public deal page.</p>
            <input
              disabled={!canWrite}
              value={youtubeUrl}
              onChange={e => setYoutubeUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50"
              placeholder="https://www.youtube.com/watch?v=..."
            />
            {youtubeUrl && (() => {
              const match = youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
              return match
                ? <p className="text-xs text-green-600 mt-1">✓ Valid YouTube URL — video ID: {match[1]}</p>
                : <p className="text-xs text-amber-500 mt-1">⚠ Could not detect a YouTube video ID in this URL</p>
            })()}
          </div>

          {/* IP Readiness Score */}
          {(() => {
            const scoreInput = {
              provisional_filed_at: (patent as Record<string, unknown>).provisional_filed_at as string | null,
              filing_status: (patent as Record<string, unknown>).filing_status as string | null,
              spec_draft: (patent as Record<string, unknown>).spec_draft as string | null,
              claims_draft: (patent as Record<string, unknown>).claims_draft as string | null,
              abstract_draft: (patent as Record<string, unknown>).abstract_draft as string | null,
              figures: (patent as Record<string, unknown>).figures as unknown[] | null,
              deal_page_brief: brief,
              marketplace_tags: mktTags,
              asking_price_range: price || null,
            }
            const score = computeIpReadinessScore(scoreInput)
            const criteria = getIpReadinessCriteria(scoreInput)
            return (
              <div className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">IP Readiness Score</span>
                  <span className={`text-sm font-extrabold ${score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-orange-500'}`}>
                    {score} / 100
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full transition-all ${score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-400' : 'bg-orange-400'}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <div className="space-y-1">
                  {criteria.map(c => (
                    <div key={c.label} className="flex items-center justify-between text-xs">
                      <span className={c.met ? 'text-gray-700' : 'text-gray-400'}>
                        {c.met ? '✅' : '❌'} {c.label}
                      </span>
                      <span className={c.met ? 'text-green-600 font-semibold' : 'text-gray-300'}>
                        +{c.points}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {canWrite && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Marketplace Settings'}
            </button>
          )}
        </div>
      )}
    </div>
  )
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
  const [showRefineInterceptModal, setShowRefineInterceptModal] = useState(false)
  const [showCoverSaveModal, setShowCoverSaveModal] = useState(false)
  const [coverSaveLoading, setCoverSaveLoading] = useState(false)
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [customNote, setCustomNote] = useState('')
  const [claimsMsg, setClaimsMsg] = useState('')
  const [showCorrespondenceForm, setShowCorrespondenceForm] = useState(false)
  const [expandedCorr, setExpandedCorr] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [isPro, setIsPro] = useState(false)
  const [isAttorney, setIsAttorney] = useState(false)
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null)
  const [figureUrls, setFigureUrls] = useState<Array<{ number: number; label: string; filename: string; url: string }>>([])
  const [figuresLoaded, setFiguresLoaded] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartRef = useRef<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isCollaborator, setIsCollaborator] = useState(false)
  const [collaboratorRole, setCollaboratorRole] = useState<string | null>(null)
  const [collabPerms, setCollabPerms] = useState<Record<string, boolean>>({})
  const [collabCanEdit, setCollabCanEdit] = useState(false)
  const [collabId, setCollabId] = useState<string | null>(null)
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [showArc3Modal, setShowArc3Modal] = useState(false)
  const [showArc3Interview, setShowArc3Interview] = useState(false)
  const [showPattie, setShowPattie] = useState(false)
  const [arc3Slug, setArc3Slug] = useState<string | null>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showMarkFiledModal, setShowMarkFiledModal] = useState(false)
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
    if (user.email) setUserEmail(user.email)

    const { data: { session: authSession } } = await supabase.auth.getSession()
    if (authSession?.access_token) setAuthToken(authSession.access_token)
    const token = authSession?.access_token ?? ''

    const [{ data: p }, { data: d }, { data: c }, { data: ap }, { data: profileData }] = await Promise.all([
      supabase.from('patents').select('*').eq('id', id).single(),
      supabase.from('patent_deadlines').select('*').eq('patent_id', id).order('due_date', { ascending: true }),
      supabase.from('patent_correspondence').select('*').eq('patent_id', id).order('correspondence_date', { ascending: false }),
      supabase.from('patents').select('*').order('title'),
      supabase.from('patent_profiles').select('subscription_status,subscription_period_end,is_attorney').eq('id', user.id).single(),
    ])

    // Determine Pro status from fresh DB read (not stale session token)
    const periodEnd = profileData?.subscription_period_end
    const status = profileData?.subscription_status ?? 'free'
    const proActive = status === 'complimentary' ||
      (status === 'pro' && (!periodEnd || new Date(periodEnd) > new Date()))
    setIsPro(proActive)
    setIsAttorney(profileData?.is_attorney ?? false)

    if (!p) { router.push('/dashboard/patents'); return }

    // Detect if user is a collaborator (not the owner)
    const isOwner = p.owner_id === user.id
    if (!isOwner) {
      // Check collaborator record
      const { data: collabRecord } = await supabase
        .from('patent_collaborators')
        .select('id, role, can_edit')
        .eq('patent_id', id)
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .single()
      if (collabRecord) {
        setIsCollaborator(true)
        setCollaboratorRole(collabRecord.role)
        setCollabCanEdit(collabRecord.can_edit ?? false)
        setCollabId(collabRecord.id)
        // Load permission matrix for this role
        try {
          const permRes = await fetch(`/api/role-permissions?role=${collabRecord.role}`)
          if (permRes.ok) {
            const permData = await permRes.json()
            setCollabPerms(permData.permissions ?? {})
          }
        } catch {
          // fail open — show all tabs if permissions can't be loaded
        }
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

    // Load figure signed URLs if figures have been generated
    if (p?.figures_uploaded && token) {
      fetch(`/api/patents/${p.id}/generate-figures`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(d => {
        if (d.figures?.length) setFigureUrls(d.figures)
        setFiguresLoaded(true)
      }).catch(() => setFiguresLoaded(true))
    } else {
      setFiguresLoaded(true)
    }
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

  // Handle post-upgrade return from Stripe — show toast + refresh Pro state
  useEffect(() => {
    if (searchParams.get('upgrade') === 'success') {
      showToast("🎉 You're now Pro! All features unlocked.")
      setIsPro(true)
      // Re-run full load to get fresh subscription state
      loadAll()
      // Clean URL without triggering navigation
      const url = new URL(window.location.href)
      url.searchParams.delete('upgrade')
      window.history.replaceState({}, '', url.toString())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Auto-poll claims_status while generating/refining — clears when done or timed out
  useEffect(() => {
    const POLL_STATUSES = ['pending', 'generating', 'refining']
    const POLL_INTERVAL_MS = 15_000
    const MAX_POLL_MS = 15 * 60 * 1_000 // 15 min timeout

    if (!patent || !authToken) return
    const isActive = POLL_STATUSES.includes(patent.claims_status ?? '')

    if (isActive) {
      if (!pollStartRef.current) pollStartRef.current = Date.now()
      if (pollRef.current) return // already polling

      pollRef.current = setInterval(async () => {
        const elapsed = Date.now() - (pollStartRef.current ?? Date.now())
        if (elapsed > MAX_POLL_MS) {
          // Timed out client-side — update DB to failed
          clearInterval(pollRef.current!); pollRef.current = null; pollStartRef.current = null
          await fetch(`/api/patents/${patent.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ claims_status: 'failed' }),
          })
          setPatent(prev => prev ? { ...prev, claims_status: 'failed' } : null)
          return
        }

        // Poll DB for status change
        const { data: fresh } = await supabase
          .from('patents')
          .select('claims_status, claims_draft, claims_draft_pre_refine')
          .eq('id', patent.id)
          .single()

        if (!fresh) return
        if (!POLL_STATUSES.includes(fresh.claims_status ?? '')) {
          clearInterval(pollRef.current!); pollRef.current = null; pollStartRef.current = null
          setPatent(prev => prev ? {
            ...prev,
            claims_status: fresh.claims_status,
            claims_draft: fresh.claims_draft ?? prev.claims_draft,
            claims_draft_pre_refine: fresh.claims_draft_pre_refine ?? prev.claims_draft_pre_refine,
          } : null)
          if (fresh.claims_status === 'complete' || fresh.claims_status === 'refined') {
            showToast('✅ Claims updated! Scroll down to review.')
          } else if (fresh.claims_status === 'failed') {
            showToast('⚠️ Generation failed — you can retry from the Claims tab.')
          }
        }
      }, POLL_INTERVAL_MS)
    } else {
      // Status is stable — clear poll if running
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      pollStartRef.current = null
    }

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patent?.claims_status, authToken])

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
    // Fix B: intercept approve when a refinement result exists and hasn't been accepted/reverted
    if ((patent.claims_status as string) === 'refined' && (patent as any).claims_draft_pre_refine) {
      setShowRefineInterceptModal(true)
      return
    }
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

  async function refinementAction(action: 'accept' | 'revert' | 'dismiss') {
    if (!patent || !authToken) return
    setShowRefineInterceptModal(false)
    const res = await fetch(`/api/patents/${patent.id}/refinement-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error ?? 'Action failed'); return }
    if (action === 'accept' || action === 'dismiss') {
      setPatent(prev => prev ? {
        ...prev,
        claims_draft_pre_refine: null,
        claims_status: 'complete',
        filing_status: 'approved',
      } : null)
      showToast('✅ Refinement accepted — claims re-approved.')
    } else if (action === 'revert') {
      setPatent(prev => prev ? {
        ...prev,
        claims_draft: (prev as any).claims_draft_pre_refine,
        claims_draft_pre_refine: null,
        claims_status: 'complete',
        filing_status: 'draft',
      } : null)
      showToast('↩ Refinement reverted — original claims restored.')
    }
  }

  /** Client-side diff: compare two claim texts and return change bullets */
  function generateRefineSummary(original: string, refined: string): string[] {
    const splitClaims = (text: string): Record<number, string> => {
      const result: Record<number, string> = {}
      const matches = [...text.matchAll(/^(\d+)\.\s/gm)]
      for (let i = 0; i < matches.length; i++) {
        const num = parseInt(matches[i][1])
        const start = matches[i].index! + matches[i][0].length
        const end = i + 1 < matches.length ? matches[i + 1].index! : text.length
        result[num] = text.slice(start, end).trim()
      }
      return result
    }
    const origClaims = splitClaims(original)
    const refClaims = splitClaims(refined)
    const allNums = Array.from(new Set([
      ...Object.keys(origClaims).map(Number),
      ...Object.keys(refClaims).map(Number),
    ])).sort((a, b) => a - b)
    const bullets: string[] = []
    for (const num of allNums) {
      const orig = origClaims[num]
      const ref = refClaims[num]
      if (!orig && ref) { bullets.push(`Claim ${num} — new claim added`); continue }
      if (orig && !ref) { bullets.push(`Claim ${num} — claim removed`); continue }
      if (orig === ref) continue
      const origLen = orig.split(/\s+/).length
      const refLen  = ref.split(/\s+/).length
      const delta   = refLen - origLen
      // Check for specific patterns
      const origLower = orig.toLowerCase()
      const refLower  = ref.toLowerCase()
      if (delta > 10) {
        bullets.push(`Claim ${num} — expanded with additional qualifying language`)
      } else if (delta < -10) {
        bullets.push(`Claim ${num} — simplified and tightened`)
      } else if (origLower.includes('glasses') && !refLower.includes('glasses')) {
        bullets.push(`Claim ${num} — broadened from "glasses" to "head-mounted apparatus"`)
      } else if (origLower.includes('closed eyelids') && refLower.includes('eyelids') && !refLower.includes('closed')) {
        bullets.push(`Claim ${num} — "closed eyelids" simplified to "eyelids" (broader)`)
      } else if (delta > 0) {
        bullets.push(`Claim ${num} — language refined (+${delta} words)`)
      } else if (delta < 0) {
        bullets.push(`Claim ${num} — language refined (${delta} words)`)
      } else {
        bullets.push(`Claim ${num} — phrasing polished`)
      }
    }
    return bullets.length > 0 ? bullets : ['Minor language refinements throughout']
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

  // Post-filing: show NP deadline; pre-filing: show provisional filing deadline
  const isProvisionalFiled = patent.filing_status === 'provisional_filed' || patent.filing_status === 'nonprov_filed'
  const deadline = isProvisionalFiled && (patent as Record<string, unknown>).nonprov_deadline_at
    ? ((patent as Record<string, unknown>).nonprov_deadline_at as string).split('T')[0]
    : patent.provisional_deadline
  const deadlineLabel = isProvisionalFiled ? 'Non-provisional deadline' : 'Provisional filing deadline'
  const days = deadline ? getDaysUntil(deadline) : null
  const claimsScore = patent.claims_score as ClaimsScore | null
  const revisionContentReady = selectedChips.some(c => c !== 'custom') || customNote.trim().length > 0

  // Write access:
  //   owners: can write unless patent is locked
  //   collaborators: can write only if can_edit=true AND patent is not locked
  const isLocked = patent.is_locked ?? false
  const isGranted = patent.status === 'granted'
  const canWrite = !isLocked && (!isCollaborator || collabCanEdit)
  // Claims are always read-only for granted patents (issued — nothing to edit)
  const claimsReadOnly = isGranted || !canWrite

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

        {/* Research Import banner */}
        {patent.status === 'research_import' && (
          <div className="mb-5 bg-purple-50 border border-purple-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">🔬</span>
            <div>
              <p className="text-sm font-bold text-purple-800">Research Import — Not a Filed Patent</p>
              <p className="text-xs text-purple-700 mt-0.5 leading-relaxed">
                This record was imported from the autoresearch tool for analysis purposes. It has{' '}
                <strong>not been filed</strong> with the USPTO and is not part of your active portfolio.
                Edit the record, add specification and claims, and change the status to begin a real filing.
              </p>
              <div className="flex gap-3 mt-2.5 flex-wrap">
                <Link
                  href="/admin/research"
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900 underline underline-offset-2"
                >
                  ← Back to Research Tool
                </Link>
                <span className="text-xs text-purple-400">|</span>
                <a
                  href={`https://patents.google.com/patent/${patent.patent_number ?? ''}/en`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900 underline underline-offset-2"
                >
                  View Original on Google Patents →
                </a>
              </div>
            </div>
          </div>
        )}

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
                onClick={() => { if (canWrite) { setTitleDraft(patent.title); setEditingTitle(true) } }}
                title={canWrite ? 'Click to edit title' : isLocked ? 'Patent is locked' : undefined}
              >
                <h1 className="text-lg sm:text-2xl font-bold text-[#1a1f36] leading-snug">{patent.title}</h1>
                {isLocked
                  ? <span className="text-base flex-shrink-0" title="Patent is locked — read only">🔒</span>
                  : <span className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 text-sm flex-shrink-0">✏️</span>
                }
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[patent.status] || 'bg-gray-100 text-gray-800'}`}>
                {patent.status.replace('_', ' ')}
              </span>
              {!isGranted && days !== null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(days)}`}>
                  {days <= 0 ? 'DEADLINE OVERDUE' : `${deadlineLabel} · ${days}d`}
                </span>
              )}
              {/* Granted ✓ badge removed — status pill ("granted") is sufficient */}
            </div>
            {/* Inline lock suggestion for granted + unlocked patents (owner only) */}
            {isGranted && !isLocked && !isCollaborator && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span>💡 Issued patents are typically locked from editing.</span>
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/patents/${patent.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                      body: JSON.stringify({ is_locked: true }),
                    })
                    if (res.ok) setPatent(prev => prev ? { ...prev, is_locked: true } : null)
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2"
                >
                  Lock this patent?
                </button>
              </div>
            )}
          </div>
          {tab === 'details' && !isCollaborator && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Lock/Unlock toggle — owner, details tab only */}
              {!isLocked ? (
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/patents/${patent.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                      body: JSON.stringify({ is_locked: true }),
                    })
                    if (res.ok) { setPatent(prev => prev ? { ...prev, is_locked: true } : null); setEditing(false) }
                  }}
                  className="flex-shrink-0 px-3 py-2 border border-gray-300 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-50 hover:text-gray-700 transition-colors min-h-[44px]"
                  title="Lock this patent — disables all editing"
                >
                  🔒 Lock
                </button>
              ) : null}
              {canWrite && (
                <button
                  onClick={() => editing ? saveEdits() : setEditing(true)}
                  disabled={saving}
                  className="flex-shrink-0 px-3 sm:px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {saving ? 'Saving...' : editing ? 'Save' : 'Edit'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Deadline Alert — suppressed for granted patents (no prosecution deadline) */}
        {!isGranted && days !== null && days <= 48 && (
          <div className={`mb-5 p-4 rounded-xl border flex items-start gap-3 ${days <= 30 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
            <span className="text-xl flex-shrink-0">{days <= 30 ? '🚨' : '⚠️'}</span>
            <div>
              <div className={`font-semibold text-sm ${days <= 30 ? 'text-red-800' : 'text-yellow-800'}`}>
                {days <= 0 ? 'DEADLINE OVERDUE' : `${deadlineLabel} in ${days} days`}
              </div>
              <div className={`text-xs mt-0.5 ${days <= 30 ? 'text-red-600' : 'text-yellow-600'}`}>
                Due: {new Date(deadline! + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>
        )}

        {/* 🔒 Locked banner — everyone sees this when is_locked=true */}
        {isLocked && (
          <div className="mb-4 px-4 py-3 bg-slate-100 border border-slate-300 rounded-xl flex items-center gap-3">
            <span className="text-xl">🔒</span>
            <div className="flex-1">
              <span className="text-sm font-semibold text-slate-800">This patent is locked.</span>
              <span className="text-sm text-slate-600 ml-2">All editing is disabled. Only the owner can unlock it.</span>
            </div>
            {/* Owner can unlock */}
            {!isCollaborator && (
              <button
                onClick={async () => {
                  const res = await fetch(`/api/patents/${patent.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                    body: JSON.stringify({ is_locked: false }),
                  })
                  if (res.ok) setPatent(prev => prev ? { ...prev, is_locked: false } : null)
                }}
                className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 transition-colors font-medium flex-shrink-0"
              >
                Unlock
              </button>
            )}
          </div>
        )}

        {/* Co-inventor read-only / can-edit banner */}
        {isCollaborator && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <span className="text-amber-500 text-lg">{collabCanEdit ? '✏️' : '👁'}</span>
            <div>
              <span className="text-sm font-semibold text-amber-800">{collabCanEdit ? 'Edit Access' : 'Read-Only Access'}</span>
              <span className="text-sm text-amber-700 ml-2">
                You are viewing this patent as a{' '}
                <span className="font-semibold capitalize">{collaboratorRole?.replace('_', '-') ?? 'collaborator'}</span>.
                {!collabCanEdit && ' Contact the patent owner to make changes.'}
              </span>
            </div>
          </div>
        )}

        {/* Tabs */}
        {/* canView: owners see all; collaborators use permission matrix */}
        {(() => {
          const canView = (feature: string) => !isCollaborator || (collabPerms[feature] ?? false)
          const arc3Active = !!(patent as Patent & { arc3_active?: boolean }).arc3_active
          const isFiled = patent.filing_status === 'provisional_filed' || patent.filing_status === 'nonprov_filed'
          const visibleTabs: Tab[] = (['details', 'claims', 'filing', 'correspondence', 'collaborators', 'leads', 'enhancement'] as Tab[])
            .filter(t => {
              if (t === 'filing' && isGranted) return false  // no filing workflow for issued patents
              if (t === 'enhancement') return !isCollaborator && isFiled  // owner-only, post-filing only
              if (t === 'leads') return !isCollaborator && arc3Active  // owner-only, only when Marketplace active
              if (t === 'collaborators') return !isCollaborator || canView('collaborators')
              return canView(t)
            })
          return (
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-full sm:w-auto sm:inline-flex flex-wrap sm:flex-nowrap">
          {visibleTabs.map(t => (
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
                ) : t === 'enhancement' ? '✨ Enhancement'
                : t === 'details' ? 'Overview'
                : 'Details'
              }
            </button>
          ))}
        </div>
          ) // end visibleTabs return
        })(/* canView IIFE */)}

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
                    { label: 'USPTO Customer #', key: 'uspto_customer_number', value: (patent as Record<string, unknown>).uspto_customer_number as string || '—' },
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
              {/* Maintenance fees for granted patents — replaces prosecution deadlines */}
              {isGranted ? (() => {
                const baseDate = patent.filing_date  // approximation; grant date preferred but not in schema yet
                if (!baseDate) return (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="font-semibold text-[#1a1f36] mb-2">Maintenance Fees</h2>
                    <p className="text-xs text-gray-400">Add a filing date to calculate maintenance fee schedule.</p>
                  </div>
                )
                const base = new Date(baseDate + 'T00:00:00')
                const addYearsMonths = (d: Date, years: number, months: number) => {
                  const n = new Date(d)
                  n.setFullYear(n.getFullYear() + years)
                  n.setMonth(n.getMonth() + months)
                  return n
                }
                const fees = [
                  { label: '3.5-Year Fee', due: addYearsMonths(base, 3, 6) },
                  { label: '7.5-Year Fee', due: addYearsMonths(base, 7, 6) },
                  { label: '11.5-Year Fee', due: addYearsMonths(base, 11, 6) },
                ]
                return (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="font-semibold text-[#1a1f36] mb-1">Maintenance Fees</h2>
                    <p className="text-xs text-gray-400 mb-4">Fees must be paid to USPTO to keep this patent in force.</p>
                    <div className="space-y-3">
                      {fees.map((f) => {
                        const dueStr = f.due.toISOString().split('T')[0]
                        const ddays = getDaysUntil(dueStr)
                        const isPaid = false  // TODO Prompt later: track payment
                        const statusLabel = isPaid ? 'Paid' : ddays <= 0 ? 'Overdue' : 'Due'
                        const statusColor = isPaid ? 'bg-green-100 text-green-700' : ddays <= 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        return (
                          <div key={f.label} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-[#1a1f36]">{f.label}</div>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {f.due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <button className="mt-1 text-xs text-indigo-500 hover:text-indigo-700">💡 Mark as paid (coming soon)</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })() : (
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
              )}

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

              {/* Task 2B: Cover Sheet quick-access in Details sidebar */}
              {(patent.filing_status === 'approved' || patent.filing_status === 'filed' || patent.cover_sheet_acknowledged) && (
                <div className={`rounded-xl border p-4 ${patent.cover_sheet_acknowledged ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold text-[#1a1f36] text-sm flex items-center gap-1.5">
                      📄 Cover Sheet
                      {patent.cover_sheet_acknowledged && <span className="text-xs text-green-600 font-normal">✅ Complete</span>}
                    </h2>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    {patent.cover_sheet_acknowledged
                      ? 'Your ADS cover sheet has been generated. Open to edit or regenerate.'
                      : 'Claims approved — generate your USPTO Application Data Sheet.'}
                  </p>
                  <Link
                    href={`/dashboard/patents/${patent.id}/cover-sheet`}
                    className={`inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      patent.cover_sheet_acknowledged
                        ? 'bg-green-700 text-white hover:bg-green-800'
                        : 'bg-[#1a1f36] text-white hover:bg-[#2d3561]'
                    }`}
                  >
                    {patent.cover_sheet_acknowledged ? '🔄 Edit Cover Sheet ↗' : '📄 Open Cover Sheet ↗'}
                  </Link>
                </div>
              )}

              {/* ── Marketplace: Deal Page ─────────────────────────────────────── */}
              {/* Figures summary in Details sidebar */}
              {patent.figures_uploaded && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-[#1a1f36] text-sm">Figures</h2>
                    <button
                      onClick={() => setTab('filing')}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      View all →
                    </button>
                  </div>
                  {figureUrls.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      {figureUrls.slice(0, 6).map(fig => (
                        <a key={fig.number} href={fig.url} target="_blank" rel="noreferrer" title={fig.label}>
                          <img
                            src={fig.url}
                            alt={fig.label}
                            className="w-full h-16 object-contain bg-gray-50 rounded border border-gray-100 hover:opacity-80 transition-opacity"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Figures uploaded — click "View all" to access</p>
                  )}
                </div>
              )}

              {!isCollaborator && (
                <div className={`rounded-xl border p-5 ${
                  (patent as Patent & { arc3_active?: boolean }).arc3_active
                    ? 'border-green-200 bg-green-50'
                    : 'border-indigo-100 bg-indigo-50'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🏛️</span>
                    <h2 className="font-semibold text-[#1a1f36] text-sm">Marketplace</h2>
                  <p className="text-xs text-gray-400 mt-0.5">List your patent. Reach licensees, OEMs, and acquirers.</p>
                  </div>
                  {(patent as Patent & { arc3_active?: boolean }).arc3_active ? (
                    <div>
                      <div className="text-xs text-green-700 font-semibold mb-2">✅ Deal page active</div>
                      {(() => {
                        const mktSlug = (patent as Record<string, unknown>).marketplace_slug as string | null
                        return mktSlug ? (
                          <a
                            href={`/marketplace/${mktSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 underline block mb-2"
                          >
                            View public deal page →
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 block mb-2">Set a marketplace slug to enable the public deal page</span>
                        )
                      })()}
                      {/* Research plan trigger */}
                      {(() => {
                        const researchStatus = (patent as Patent & { marketplace_research_status?: string }).marketplace_research_status
                        const brief = (patent as Patent & { deal_page_brief?: Record<string, string> }).deal_page_brief
                        if (researchStatus === 'complete') {
                          return <p className="text-xs text-green-600 mt-1">📊 Research plan ready — see Correspondence tab</p>
                        }
                        if (researchStatus === 'pending') {
                          return <p className="text-xs text-gray-400 mt-1 animate-pulse">⏳ Generating research plan…</p>
                        }
                        if (brief) {
                          return (
                            <button
                              onClick={async () => {
                                setPatent(prev => prev ? { ...prev, marketplace_research_status: 'pending' } as typeof prev : null)
                                await fetch(`/api/patents/${patent.id}/marketplace/research`, {
                                  method: 'POST',
                                  headers: { Authorization: `Bearer ${authToken}` },
                                })
                                setPatent(prev => prev ? { ...prev, marketplace_research_status: 'complete' } as typeof prev : null)
                                setTab('correspondence')
                              }}
                              className="text-xs text-indigo-600 underline mt-1 block text-left hover:text-indigo-800"
                            >
                              📊 Generate research plan →
                            </button>
                          )
                        }
                        return null
                      })()}
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

        {/* Fix B: Refine intercept modal — shown when user clicks Approve while refinement exists */}
        {showRefineInterceptModal && patent && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-[#1a1f36] mb-1">Before you approve — AI Refinement available</h3>
              <p className="text-sm text-gray-600 mb-4">
                An Pattie Polish has already run on these claims. You can review the language improvements before locking them in. This won't change your inventive concepts — just sharpen the legal wording.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowRefineInterceptModal(false)
                    // Scroll to the change summary / before-after panel
                    document.getElementById('claims-orig-panel')?.classList.remove('hidden')
                    document.getElementById('claims-orig-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                  className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Review Refinement
                </button>
                <button
                  onClick={() => refinementAction('dismiss')}
                  className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Approve Anyway (keep refinement, skip review)
                </button>
                <button
                  onClick={() => setShowRefineInterceptModal(false)}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cover sheet save modal — Step 7 "Mark as Done" intercept */}
        {showCoverSaveModal && patent && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-[#1a1f36] mb-1">Save cover sheet info to profile?</h3>
              <p className="text-sm text-gray-600 mb-5">
                Your name, address, and USPTO customer number from the cover sheet can be saved to your profile for future filings. Or just mark it complete without saving.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  disabled={coverSaveLoading}
                  onClick={async () => {
                    setCoverSaveLoading(true)
                    try {
                      // Fetch current profile data to use as inventor fields
                      const profRes = await fetch('/api/users/profile', {
                        headers: { Authorization: `Bearer ${authToken}` },
                      })
                      const { profile: prof } = profRes.ok ? await profRes.json() : { profile: null }
                      // POST cover-sheet/save with current profile data
                      await fetch('/api/cover-sheet/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                        body: JSON.stringify({
                          patent_id:       patent.id,
                          save_to_profile: true,
                          inventor: {
                            name_first:            prof?.name_first      ?? '',
                            name_middle:           prof?.name_middle     ?? '',
                            name_last:             prof?.name_last       ?? '',
                            address_line_1:        prof?.address_line_1  ?? '',
                            address_line_2:        prof?.address_line_2  ?? '',
                            city:                  prof?.city            ?? '',
                            state:                 prof?.state           ?? '',
                            zip:                   prof?.zip             ?? '',
                            country:               prof?.country         ?? 'US',
                            phone:                 prof?.phone           ?? '',
                            uspto_customer_number: prof?.uspto_customer_number ?? '',
                          },
                          // Preserve assignee defaults from profile
                          assignee_name:    prof?.default_assignee_name    ?? null,
                          assignee_address: prof?.default_assignee_address ?? null,
                        }),
                      })
                      setPatent(prev => prev ? { ...prev, cover_sheet_acknowledged: true } : null)
                      showToast('✅ Profile saved + Step 7 complete!')
                    } catch {
                      // Fallback: just mark acknowledged
                      await fetch(`/api/patents/${patent.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                        body: JSON.stringify({ cover_sheet_acknowledged: true }),
                      })
                      setPatent(prev => prev ? { ...prev, cover_sheet_acknowledged: true } : null)
                      showToast('✅ Cover sheet marked complete — Step 7 done!')
                    } finally {
                      setCoverSaveLoading(false)
                      setShowCoverSaveModal(false)
                    }
                  }}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors"
                >
                  {coverSaveLoading ? 'Saving…' : 'Save Profile & Mark Complete'}
                </button>
                <button
                  disabled={coverSaveLoading}
                  onClick={async () => {
                    setCoverSaveLoading(true)
                    const res = await fetch(`/api/patents/${patent.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                      body: JSON.stringify({ cover_sheet_acknowledged: true }),
                    })
                    if (res.ok) {
                      setPatent(prev => prev ? { ...prev, cover_sheet_acknowledged: true } : null)
                      showToast('✅ Cover sheet marked complete — Step 7 done!')
                    }
                    setCoverSaveLoading(false)
                    setShowCoverSaveModal(false)
                  }}
                  className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Mark Done Without Saving
                </button>
                <button
                  onClick={() => setShowCoverSaveModal(false)}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Marketplace activation modal */}
        {showMarkFiledModal && patent && authToken && (
          <MarkFiledModal
            patent={patent}
            authToken={authToken}
            onClose={() => setShowMarkFiledModal(false)}
            onFiled={(updated) => {
              setPatent(prev => prev ? { ...prev, ...updated } : null)
              setShowMarkFiledModal(false)
            }}
          />
        )}

        {showDownloadModal && patent && authToken && (
          <DownloadPackageModal
            patent={patent}
            authToken={authToken}
            onClose={() => setShowDownloadModal(false)}
          />
        )}

        {showArc3Modal && patent && (
          <Arc3Modal
            patentId={patent.id}
            patentTitle={patent.title}
            authToken={authToken}
            onSuccess={(slug, _url) => {
              setArc3Slug(slug)
              setShowArc3Modal(false)
              setPatent(prev => prev ? { ...prev, arc3_active: true } as typeof prev : null)
              showToast('🏛️ Marketplace activated! Deal page is live.')
              // Trigger Pattie interview to build deal page brief
              setShowArc3Interview(true)
            }}
            onClose={() => setShowArc3Modal(false)}
          />
        )}

        {/* ── ARC 3 ONBOARDING INTERVIEW MODAL ────────────────────────────────── */}
        {showArc3Interview && patent && authToken && (
          <Arc3InterviewModal
            patentId={patent.id}
            patentTitle={patent.title}
            authToken={authToken}
            onClose={() => {
              setShowArc3Interview(false)
              setTab('leads')
            }}
          />
        )}

        {/* ── LEADS TAB ───────────────────────────────────────────────────────── */}
        {tab === 'leads' && (
          <LeadsPanel patentId={patent.id} authToken={authToken} />
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

            {(patent.claims_status === 'pending' || patent.claims_status === 'generating' || patent.claims_status === 'refining') ? (
              <div className="bg-white rounded-xl border border-amber-200 p-10 text-center">
                <div className="text-3xl mb-3 animate-pulse">
                  {patent.claims_status === 'refining' ? '✨' : '🔬'}
                </div>
                <p className="text-amber-700 text-sm font-semibold mb-1">
                  {patent.claims_status === 'refining'
                    ? 'Pattie Polish in progress…'
                    : patent.claims_status === 'generating'
                    ? 'Deep Research Pass in progress…'
                    : 'Generating your claims draft…'}
                </p>
                <p className="text-gray-500 text-xs mb-2">
                  {patent.claims_status === 'refining'
                    ? 'This usually takes 2–4 minutes.'
                    : patent.claims_status === 'generating'
                    ? 'This usually takes 8–12 minutes.'
                    : 'This usually takes 1–2 minutes.'}
                  {' '}This page will update automatically.
                </p>
                {userEmail && (
                  <p className="text-indigo-600 text-xs">
                    ✉️ We&apos;ll email you at <strong>{userEmail}</strong> when it&apos;s ready. Safe to close this tab.
                  </p>
                )}
                <div className="mt-4 flex justify-center gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce`} style={{animationDelay:`${i*150}ms`}} />
                  ))}
                </div>
              </div>
            ) : patent.claims_status === 'failed' ? (
              <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
                <div className="text-3xl mb-3">⚠️</div>
                <p className="text-red-600 text-sm font-semibold mb-1">Something went wrong</p>
                <p className="text-gray-500 text-xs mb-4">Your original claims draft is safe. You can try again below.</p>
                <button
                  onClick={async () => {
                    await fetch(`/api/patents/${patent.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                      body: JSON.stringify({ claims_status: 'complete' }),
                    })
                    setPatent(prev => prev ? { ...prev, claims_status: 'complete' } : null)
                  }}
                  className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors"
                >
                  Reset &amp; Try Again
                </button>
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

                {/* Pro badge — only shown to free users */}
                {!isPro && <ProBadge patentId={patent.id} />}

                {/* Deep Research staged result — review & apply banner */}
                {!claimsReadOnly && patent.claims_draft_research_pending && (
                  <div className="bg-amber-50 rounded-xl border border-amber-300 p-4 mb-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-amber-900 mb-1">🔬 Deep Research result ready for review</p>
                        <p className="text-xs text-amber-700">AI analysis strengthened your claims based on prior art research. Your original claims are safe until you apply.</p>
                      </div>
                      <div className="flex-shrink-0 flex flex-col gap-2 items-end">
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/patents/${patent.id}/apply-research`, {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${authToken}` },
                            })
                            const d = await res.json()
                            if (res.ok) {
                              showToast('✅ Research applied — original claims saved as backup')
                              loadAll()
                            } else {
                              showToast(d.error ?? 'Failed to apply')
                            }
                          }}
                          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors whitespace-nowrap"
                        >
                          Apply Research →
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Dismiss the research result? It will be permanently discarded.')) return
                            await fetch(`/api/patents/${patent.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                              body: JSON.stringify({ claims_draft_research_pending: null, research_completed_at: null }),
                            })
                            setPatent(prev => prev ? { ...prev, claims_draft_research_pending: null } : null)
                          }}
                          className="text-xs text-amber-600 hover:underline"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                    {/* Preview of staged claims */}
                    <details className="mt-3">
                      <summary className="text-xs text-amber-700 cursor-pointer hover:text-amber-900 font-medium">Preview researched claims ▾</summary>
                      <pre className="mt-2 text-xs text-gray-700 bg-white border border-amber-100 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap font-mono leading-relaxed">
                        {patent.claims_draft_research_pending?.slice(0, 2000)}
                        {(patent.claims_draft_research_pending?.length ?? 0) > 2000 ? '…' : ''}
                      </pre>
                    </details>
                  </div>
                )}

                {/* Pro AI passes — shown for Pro users, clickable */}
                {!claimsReadOnly && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
                    <button
                      onClick={async () => {
                        if (!confirm('Run Deep Research Pass? Our AI will analyze prior art and strengthen your claims. This takes 8–12 minutes — we\'ll email you when done.')) return
                        const res = await fetch(`/api/patents/${patent.id}/deep-research`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${authToken}` },
                        })
                        const d = await res.json()
                        if (!res.ok) {
                          if (res.status === 403 && d.code === 'TIER_REQUIRED') { setUpgradeFeature(d.feature ?? 'claims_edit'); return }
                          showToast(d.error ?? 'Failed')
                        } else {
                          showToast('🔬 Deep Research started — 8–12 min, we\'ll email you when done')
                          setPatent(prev => prev ? { ...prev, claims_status: 'generating' } : null)
                        }
                      }}
                      disabled={(['generating','refining','pending'] as string[]).includes(patent.claims_status ?? '')}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      🔬 Deep Research Pass
                      <span className="text-xs bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">Pro</span>
                    </button>
                    {(patent.claims_status as string) === 'refining' ? (
                      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-semibold">
                        <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        Pattie is polishing…
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          if (!confirm('Run Pattie Polish? Our AI will polish your claim language for USPTO precision. Takes 2–4 minutes — we\'ll email you when done.')) return
                          const res = await fetch(`/api/patents/${patent.id}/refine-claims`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${authToken}` },
                          })
                          const d = await res.json()
                          if (!res.ok) {
                            if (res.status === 403 && d.code === 'TIER_REQUIRED') { setUpgradeFeature(d.feature ?? 'claims_edit'); return }
                            showToast(d.error ?? 'Failed')
                          } else {
                            showToast("✨ Pattie Polish started — we'll email you when done (~2-3 min)")
                            setPatent(prev => prev ? { ...prev, claims_status: 'refining' } : null)
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors"
                      >
                        ✨ Pattie Polish
                        <span className="text-xs bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded font-bold">Pro</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Claims viewer — with AI Refined badge + change summary + before/after diff */}
                {(() => {
                  const hasRefined = (patent.claims_status as string) === 'refined' && (patent as any).claims_draft_pre_refine
                  const changeBullets: string[] = hasRefined
                    ? generateRefineSummary((patent as any).claims_draft_pre_refine, patent.claims_draft!)
                    : []
                  return (
                    <>
                      {/* Fix C: collapsible change summary */}
                      {hasRefined && changeBullets.length > 0 && (
                        <details className="bg-indigo-50 border border-indigo-200 rounded-xl overflow-hidden">
                          <summary className="px-5 py-3 text-xs font-semibold text-indigo-700 cursor-pointer hover:bg-indigo-100 transition-colors flex items-center gap-2">
                            ✨ What changed in this refinement?
                            <span className="text-indigo-400 font-normal ml-auto">Click to expand ▾</span>
                          </summary>
                          <ul className="px-5 pb-4 pt-2 space-y-1">
                            {changeBullets.map((b, i) => (
                              <li key={i} className="text-xs text-indigo-800 flex items-start gap-2">
                                <span className="text-indigo-400 mt-0.5">•</span>
                                {b}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50 flex-wrap gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Claims Draft</span>
                            {(patent.claims_status as string) === 'refined' && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                ✨ AI Refined
                              </span>
                            )}
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
                            {hasRefined && (
                              <button
                                onClick={() => {
                                  const el = document.getElementById('claims-orig-panel')
                                  if (el) el.classList.toggle('hidden')
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-50 transition-colors"
                              >
                                ↕ Before / After
                              </button>
                            )}
                            <span className="text-xs text-gray-400">{patent.claims_draft?.length.toLocaleString()} chars</span>
                            <button
                              onClick={() => copyToClipboard(patent.claims_draft!, '📋 All claims copied!')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1f36] text-white rounded-lg text-xs font-semibold hover:bg-[#2d3561] transition-colors"
                            >
                              📋 Copy All
                            </button>
                          </div>
                        </div>
                        <ClaimsText
                          text={patent.claims_draft!}
                          onCopy={(claim) => copyToClipboard(claim, '📋 Claim copied!')}
                        />
                        {hasRefined && (
                          <div id="claims-orig-panel" className="hidden border-t border-indigo-100">
                            <div className="px-5 py-2 bg-indigo-50 flex items-center gap-2">
                              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Original (pre-refinement)</span>
                              <button
                                onClick={() => copyToClipboard((patent as any).claims_draft_pre_refine, '📋 Original claims copied!')}
                                className="ml-auto text-xs px-2 py-1 border border-indigo-200 text-indigo-600 rounded hover:bg-indigo-100"
                              >
                                📋 Copy
                              </button>
                            </div>
                            <ClaimsText
                              text={(patent as any).claims_draft_pre_refine}
                              onCopy={(claim) => copyToClipboard(claim, '📋 Claim copied!')}
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}

                {/* Action bar — hidden for granted patents (read-only claims view) */}
                {!claimsReadOnly && patent.filing_status === 'draft' && (
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

                {/* Fix A: action bar when approved + refinement result exists */}
                {patent.filing_status === 'approved' && (patent.claims_status as string) === 'refined' && (patent as any).claims_draft_pre_refine && (
                  <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-5">
                    <p className="text-sm font-semibold text-indigo-900 mb-1">AI Refinement applied — review before re-approving</p>
                    <p className="text-xs text-indigo-700 mb-4">The Pattie Polish ran after you approved. Review the before/after above, then re-approve or revert to your original claims.</p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => refinementAction('accept')}
                        className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors min-h-[44px]"
                      >
                        ✓ Accept Refinement &amp; Re-approve
                      </button>
                      <button
                        onClick={() => refinementAction('revert')}
                        className="flex-1 px-4 py-3 border border-red-300 text-red-700 bg-white rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors min-h-[44px]"
                      >
                        ↩ Revert to Original
                      </button>
                    </div>
                  </div>
                )}

                {/* Re-revision option when approved (and no pending refinement) */}
                {patent.filing_status === 'approved' && !((patent.claims_status as string) === 'refined' && (patent as any).claims_draft_pre_refine) && (
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
            <FilingProgressTracker patent={patent} patentId={patent.id} />

            {/* Download Filing Package + Mark as Filed CTAs */}
            <div className="flex items-center justify-end gap-3 flex-wrap">
              {/* Mark as Filed — shown when not yet filed */}
              {patent.filing_status !== 'provisional_filed' &&
               patent.filing_status !== 'nonprov_filed' && (
                <button
                  onClick={() => setShowMarkFiledModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-[#1a1f36] text-[#1a1f36] rounded-xl text-sm font-semibold hover:bg-[#1a1f36]/5 transition-colors"
                >
                  📬 Mark as Filed
                </button>
              )}

              {/* Already filed confirmation badge */}
              {patent.filing_status === 'provisional_filed' && patent.provisional_filed_at && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
                  <span>✅ Filed</span>
                  <span className="text-green-600 font-mono text-xs">
                    {patent.provisional_app_number}
                  </span>
                  {patent.nonprov_deadline_at && (
                    <span className="text-xs text-green-700 ml-1">
                      · Non-prov due {new Date(patent.nonprov_deadline_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={() => setShowDownloadModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1f36] text-white rounded-xl text-sm font-semibold hover:bg-[#2d3561] transition-colors shadow-sm"
              >
                📦 Download Filing Package
              </button>
            </div>

            {/* USPTO Patent Center Filing Guide — shown when not yet filed */}
            {patent.filing_status !== 'provisional_filed' && patent.filing_status !== 'nonprov_filed' && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <FilingGuide
                  patent={patent}
                  hasDownloadedZip={false}
                />
              </div>
            )}

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
                  body: `You now have your claims, spec, drawings, and cover sheet. Go to patentcenter.uspto.gov, create an account, and file your provisional application. Filing fee: $${USPTO_FEES.provisional.micro} (micro entity) / $${USPTO_FEES.provisional.small} (small entity) / $${USPTO_FEES.provisional.large} (large entity).`,
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
              {/* ── Spec View Panel — shown when spec is uploaded and spec_draft exists ── */}
              {computeStepStatus(patent)[3] && patent.spec_uploaded && patent.spec_draft && (!isCollaborator || (collabPerms.spec ?? false)) && (
                <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-green-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>📋</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Specification Document</span>
                    </div>
                    <span className="text-xs font-semibold text-green-700">✅ Complete — {patent.spec_draft.length.toLocaleString()} chars</span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-gray-600">Your specification is drafted and saved. View, copy, or download for USPTO filing.</p>
                      <button
                        onClick={() => setShowSpecDraft(s => !s)}
                        className="ml-4 text-xs text-blue-600 hover:underline flex-shrink-0"
                      >
                        {showSpecDraft ? 'Hide ▲' : 'Show ▼'}
                      </button>
                    </div>
                    {showSpecDraft && (
                      <div className="relative mb-3">
                        <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono text-gray-700 max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                          {patent.spec_draft}
                        </pre>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(patent.spec_draft!)
                            showToast('📋 Spec copied to clipboard')
                          }}
                          className="absolute top-2 right-2 px-2 py-1 bg-white border border-gray-200 rounded text-xs hover:bg-gray-50"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    <div className="flex gap-3 flex-wrap">
                      <button
                        onClick={() => {
                          const blob = new Blob([patent.spec_draft!], { type: 'text/plain' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${patent.title.replace(/[^a-zA-Z0-9]/g, '-')}-spec.txt`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                        className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors"
                      >
                        ⬇ Download Spec (.txt)
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(patent.spec_draft!)
                          showToast('📋 Spec copied to clipboard')
                        }}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                      >
                        📋 Copy All
                      </button>
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
                            showToast('✅ Spec regenerated')
                          } catch { showToast('❌ Network error') }
                          finally { setDraftingSpec(false) }
                        }}
                        disabled={draftingSpec}
                        className="px-4 py-2 text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
                      >
                        {draftingSpec ? 'Regenerating…' : '🔄 Regenerate'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
              {canWrite && (
                <>
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
                  <p className="mt-1.5 text-xs text-gray-400">
                    Accepts PDF, DOCX, TXT, MD. Max 25MB.
                  </p>
                </>
              )}
            </div>

            {/* Abstract field — optional for provisional, required for non-provisional */}
            {computeStepStatus(patent)[3] && (
              <AbstractField
                patent={patent}
                authToken={authToken}
                canWrite={canWrite}
                onUpdate={(val) => setPatent(prev => prev ? { ...prev, abstract_draft: val } : null)}
              />
            )}

            {/* Step 6: Figures upload + AI Generate */}
            {(() => {
              const statuses = computeStepStatus(patent)
              const specUploaded = statuses[4] // step 5
              return (
                <div>
                  {/* AI Generate Figures — Pro */}
                  {specUploaded && !patent.figures_uploaded && (
                    <div className="mb-3 p-4 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-violet-900">✨ Generate Patent Figures with AI</p>
                        <p className="text-xs text-violet-700 mt-0.5">Analyzes your spec + claims and generates 6 USPTO-style technical drawings automatically.</p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm('Generate AI figures from your spec and claims? This takes ~60 seconds.')) return
                          const res = await fetch(`/api/patents/${patent.id}/generate-figures`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${authToken}` },
                          })
                          const d = await res.json()
                          if (!res.ok) {
                            if (res.status === 403 && d.code === 'TIER_REQUIRED') { setUpgradeFeature(d.feature ?? 'claims_edit'); return }
                            showToast(d.error ?? 'Failed to start figure generation')
                          } else {
                            showToast('✨ Generating figures — check back in 60 seconds')
                            setTimeout(() => loadAll(), 70000)
                          }
                        }}
                        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors"
                      >
                        🖼️ Generate Figures
                        <span className="text-xs bg-violet-800 px-1.5 py-0.5 rounded font-bold">Pro</span>
                      </button>
                    </div>
                  )}
                  {/* Generated figures gallery */}
                  {patent.figures_uploaded && figureUrls.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-[#1a1f36]">Generated Figures ({figureUrls.length})</h4>
                        <a
                          href={`/api/patents/${patent.id}/figures-zip?token=${authToken}`}
                          className="text-xs text-indigo-600 hover:underline font-medium"
                          title="Download all figures as ZIP"
                        >
                          ⬇ Download All
                        </a>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {figureUrls.map(fig => (
                          <div key={fig.number} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                            <a href={fig.url} target="_blank" rel="noreferrer" className="block">
                              <img
                                src={fig.url}
                                alt={fig.label}
                                className="w-full h-32 object-contain bg-gray-50 hover:opacity-90 transition-opacity"
                                loading="lazy"
                              />
                            </a>
                            <div className="px-2 py-1.5 flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-700">{fig.label}</span>
                              <a
                                href={fig.url}
                                download={fig.filename}
                                className="text-xs text-indigo-600 hover:underline"
                              >
                                ⬇
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
                  <p className="mt-1.5 text-xs text-gray-400">
                    Upload any image — we&apos;ll automatically convert to USPTO-compliant black &amp; white line art at 300 DPI. Hand sketches welcome. Accepts PNG, JPG, WebP, HEIC, TIFF. Max 10MB each.
                  </p>
                </div>
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
                  <div className={`px-5 py-3 border-b border-gray-100 flex items-center justify-between ${coverDone ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <span>📄</span>
                      <span className={`text-xs font-bold uppercase tracking-wider ${coverDone ? 'text-green-700' : 'text-gray-500'}`}>
                        {coverDone ? '✅ Cover Sheet Complete' : 'Cover Sheet (USPTO Form SB/16)'}
                      </span>
                    </div>
                    {coverDone && (
                      <span className="text-xs text-green-600">
                        ~{Math.max(1, Math.round(((patent.spec_draft?.length ?? 0) + (patent.claims_draft?.length ?? 0)) / 3000))} page ADS
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    {coverDone ? (
                      <>
                        <p className="text-sm text-gray-600 mb-4">
                          Your USPTO Application Data Sheet has been generated as a PDF. Download it and upload directly to Patent Center — no conversion needed.
                        </p>
                        <div className="flex items-center gap-4 flex-wrap">
                          {/* Primary: Download PDF */}
                          <a
                            href={`/api/patents/${patent.id}/cover-sheet-pdf`}
                            onClick={(e) => {
                              e.preventDefault()
                              fetch(`/api/patents/${patent.id}/cover-sheet-pdf`, {
                                headers: { Authorization: `Bearer ${authToken}` }
                              })
                                .then(r => r.blob())
                                .then(blob => {
                                  const url = URL.createObjectURL(blob)
                                  const a = document.createElement('a')
                                  a.href = url
                                  a.download = `${patent.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 40)}-cover-sheet.pdf`
                                  a.click()
                                  URL.revokeObjectURL(url)
                                })
                                .catch(() => showToast('❌ PDF generation failed — try again'))
                            }}
                            className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors"
                          >
                            ⬇ Download Cover Sheet PDF
                          </a>
                          {/* Secondary: Regenerate (link style) */}
                          <Link
                            href={`/dashboard/patents/${patent.id}/cover-sheet`}
                            target="_blank"
                            className="text-xs text-gray-400 hover:text-gray-600 underline"
                          >
                            🔄 Regenerate
                          </Link>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 mb-4">
                          We&apos;ve pre-filled a cover sheet from your patent data. Open it, review, print or save as PDF, then mark it complete below.
                        </p>
                        <div className="flex gap-3 flex-wrap">
                          <Link
                            href={`/dashboard/patents/${patent.id}/cover-sheet`}
                            target="_blank"
                            className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors"
                          >
                            📄 Open Cover Sheet ↗
                          </Link>
                          <button
                            onClick={() => setShowCoverSaveModal(true)}
                            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                          >
                            ✅ I&apos;ve saved my cover sheet
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── ENHANCEMENT TAB ─────────────────────────────────────────────────── */}
        {tab === 'enhancement' && patent && authToken && (
          <EnhancementTab
            patent={patent}
            authToken={authToken}
            isPro={isPro}
            onNavigate={(t) => setTab(t as Tab)}
          />
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
                      authToken={authToken}
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
              {canWrite && (
                <button onClick={() => setShowCorrespondenceForm(true)}
                  className="px-3 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors min-h-[44px] flex items-center">
                  + Add
                </button>
              )}
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
                {canWrite && (
                  <button onClick={() => setShowCorrespondenceForm(true)}
                    className="inline-flex items-center px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold min-h-[44px]">
                    Add Record
                  </button>
                )}
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#1a1f36] text-sm">{item.title}</span>
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
                        <span className="text-gray-300 flex-shrink-0 text-lg">{expandedCorr === item.id ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {expandedCorr === item.id && (
                      <div className="px-4 pb-4 border-t border-gray-50">
                        {item.content && (
                          item.type === 'ai_research'
                            ? (
                              <ResearchReportViewer content={item.content} metadata={!Array.isArray(item.attachments) && item.attachments ? (item.attachments as unknown) as Record<string, unknown> : null} />
                            )
                            : <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">{item.content}</div>
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
            isOwner={!isCollaborator}
          />
        )}

        {/* Save/cancel when editing details */}
        {/* ── MARKETPLACE SETTINGS (Overview tab, owner only) ─────────────────── */}
        {tab === 'details' && !isCollaborator && (
          <MarketplaceSettingsCard
            patent={patent}
            authToken={authToken}
            canWrite={canWrite}
            onUpdate={(fields) => setPatent(prev => prev ? { ...prev, ...fields } : null)}
          />
        )}

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

      {/* ── ASK PATTIE floating button ───────────────────────────────────────── */}
      {patent && authToken && !showPattie && (!isCollaborator || (collabPerms.pattie ?? false)) && (
        <button
          onClick={() => setShowPattie(true)}
          className="
            fixed bottom-6 right-6 z-40
            flex items-center gap-2
            bg-[#4f46e5] text-white
            px-4 py-3 rounded-full shadow-lg
            hover:bg-[#4338ca] active:scale-95 transition-all
            text-sm font-semibold
            sm:rounded-full
          "
          aria-label="Open Pattie chat"
        >
          <span className="text-base">🦞</span>
          <span>Ask Pattie</span>
        </button>
      )}

      {/* ── PATTIE CHAT DRAWER ───────────────────────────────────────────────── */}
      {showPattie && patent && authToken && (
        <PattieChatDrawer
          patentId={patent.id}
          patentTitle={patent.title}
          authToken={authToken}
          onClose={() => setShowPattie(false)}
          canEdit={canWrite}
          patentStatus={patent.filing_status ?? patent.status}
          onTierRequired={(feature) => { setShowPattie(false); setUpgradeFeature(feature) }}
        />
      )}
    </div>
  )
}

// ── Arc3InterviewModal ───────────────────────────────────────────────────────
function Arc3InterviewModal({ patentId, patentTitle, authToken, onClose }: {
  patentId: string; patentTitle: string; authToken: string; onClose: () => void
}) {
  const [messages, setMessages] = React.useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [input, setInput] = React.useState('')
  const [streaming, setStreaming] = React.useState(false)
  const [briefSaved, setBriefSaved] = React.useState(false)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  // Kick off interview on mount
  React.useEffect(() => {
    sendMessage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  async function sendMessage(userText?: string) {
    const newMessages: { role: 'user' | 'assistant'; content: string }[] = userText
      ? [...messages, { role: 'user' as const, content: userText }]
      : messages
    if (userText) {
      setMessages(newMessages)
      setInput('')
    }
    setStreaming(true)
    let assistantText = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])
    try {
      const res = await fetch(`/api/patents/${patentId}/arc3-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ messages: newMessages }),
      })
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.text) {
              assistantText += parsed.text
              setMessages(prev => {
                const copy = [...prev]
                copy[copy.length - 1] = { role: 'assistant', content: assistantText }
                return copy
              })
            }
            if (parsed.brief_saved) setBriefSaved(true)
          } catch { /* partial chunk */ }
        }
      }
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full flex flex-col" style={{ height: '80vh' }}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">PP</div>
              <span className="font-bold text-[#1a1f36] text-sm">Pattie — Marketplace Interview</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{patentTitle}</p>
          </div>
          {briefSaved && (
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">✓ Brief saved</span>
          )}
          {briefSaved && (
            <button onClick={onClose} className="ml-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">
              View Leads →
            </button>
          )}
          {!briefSaved && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}>
                {m.content || (streaming && i === messages.length - 1 ? <span className="animate-pulse">▋</span> : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {!briefSaved && (
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !streaming && input.trim()) sendMessage(input.trim()) }}
              placeholder="Type your answer…"
              disabled={streaming}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              onClick={() => { if (input.trim() && !streaming) sendMessage(input.trim()) }}
              disabled={streaming || !input.trim()}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LeadsPanel ───────────────────────────────────────────────────────────────
function LeadsPanel({ patentId, authToken }: { patentId: string; authToken: string }) {
  interface Inquiry {
    id: string
    inquirer_name: string
    inquirer_email: string
    inquirer_company: string | null
    deal_type_interest: string[] | null
    message: string | null
    status: string
    created_at: string
  }
  const [inquiries, setInquiries] = React.useState<Inquiry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [updating, setUpdating] = React.useState<string | null>(null)

  const STATUS_BADGE: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    reviewed: 'bg-gray-100 text-gray-600',
    qualified: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
    closed: 'bg-purple-100 text-purple-700',
  }

  React.useEffect(() => {
    fetch(`/api/patents/${patentId}/leads`, {
      headers: { Authorization: `Bearer ${authToken}` },
    }).then(r => r.json()).then(d => { setInquiries(d.inquiries ?? []); setLoading(false) })
  }, [patentId, authToken])

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    try {
      const res = await fetch(`/api/patents/${patentId}/leads?inquiry_id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setInquiries(prev => prev.map(i => i.id === id ? { ...i, status } : i))
      }
    } finally {
      setUpdating(null)
    }
  }

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">Loading leads…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-[#1a1f36]">Licensing Inquiries ({inquiries.length})</h3>
        {inquiries.length === 0 && (
          <span className="text-xs text-gray-400">No inquiries yet — your deal page is live and waiting.</span>
        )}
      </div>
      {inquiries.map(inq => (
        <div key={inq.id} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="font-semibold text-[#1a1f36] text-sm">{inq.inquirer_name}</div>
              <div className="text-xs text-gray-400">{inq.inquirer_email}{inq.inquirer_company ? ` · ${inq.inquirer_company}` : ''}</div>
              {inq.deal_type_interest?.length ? (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {inq.deal_type_interest.map(t => (
                    <span key={t} className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[inq.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {inq.status}
              </span>
              <span className="text-xs text-gray-400">{new Date(inq.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          {inq.message && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3 leading-relaxed">"{inq.message}"</p>
          )}
          <div className="flex gap-2 flex-wrap">
            {inq.status === 'new' && (
              <button onClick={() => updateStatus(inq.id, 'reviewed')} disabled={updating === inq.id}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                Mark Reviewed
              </button>
            )}
            {inq.status !== 'qualified' && inq.status !== 'closed' && (
              <button onClick={() => updateStatus(inq.id, 'qualified')} disabled={updating === inq.id}
                className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50">
                ✓ Mark Qualified
              </button>
            )}
            {inq.status !== 'rejected' && inq.status !== 'closed' && (
              <button onClick={() => updateStatus(inq.id, 'rejected')} disabled={updating === inq.id}
                className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50">
                Reject
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
