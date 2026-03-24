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

  // Modal state
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<QueueItem | null>(null)
  const [doneItem, setDoneItem] = useState<QueueItem | null>(null)

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
          <button
            onClick={() => { setEditItem(null); setShowAdd(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <span className="text-base leading-none">+</span> Add Prompt
          </button>
        </div>

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
      </div>
    </div>
  )
}
