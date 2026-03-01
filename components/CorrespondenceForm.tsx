'use client'
import { useState } from 'react'
import { supabase, Patent, CORRESPONDENCE_TYPE_LABELS } from '@/lib/supabase'

interface Props {
  patents: Patent[]
  preselectedPatentId?: string
  ownerId: string
  onSuccess: () => void
  onCancel: () => void
}

export default function CorrespondenceForm({ patents, preselectedPatentId, ownerId, onSuccess, onCancel }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [saving, setSaving] = useState(false)
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.type) return
    setSaving(true)
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
    }
    const { error } = await supabase.from('patent_correspondence').insert([payload])
    setSaving(false)
    if (!error) onSuccess()
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

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 sm:flex-none px-5 py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50 min-h-[44px]"
        >
          {saving ? 'Saving...' : 'Add Correspondence'}
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
