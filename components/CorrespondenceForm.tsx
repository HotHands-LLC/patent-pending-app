'use client'
import { useRef, useState } from 'react'
import { Patent, CORRESPONDENCE_TYPE_LABELS } from '@/lib/supabase'

interface Props {
  patents: Patent[]
  preselectedPatentId?: string
  ownerId: string
  authToken?: string
  onSuccess: () => void
  onCancel: () => void
  onTierRequired?: () => void
}

const ATTACHMENT_ACCEPT = '.pdf,.txt,.docx,.doc,.png,.jpg,.jpeg'
const MAX_ATTACH_BYTES = 10 * 1024 * 1024

function formatBytes(b: number) {
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / 1048576).toFixed(1)}MB`
}

export default function CorrespondenceForm({ patents, preselectedPatentId, ownerId, authToken, onSuccess, onCancel, onTierRequired }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [attachError, setAttachError] = useState('')
  const [form, setForm] = useState({
    title: '',
    type: 'email',
    patent_id: preselectedPatentId || '',
    correspondence_date: today,
    from_party: '',
    to_party: '',
    content: '',
    tags: '',
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setAttachError('')
    if (!f) { setAttachFile(null); return }
    if (f.size > MAX_ATTACH_BYTES) {
      setAttachError(`${f.name} exceeds 10MB limit.`)
      setAttachFile(null)
      return
    }
    setAttachFile(f)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.type) return
    setSaving(true)

    let attachments: { name: string; size: number; storage_path: string; signed_url: string }[] = []

    // ── Upload attachment if present ──────────────────────────────────────────
    if (attachFile && authToken) {
      try {
        const fd = new FormData()
        fd.append('file', attachFile)
        if (form.patent_id) fd.append('patent_id', form.patent_id)
        const res = await fetch('/api/correspondence/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body: fd,
        })
        const json = await res.json()
        if (!res.ok) {
          setAttachError(json.error || 'File upload failed')
          setSaving(false)
          return
        }
        attachments = [{ name: json.name, size: json.size, storage_path: json.storage_path, signed_url: json.signed_url }]
      } catch {
        setAttachError('Network error uploading file — please try again.')
        setSaving(false)
        return
      }
    }

    const payload: Record<string, unknown> = {
      title: form.title,
      type: form.type,
      owner_id: ownerId,
      correspondence_date: form.correspondence_date,
      from_party: form.from_party || null,
      to_party: form.to_party || null,
      content: form.content || null,
      patent_id: form.patent_id || null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
      attachments: attachments.length ? attachments : [],
    }

    // ── POST to server-side route (tier-gated) ──────────────────────────────
    const res = await fetch('/api/correspondence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      onSuccess()
    } else {
      const json = await res.json().catch(() => ({}))
      if (res.status === 403 && json.code === 'TIER_REQUIRED') {
        onTierRequired?.()
      } else {
        console.error('[CorrespondenceForm] save error:', json.error)
      }
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Title *</label>
        <input
          required
          type="text"
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          placeholder="e.g., Office Action Response"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px]"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Type *</label>
          <select
            required
            value={form.type}
            onChange={e => setForm({ ...form, type: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px] bg-white"
          >
            {Object.entries(CORRESPONDENCE_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date *</label>
          <input
            required
            type="date"
            value={form.correspondence_date}
            onChange={e => setForm({ ...form, correspondence_date: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px]"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Patent (optional)</label>
        <select
          value={form.patent_id}
          onChange={e => setForm({ ...form, patent_id: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px] bg-white"
        >
          <option value="">— Not patent-specific —</option>
          {patents.map(p => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">From</label>
          <input
            type="text"
            value={form.from_party}
            onChange={e => setForm({ ...form, from_party: e.target.value })}
            placeholder="e.g., USPTO, Sarah Simpson"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">To</label>
          <input
            type="text"
            value={form.to_party}
            onChange={e => setForm({ ...form, to_party: e.target.value })}
            placeholder="e.g., Chad Bostwick"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px]"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Content</label>
        <textarea
          value={form.content}
          onChange={e => setForm({ ...form, content: e.target.value })}
          rows={5}
          placeholder="Notes, summary, or full text..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] resize-y"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tags (comma-separated)</label>
        <input
          type="text"
          value={form.tags}
          onChange={e => setForm({ ...form, tags: e.target.value })}
          placeholder="e.g., office-action, prior-art, urgent"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] min-h-[44px]"
        />
      </div>

      {/* ── File Attachment ────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Attachment (optional)
        </label>
        {attachFile ? (
          <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <span className="text-base">📎</span>
            <span className="flex-1 truncate font-medium text-blue-800">{attachFile.name}</span>
            <span className="text-xs text-blue-500 flex-shrink-0">{formatBytes(attachFile.size)}</span>
            <button
              type="button"
              onClick={() => { setAttachFile(null); if (fileRef.current) fileRef.current.value = '' }}
              className="text-blue-400 hover:text-blue-600 flex-shrink-0 text-xs"
            >
              ✕ Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full px-4 py-2.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
          >
            📎 Attach a file — PDF, TXT, DOCX, PNG, JPG (max 10MB)
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {attachError && (
          <p className="mt-1.5 text-xs text-red-600">⚠️ {attachError}</p>
        )}
        {attachFile && !authToken && (
          <p className="mt-1.5 text-xs text-amber-600">⚠️ File upload requires a logged-in session.</p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 sm:flex-none px-5 py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50 min-h-[44px]"
        >
          {saving ? (attachFile ? 'Uploading & saving...' : 'Saving...') : 'Add Correspondence'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 sm:flex-none px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
