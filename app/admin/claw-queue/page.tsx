'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface QueueItem {
  id: string
  prompt_label: string
  prompt_body: string
  status: 'queued' | 'in_progress' | 'complete' | 'skipped'
  priority: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  claw_summary: string | null
  created_by: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_ICONS: Record<string, string> = {
  queued: '⏳',
  in_progress: '🔄',
  complete: '✅',
  skipped: '⏭',
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-yellow-50 border-yellow-200',
  in_progress: 'bg-blue-50 border-blue-200',
  complete: 'bg-green-50 border-green-200',
  skipped: 'bg-gray-50 border-gray-200',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────
interface ModalProps {
  onClose: () => void
  onSaved: () => void
  authToken: string
  editItem?: QueueItem | null
}

function PromptModal({ onClose, onSaved, authToken, editItem }: ModalProps) {
  const [label, setLabel] = useState(editItem?.prompt_label ?? '')
  const [priority, setPriority] = useState<number>(editItem?.priority ?? 10)
  const [body, setBody] = useState(editItem?.prompt_body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!editItem

  const handleSave = async () => {
    if (!label.trim()) { setError('Label is required'); return }
    setSaving(true)
    setError(null)
    try {
      const url = isEdit
        ? `/api/admin/claw-queue/${editItem!.id}`
        : '/api/admin/claw-queue'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          prompt_label: label.trim(),
          prompt_body: body.trim(),
          priority,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Save failed')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col gap-4 p-6">
        <h2 className="text-lg font-bold text-gray-900">
          {isEdit ? '✏️ Edit Prompt' : '➕ Add Prompt'}
        </h2>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Label *</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. E2, 55F"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="w-28">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={e => setPriority(parseInt(e.target.value) || 10)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Prompt Body</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={12}
            placeholder="Enter the full prompt text..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mark Done Modal ───────────────────────────────────────────────────────────
interface DoneModalProps {
  item: QueueItem
  onClose: () => void
  onSaved: () => void
  authToken: string
}

function MarkDoneModal({ item, onClose, onSaved, authToken }: DoneModalProps) {
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/claw-queue/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          status: 'complete',
          claw_summary: summary.trim(),
          completed_at: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col gap-4 p-6">
        <h2 className="text-lg font-bold text-gray-900">✅ Mark Done — {item.prompt_label}</h2>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Claw Summary (optional)</label>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            rows={6}
            placeholder="What did Claw do / output?"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Mark Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ClawQueuePage() {
  const router = useRouter()
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [autoRunEnabled, setAutoRunEnabled] = useState(true)
  const [securityGateEnabled, setSecurityGateEnabled] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  // Modal state
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<QueueItem | null>(null)
  const [doneItem, setDoneItem] = useState<QueueItem | null>(null)
  // Smart Add state
  const [showSmartAdd, setShowSmartAdd] = useState(false)
  const [smartInput, setSmartInput] = useState('')
  const [smartAnalyzing, setSmartAnalyzing] = useState(false)
  const [smartResult, setSmartResult] = useState<{
    label: string; priority: number; prompt_body: string; reasoning: string
  } | null>(null)
  const [smartLabel, setSmartLabel] = useState('')
  const [smartPriority, setSmartPriority] = useState(5)
  const [smartBody, setSmartBody] = useState('')
  const [smartSaving, setSmartSaving] = useState(false)
  // ZIP batch state
  const [zipFiles, setZipFiles] = useState<Array<{name: string; content: string; selected: boolean}>>([])
  const [zipAnalyzing, setZipAnalyzing] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  const [zipBatch, setZipBatch] = useState<Array<{
    name: string; label: string; priority: number; prompt_body: string; reasoning: string;
    expanded: boolean; saving: boolean; saved: boolean
  }>>([])
  const [zipSavingAll, setZipSavingAll] = useState(false)

  // Expand state
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAllComplete, setShowAllComplete] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const token = session.access_token
      setAuthToken(token)

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single()

      if (!profile?.is_admin) { router.replace('/dashboard'); return }
      fetchQueue(token)
      // Load queue settings
      supabase.from('app_settings').select('key, value')
        .in('key', ['queue_auto_run_enabled', 'queue_security_gate_enabled'])
        .then(({ data }) => {
          for (const row of data ?? []) {
            if (row.key === 'queue_auto_run_enabled') setAutoRunEnabled(row.value !== 'false')
            if (row.key === 'queue_security_gate_enabled') setSecurityGateEnabled(row.value !== 'false')
          }
        })
    })
  }, [router])

  // ── Fetch queue ────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async (token: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/claw-queue', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setItems(data)
    } finally {
      setLoading(false)
    }
  }, [])

  const reload = useCallback(() => {
    if (authToken) fetchQueue(authToken)
  }, [authToken, fetchQueue])

  // ── Toast helper ───────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Smart Add: Analyze with Pattie ─────────────────────────────────────────
  async function analyzeWithPattie() {
    if (!smartInput.trim() || !authToken) return
    setSmartAnalyzing(true)
    setSmartResult(null)
    try {
      const queueRef = queued.map(q => `${q.priority} — ${q.prompt_label}`).join(', ')
      const res = await fetch('/api/admin/smart-queue-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ input: smartInput, queue_context: queueRef }),
      })
      const d = await res.json()
      if (!res.ok) { showToast(d.error ?? 'Analysis failed'); return }
      setSmartResult(d)
      setSmartLabel(d.label ?? '')
      setSmartPriority(d.priority ?? 5)
      setSmartBody(d.prompt_body ?? smartInput)
    } catch { showToast('Network error') }
    finally { setSmartAnalyzing(false) }
  }

  async function saveSmartQueue() {
    if (!authToken || !smartBody.trim() || !smartLabel.trim()) return
    setSmartSaving(true)
    try {
      const res = await fetch('/api/admin/claw-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ prompt_label: smartLabel, prompt_body: smartBody, priority: smartPriority }),
      })
      if (res.ok) {
        setShowSmartAdd(false); setSmartInput(''); setSmartResult(null)
        fetchQueue(authToken); showToast('✅ Added to queue')
      } else { const d = await res.json(); showToast(d.error ?? 'Save failed') }
    } catch { showToast('Network error') }
    finally { setSmartSaving(false) }
  }

  // ── ZIP upload handler ────────────────────────────────────────────────────
  async function handleZipUpload(file: File) {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(file)
    const SUPPORTED = ['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg']
    const entries: Array<{name: string; content: string; selected: boolean}> = []
    for (const [name, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue
      const basename = name.split('/').pop() ?? name
      if (basename.startsWith('.')) continue // skip .DS_Store etc
      const ext = basename.slice(basename.lastIndexOf('.')).toLowerCase()
      if (!SUPPORTED.includes(ext)) continue
      const content = await zipEntry.async('string')
      entries.push({ name: basename, content, selected: true })
    }
    setZipFiles(entries)
    setZipBatch([])
    setZipProgress(0)
  }

  async function analyzeZipBatch() {
    if (!authToken || zipFiles.length === 0) return
    const selected = zipFiles.filter(f => f.selected)
    if (selected.length === 0) return
    setZipAnalyzing(true)
    setZipProgress(0)
    const queueRef = queued.map(q => `${q.priority} — ${q.prompt_label}`).join(', ')
    const maxPri = Math.max(0, ...queued.map(q => q.priority))
    const results: typeof zipBatch = []
    for (let i = 0; i < selected.length; i++) {
      setZipProgress(i + 1)
      const f = selected[i]
      try {
        const res = await fetch('/api/admin/smart-queue-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            input: f.content,
            queue_context: queueRef + (results.length > 0 ? ` + batch so far: ${results.map(r => r.priority + ' — ' + r.label).join(', ')}` : ''),
            min_priority: maxPri + i + 1,
          }),
        })
        const d = await res.json()
        results.push({
          name: f.name,
          label: d.label ?? f.name,
          priority: d.priority ?? (maxPri + i + 1),
          prompt_body: d.prompt_body ?? f.content,
          reasoning: d.reasoning ?? '',
          expanded: false,
          saving: false,
          saved: false,
        })
      } catch {
        results.push({ name: f.name, label: f.name, priority: maxPri + i + 1, prompt_body: f.content, reasoning: 'Analysis failed — using raw content', expanded: false, saving: false, saved: false })
      }
      await new Promise(r => setTimeout(r, 500)) // small delay between calls
    }
    setZipBatch(results)
    setZipAnalyzing(false)
  }

  async function saveZipItem(idx: number) {
    if (!authToken) return
    const item = zipBatch[idx]
    setZipBatch(prev => prev.map((b, i) => i === idx ? { ...b, saving: true } : b))
    try {
      const res = await fetch('/api/admin/claw-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ prompt_label: item.label, prompt_body: item.prompt_body, priority: item.priority }),
      })
      if (res.ok) {
        setZipBatch(prev => prev.map((b, i) => i === idx ? { ...b, saving: false, saved: true } : b))
        fetchQueue(authToken)
      }
    } catch { setZipBatch(prev => prev.map((b, i) => i === idx ? { ...b, saving: false } : b)) }
  }

  async function saveAllZip() {
    if (!authToken) return
    setZipSavingAll(true)
    for (let i = 0; i < zipBatch.length; i++) {
      if (!zipBatch[i].saved) await saveZipItem(i)
    }
    setZipSavingAll(false)
    showToast(`✅ Added ${zipBatch.length} items to queue`)
    fetchQueue(authToken)
  }

  // ── ZIP handling ──────────────────────────────────────────────────────────
  async function saveQueueSetting(key: string, value: boolean) {
    setSavingSettings(true)
    await supabase.from('app_settings').upsert({ key, value: String(value) }, { onConflict: 'key' })
    setSavingSettings(false)
  }

  // ── PATCH helper ──────────────────────────────────────────────────────────
  const patchItem = useCallback(async (id: string, body: Record<string, unknown>) => {
    if (!authToken) return false
    const res = await fetch(`/api/admin/claw-queue/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    })
    return res.ok
  }, [authToken])

  // ── Reorder ───────────────────────────────────────────────────────────────
  const reorder = useCallback(async (item: QueueItem, direction: 'up' | 'down') => {
    const queued = items.filter(i => i.status === 'queued')
    const idx = queued.findIndex(i => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= queued.length) return

    const swapWith = queued[swapIdx]
    const [ok1, ok2] = await Promise.all([
      patchItem(item.id, { priority: swapWith.priority }),
      patchItem(swapWith.id, { priority: item.priority }),
    ])
    if (ok1 && ok2) reload()
    else showToast('Reorder failed')
  }, [items, patchItem, reload])

  // ── Skip ──────────────────────────────────────────────────────────────────
  const skipItem = useCallback(async (item: QueueItem) => {
    if (!window.confirm('Skip this prompt?')) return
    const ok = await patchItem(item.id, { status: 'skipped' })
    if (ok) { showToast('Skipped'); reload() }
    else showToast('Failed to skip')
  }, [patchItem, reload])

  // ── Grouped items ──────────────────────────────────────────────────────────
  const queued = items.filter(i => i.status === 'queued')
  const inProgress = items.filter(i => i.status === 'in_progress')
  const complete = items.filter(i => i.status === 'complete')
  const skipped = items.filter(i => i.status === 'skipped')

  const firstQueued = queued[0]

  // ── Render row ────────────────────────────────────────────────────────────
  const renderRow = (item: QueueItem, showReorder = false) => {
    const isExpanded = expandedId === item.id

    return (
      <div
        key={item.id}
        className={`border rounded-lg p-3 mb-2 ${STATUS_COLORS[item.status]}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Reorder buttons */}
          {showReorder && (
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => reorder(item, 'up')}
                className="text-xs px-1 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-50 leading-none"
                title="Move up"
              >▲</button>
              <button
                onClick={() => reorder(item, 'down')}
                className="text-xs px-1 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-50 leading-none"
                title="Move down"
              >▼</button>
            </div>
          )}

          {/* Priority badge */}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-white border border-gray-300 text-gray-600 min-w-[2rem] justify-center">
            {item.priority}
          </span>

          {/* Label */}
          <span className="font-semibold text-gray-900 text-sm flex-1 min-w-0">
            {STATUS_ICONS[item.status]} {item.prompt_label}
          </span>

          {/* Timestamps */}
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {item.status === 'in_progress' && item.started_at
              ? `started ${timeAgo(item.started_at)}`
              : item.status === 'complete' && item.completed_at
              ? `done ${timeAgo(item.completed_at)}`
              : timeAgo(item.created_at)}
          </span>

          {/* Action buttons */}
          <div className="flex gap-1 flex-wrap">
            {/* View / View Summary */}
            {(item.status !== 'skipped') && (
              <button
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {isExpanded ? 'Hide' : item.status === 'complete' ? 'Summary' : 'View'}
              </button>
            )}

            {/* Edit (queued/in_progress only) */}
            {(item.status === 'queued' || item.status === 'in_progress') && (
              <button
                onClick={() => setEditItem(item)}
                className="text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
            )}

            {/* Skip (queued only) */}
            {item.status === 'queued' && (
              <button
                onClick={() => skipItem(item)}
                className="text-xs px-2 py-1 rounded bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Skip
              </button>
            )}

            {/* Mark Done (in_progress only) */}
            {item.status === 'in_progress' && (
              <button
                onClick={() => setDoneItem(item)}
                className="text-xs px-2 py-1 rounded bg-white border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
              >
                Mark Done
              </button>
            )}
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-3">
            {item.status === 'complete' ? (
              <div className="text-sm text-gray-800 bg-white border border-green-200 rounded-lg p-3 whitespace-pre-wrap">
                {item.claw_summary || <em className="text-gray-400">No summary recorded.</em>}
              </div>
            ) : (
              <pre className="text-xs font-mono bg-gray-900 text-green-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                {item.prompt_body || <em className="text-gray-500">No body.</em>}
              </pre>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm animate-pulse">Loading queue…</div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Modals */}
      {(showAdd || editItem) && authToken && (
        <PromptModal
          authToken={authToken}
          editItem={editItem}
          onClose={() => { setShowAdd(false); setEditItem(null) }}
          onSaved={() => { reload(); showToast(editItem ? 'Updated' : 'Added') }}
        />
      )}
      {doneItem && authToken && (
        <MarkDoneModal
          item={doneItem}
          authToken={authToken}
          onClose={() => setDoneItem(null)}
          onSaved={() => { reload(); showToast('Marked complete') }}
        />
      )}

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link
                href="/admin"
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Admin
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">🗂 Claw Prompt Queue</h1>
            <p className="text-sm text-gray-500 mt-1">
              {queued.length} item{queued.length !== 1 ? 's' : ''} queued
              {firstQueued ? ` · Next: ${firstQueued.prompt_label}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowSmartAdd(s => !s); setSmartResult(null); setSmartInput('') }}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
            >
              ⚡ Smart Add
            </button>
            <button
              onClick={() => { setEditItem(null); setShowAdd(true) }}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <span className="text-base leading-none">+</span> Add Prompt
            </button>
          </div>
        </div>

        {/* ── Smart Add Panel ──────────────────────────────────────────────── */}
        {showSmartAdd && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-amber-900">⚡ Smart Add — Drop your prompt here</p>
                <p className="text-xs text-amber-700 mt-0.5">Paste text, describe what you need, or upload a .md file. Pattie will handle the rest.</p>
                {queued.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1 font-mono">
                    Current queue: {queued.map(q => `${q.priority} — ${q.prompt_label.slice(0, 30)}`).join(' · ')}
                  </p>
                )}
              </div>
              <button onClick={() => setShowSmartAdd(false)} className="text-amber-400 hover:text-amber-700 text-lg ml-4">×</button>
            </div>

            <textarea
              value={smartInput}
              onChange={e => setSmartInput(e.target.value)}
              placeholder="Paste a prompt, describe a feature idea, or drop a .md file..."
              rows={6}
              className="w-full border border-amber-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 border border-amber-200 rounded-lg text-xs text-amber-700 bg-white hover:bg-amber-50 cursor-pointer">
                📎 Upload file / .zip
                <input type="file" accept=".md,.txt,.pdf,.zip" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.name.endsWith('.zip')) {
                    setZipFiles([]); setZipBatch([])
                    await handleZipUpload(file)
                  } else {
                    const text = await file.text()
                    setSmartInput(text)
                  }
                }} />
              </label>
              <button
                onClick={analyzeWithPattie}
                disabled={!smartInput.trim() || smartAnalyzing}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors"
              >
                {smartAnalyzing ? '⏳ Analyzing…' : 'Analyze with Pattie →'}
              </button>
            </div>

            {/* ZIP file list preview */}
            {zipFiles.length > 0 && zipBatch.length === 0 && (
              <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-900">📦 Found {zipFiles.length} file{zipFiles.length !== 1 ? 's' : ''} in zip:</p>
                <div className="space-y-1.5">
                  {zipFiles.map((f, i) => (
                    <label key={i} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={f.selected}
                        onChange={e => setZipFiles(prev => prev.map((z, j) => j === i ? { ...z, selected: e.target.checked } : z))}
                        className="rounded" />
                      <span>{f.selected ? '✅' : '⬜'} {f.name}</span>
                      <span className="text-gray-400">({f.content.length.toLocaleString()} chars)</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={analyzeZipBatch} disabled={zipAnalyzing || !zipFiles.some(f => f.selected)}
                    className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors">
                    {zipAnalyzing
                      ? `⏳ Analyzing ${zipProgress}/${zipFiles.filter(f => f.selected).length}…`
                      : `Analyze All with Pattie → (${zipFiles.filter(f => f.selected).length} files)`}
                  </button>
                  <button onClick={() => setZipFiles([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                </div>
              </div>
            )}

            {/* ZIP batch results */}
            {zipBatch.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-900">📋 {zipBatch.length} items ready to add</p>
                  <button onClick={saveAllZip} disabled={zipSavingAll || zipBatch.every(b => b.saved)}
                    className="px-4 py-2 bg-[#1a1f36] text-white text-sm font-semibold rounded-lg hover:bg-[#2d3561] disabled:opacity-50 transition-colors">
                    {zipSavingAll ? 'Adding…' : zipBatch.every(b => b.saved) ? '✅ All Added' : 'Add All to Queue'}
                  </button>
                </div>
                <div className="space-y-2">
                  {zipBatch.map((item, i) => (
                    <div key={i} className={`border rounded-lg overflow-hidden ${item.saved ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                        <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{item.name}</span>
                        <input value={item.label} onChange={e => setZipBatch(prev => prev.map((b, j) => j === i ? { ...b, label: e.target.value } : b))}
                          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none min-w-0" />
                        <input type="number" value={item.priority} onChange={e => setZipBatch(prev => prev.map((b, j) => j === i ? { ...b, priority: parseInt(e.target.value) || item.priority } : b))}
                          className="w-14 text-xs border border-gray-200 rounded px-2 py-1 text-center focus:outline-none" />
                        {item.saved ? <span className="text-xs text-green-600 font-semibold flex-shrink-0">✅</span> : (
                          <button onClick={() => saveZipItem(i)} disabled={item.saving}
                            className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0">
                            {item.saving ? '…' : 'Add'}
                          </button>
                        )}
                        <button onClick={() => setZipBatch(prev => prev.map((b, j) => j === i ? { ...b, expanded: !b.expanded } : b))}
                          className="text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0">
                          {item.expanded ? '▲' : '▼'}
                        </button>
                      </div>
                      {item.expanded && (
                        <textarea value={item.prompt_body}
                          onChange={e => setZipBatch(prev => prev.map((b, j) => j === i ? { ...b, prompt_body: e.target.value } : b))}
                          rows={6} className="w-full px-3 py-2 text-xs font-mono border-t border-gray-100 focus:outline-none resize-y" />
                      )}
                      {item.reasoning && !item.expanded && (
                        <p className="px-3 py-1 text-[10px] text-amber-600 italic border-t border-gray-50">Pattie: {item.reasoning}</p>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => { setZipFiles([]); setZipBatch([]) }}
                  className="text-xs text-gray-400 hover:text-gray-600">Clear batch</button>
              </div>
            )}

            {/* ZIP file list preview */}
            {zipFiles.length > 0 && zipBatch.length === 0 && (
              <div className="bg-white rounded-xl border border-amber-200 p-4">
                <p className="text-xs font-bold text-amber-900 mb-2">Found {zipFiles.length} file{zipFiles.length !== 1 ? 's' : ''} in ZIP:</p>
                <div className="space-y-1 mb-3">
                  {zipFiles.map((f, i) => (
                    <label key={i} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-amber-50 px-2 py-1 rounded">
                      <input type="checkbox" checked={f.selected}
                        onChange={e => setZipFiles(prev => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))}
                        className="accent-amber-600" />
                      <span className={f.selected ? 'text-gray-800' : 'text-gray-400 line-through'}>{f.name}</span>
                    </label>
                  ))}
                  {zipFiles.length === 0 && <p className="text-xs text-gray-400">No supported files found in ZIP.</p>}
                </div>
                <button onClick={analyzeZipBatch} disabled={zipAnalyzing || zipFiles.filter(f => f.selected).length === 0}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-40">
                  {zipAnalyzing ? `⏳ Analyzing ${zipProgress} of ${zipFiles.filter(f=>f.selected).length}…` : `Analyze All with Pattie → (${zipFiles.filter(f=>f.selected).length} files)`}
                </button>
              </div>
            )}

            {/* ZIP batch results */}
            {zipBatch.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-900">{zipBatch.length} items ready to queue</p>
                  <button onClick={saveAllZip} disabled={zipSavingAll}
                    className="px-4 py-2 bg-[#1a1f36] text-white text-xs font-semibold rounded-lg hover:bg-[#2d3561] disabled:opacity-50">
                    {zipSavingAll ? 'Adding…' : '✅ Add All to Queue'}
                  </button>
                </div>
                {zipBatch.map((item, idx) => (
                  <div key={idx} className={`border rounded-lg p-3 ${item.saved ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <input value={item.label} onChange={e => setZipBatch(prev => prev.map((b,i)=> i===idx?{...b,label:e.target.value}:b))}
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
                      <input type="number" min={1} value={item.priority}
                        onChange={e => setZipBatch(prev => prev.map((b,i)=> i===idx?{...b,priority:parseInt(e.target.value)||1}:b))}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center" />
                      {!item.saved && (
                        <button onClick={() => saveZipItem(idx)} disabled={item.saving}
                          className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                          {item.saving ? '…' : 'Add'}
                        </button>
                      )}
                      {item.saved && <span className="text-xs text-green-600 font-semibold">✅</span>}
                    </div>
                    <button onClick={() => setZipBatch(prev => prev.map((b,i)=> i===idx?{...b,expanded:!b.expanded}:b))}
                      className="text-[10px] text-indigo-500 hover:underline">
                      {item.expanded ? '▲ collapse' : '▼ view prompt'}
                    </button>
                    {item.expanded && (
                      <textarea value={item.prompt_body}
                        onChange={e => setZipBatch(prev => prev.map((b,i)=> i===idx?{...b,prompt_body:e.target.value}:b))}
                        rows={6} className="w-full mt-1 border border-gray-200 rounded text-xs font-mono px-2 py-1 resize-y" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pre-filled form after analysis */}
            {smartResult && (
              <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
                <p className="text-xs text-amber-700 italic">Pattie: {smartResult.reasoning}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Label</label>
                    <input value={smartLabel} onChange={e => setSmartLabel(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label>
                    <input type="number" min={1} max={99} value={smartPriority}
                      onChange={e => setSmartPriority(parseInt(e.target.value) || 5)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Prompt Body</label>
                  <textarea value={smartBody} onChange={e => setSmartBody(e.target.value)} rows={10}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y" />
                </div>
                <div className="flex gap-3">
                  <button onClick={saveSmartQueue} disabled={smartSaving || !smartBody.trim() || !smartLabel.trim()}
                    className="px-5 py-2 bg-[#1a1f36] text-white text-sm font-semibold rounded-lg hover:bg-[#2d3561] disabled:opacity-50">
                    {smartSaving ? 'Saving…' : 'Save to Queue'}
                  </button>
                  <button onClick={() => { setShowSmartAdd(false); setSmartResult(null) }}
                    className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 space-y-6">
          {/* ── Queued ──────────────────────────────────────────────────── */}
          {queued.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                ⏳ Queued ({queued.length})
              </h2>
              {queued.map(item => renderRow(item, true))}
            </section>
          )}

          {/* ── In Progress ─────────────────────────────────────────────── */}
          {inProgress.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                🔄 In Progress ({inProgress.length})
              </h2>
              {inProgress.map(item => renderRow(item, false))}
            </section>
          )}

          {/* ── Complete ─────────────────────────────────────────────────── */}
          {complete.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                ✅ Complete ({complete.length})
              </h2>
              {(showAllComplete ? complete : complete.slice(0, 3)).map(item => renderRow(item, false))}
              {complete.length > 3 && (
                <button
                  onClick={() => setShowAllComplete(v => !v)}
                  className="text-sm text-indigo-600 hover:text-indigo-800 mt-1"
                >
                  {showAllComplete ? 'Show less' : `Show all (${complete.length})`}
                </button>
              )}
            </section>
          )}

          {/* ── Skipped ──────────────────────────────────────────────────── */}
          {skipped.length > 0 && (
            <section>
              <button
                onClick={() => setShowSkipped(v => !v)}
                className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 hover:text-gray-700 flex items-center gap-2"
              >
                ⏭ Skipped ({skipped.length})
                <span className="text-xs font-normal normal-case">
                  {showSkipped ? '▲ hide' : '▼ show'}
                </span>
              </button>
              {showSkipped && (
                <div className="mt-2">
                  {skipped.map(item => renderRow(item, false))}
                </div>
              )}
            </section>
          )}

          {/* Empty state */}
          {items.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🗂</div>
              <div className="text-sm">No prompts in the queue yet.</div>
              <button
                onClick={() => setShowAdd(true)}
                className="mt-4 text-sm text-indigo-600 hover:text-indigo-800"
              >
                + Add your first prompt
              </button>
            </div>
          )}
        </div>

        {/* ── Auto-Runner Settings ────────────────────────────────────────── */}
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-[#1a1f36] mb-4 flex items-center gap-2">
            ⚙️ Auto-Runner Settings
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${autoRunEnabled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {autoRunEnabled ? '🟢 Active' : '⏸ Paused'}
            </span>
            {savingSettings && <span className="text-xs text-gray-400">Saving…</span>}
          </h2>
          <div className="space-y-4 max-w-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Auto-Run Queue</p>
                <p className="text-xs text-gray-500">BoClaw checks queue every ~30min and runs items automatically</p>
              </div>
              <button onClick={async () => { const next = !autoRunEnabled; setAutoRunEnabled(next); await saveQueueSetting('queue_auto_run_enabled', next) }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoRunEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoRunEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Pre-Run Security Gate</p>
                <p className="text-xs text-gray-500">Check for P0 errors and site health before each queue item</p>
              </div>
              <button onClick={async () => { const next = !securityGateEnabled; setSecurityGateEnabled(next); await saveQueueSetting('queue_security_gate_enabled', next) }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${securityGateEnabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${securityGateEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
