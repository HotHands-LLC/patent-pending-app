'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Branch = 'choose' | 'scratch' | 'import'
type ImportStatus = 'provisional' | 'non_provisional' | 'granted' | 'published' | 'abandoned'

interface LookupResult {
  application_number: string
  patent_number: string
  title: string
  inventors: string[]
  filing_date: string | null
  provisional_deadline: string | null
  status: string
  status_text: string
  abstract: string
}

interface Props {
  onClose: () => void
  authToken: string
}

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ImportStatus, {
  label: string; emoji: string; fields: string[]; numberLabel: string; numberPlaceholder: string;
}> = {
  provisional: {
    label: 'Provisional', emoji: '📝',
    fields: ['provisional_number', 'filing_date', 'provisional_deadline'],
    numberLabel: 'Provisional Application #', numberPlaceholder: '63/123,456',
  },
  non_provisional: {
    label: 'Non-Provisional (Utility)', emoji: '📋',
    fields: ['application_number', 'filing_date', 'provisional_number'],
    numberLabel: 'Application #', numberPlaceholder: '17/123,456',
  },
  granted: {
    label: 'Granted / Issued', emoji: '🏆',
    fields: ['patent_number', 'application_number', 'filing_date'],
    numberLabel: 'Patent #', numberPlaceholder: 'US10,123,456',
  },
  published: {
    label: 'Published (Pre-Grant)', emoji: '📰',
    fields: ['application_number', 'filing_date'],
    numberLabel: 'Publication #', numberPlaceholder: 'US20210123456A1',
  },
  abandoned: {
    label: 'Abandoned', emoji: '🗂️',
    fields: ['application_number', 'filing_date'],
    numberLabel: 'Application #', numberPlaceholder: '17/123,456',
  },
}

// ── Reusable input ─────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1a1f36] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function NewPatentModal({ onClose, authToken }: Props) {
  const router = useRouter()
  const [branch, setBranch] = useState<Branch>('choose')
  const [importStatus, setImportStatus] = useState<ImportStatus>('provisional')
  const [lookupQuery, setLookupQuery] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [form, setForm] = useState({
    title: '',
    inventors: '',
    provisional_number: '',
    application_number: '',
    patent_number: '',
    filing_date: '',
    provisional_deadline: '',
    description: '',
    tags: '',
  })

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  // Auto-calc deadline when filing date changes
  function handleFilingDate(date: string) {
    set('filing_date', date)
    if (date && importStatus === 'provisional') {
      const d = new Date(date + 'T00:00:00')
      d.setFullYear(d.getFullYear() + 1)
      set('provisional_deadline', d.toISOString().split('T')[0])
    }
  }

  // USPTO lookup
  const handleLookup = useCallback(async () => {
    if (!lookupQuery.trim()) return
    setLooking(true); setLookupError(''); setLookupResult(null)
    try {
      const res = await fetch(`/api/patents/lookup-uspto?q=${encodeURIComponent(lookupQuery)}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      const json = await res.json()
      if (!res.ok) { setLookupError(json.error || 'Lookup failed'); return }
      if (!json.found) { setLookupError(json.message || 'Not found in USPTO records.'); return }
      const r: LookupResult = json.results[0]
      setLookupResult(r)
      // Pre-fill form
      if (r.title) set('title', r.title)
      if (r.inventors?.length) set('inventors', r.inventors.join(', '))
      if (r.filing_date) handleFilingDate(r.filing_date)
      if (r.provisional_deadline) set('provisional_deadline', r.provisional_deadline)
      if (r.application_number) set('application_number', r.application_number)
      if (r.abstract) set('description', r.abstract)
      if (r.status) setImportStatus(r.status as ImportStatus)
    } catch { setLookupError('Network error — try again.') }
    finally { setLooking(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupQuery, authToken, importStatus])

  // Save patent record
  async function handleSave() {
    if (!form.title.trim()) { setSaveError('Title is required.'); return }
    setSaving(true); setSaveError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const inventorList = form.inventors ? form.inventors.split(',').map(s => s.trim()).filter(Boolean) : []
    const tagList = form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : []

    const payload = {
      owner_id: user.id,
      title: form.title.trim(),
      description: form.description || null,
      inventors: inventorList,
      provisional_number: form.provisional_number || null,
      application_number: form.application_number || null,
      filing_date: form.filing_date || null,
      provisional_deadline: form.provisional_deadline || null,
      status: importStatus,
      tags: tagList,
    }

    const { data, error } = await supabase.from('patents').insert(payload).select().single()
    if (error) { setSaveError(error.message); setSaving(false); return }

    // Create deadline record if provisional_deadline set
    if (data && form.provisional_deadline) {
      await supabase.from('patent_deadlines').insert({
        patent_id: data.id,
        owner_id: user.id,
        deadline_type: 'non_provisional',
        due_date: form.provisional_deadline,
        notes: 'File non-provisional or PCT by this date (12 months from provisional)',
      })
    }

    onClose()
    router.push(`/dashboard/patents/${data?.id}`)
  }

  const cfg = STATUS_CONFIG[importStatus]

  // ── Overlay ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            {branch !== 'choose' && (
              <button onClick={() => { setBranch('choose'); setLookupResult(null); setLookupError('') }}
                className="text-xs text-gray-400 hover:text-gray-600 mb-1 block">← Back</button>
            )}
            <h2 className="text-lg font-bold text-[#1a1f36]">
              {branch === 'choose' && '+ New Patent'}
              {branch === 'scratch' && '🚀 Start from Scratch'}
              {branch === 'import' && '📋 Import Existing Patent'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* ── CHOOSE BRANCH ──────────────────────────────────────────────── */}
        {branch === 'choose' && (
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-500 mb-5">How do you want to add this patent?</p>

            {/* Start from scratch → intake wizard */}
            <button
              onClick={() => { onClose(); router.push('/intake/new') }}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-[#1a1f36] hover:bg-[#1a1f36]/5 transition-all text-left group"
            >
              <span className="text-3xl flex-shrink-0 mt-0.5">🚀</span>
              <div>
                <div className="font-semibold text-[#1a1f36] text-sm group-hover:text-[#1a1f36]">Start from scratch</div>
                <div className="text-xs text-gray-500 mt-0.5">Answer a few questions about your invention → AI generates claims + spec for $49</div>
              </div>
            </button>

            {/* Smart Handoff */}
            <button
              onClick={() => { onClose(); router.push('/intake/new?mode=handoff') }}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-amber-400 hover:bg-amber-50/50 transition-all text-left group"
            >
              <span className="text-3xl flex-shrink-0 mt-0.5">⚡</span>
              <div>
                <div className="font-semibold text-[#1a1f36] text-sm">I already have research</div>
                <div className="text-xs text-gray-500 mt-0.5">Upload a PDF, DOCX, or notes → AI extracts and fast-tracks your intake for $49</div>
              </div>
            </button>

            {/* Import existing */}
            <button
              onClick={() => setBranch('import')}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group"
            >
              <span className="text-3xl flex-shrink-0 mt-0.5">📋</span>
              <div>
                <div className="font-semibold text-[#1a1f36] text-sm">Import filed / issued patent</div>
                <div className="text-xs text-gray-500 mt-0.5">Track a patent you already filed — paste the number to auto-fill from USPTO records</div>
              </div>
            </button>
          </div>
        )}

        {/* ── IMPORT BRANCH ──────────────────────────────────────────────── */}
        {branch === 'import' && (
          <div className="p-6 space-y-5">

            {/* Status picker */}
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-2">Patent Status</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(STATUS_CONFIG) as ImportStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setImportStatus(s)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      importStatus === s
                        ? 'border-[#1a1f36] bg-[#1a1f36] text-white'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span>{STATUS_CONFIG[s].emoji}</span>
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* USPTO lookup */}
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1">
                {cfg.numberLabel}
                <span className="font-normal text-gray-400 ml-1">— lookup from USPTO</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={lookupQuery}
                  onChange={e => setLookupQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                  placeholder={cfg.numberPlaceholder}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                />
                <button
                  onClick={handleLookup}
                  disabled={looking || !lookupQuery.trim()}
                  className="px-4 py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {looking ? '⏳' : '🔍 Lookup'}
                </button>
              </div>
              {lookupError && (
                <p className="text-xs text-amber-600 mt-1">⚠️ {lookupError}</p>
              )}
              {lookupResult && (
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                  ✅ Found: <strong>{lookupResult.title || 'Untitled'}</strong>
                  {lookupResult.status_text && <span className="ml-1 opacity-60">({lookupResult.status_text})</span>}
                  <span className="block opacity-70 mt-0.5">Fields pre-filled below — review and edit as needed.</span>
                </div>
              )}
            </div>

            {/* Dynamic form fields */}
            <Field
              label="Patent Title *"
              value={form.title}
              onChange={v => set('title', v)}
              placeholder="e.g. Systems and Methods for Traffic Stop Communication"
            />

            <Field
              label="Inventor(s)"
              value={form.inventors}
              onChange={v => set('inventors', v)}
              placeholder="Chad Bostwick, Jane Smith (comma-separated)"
            />

            {cfg.fields.includes('provisional_number') && (
              <Field
                label="Provisional Application #"
                value={form.provisional_number}
                onChange={v => set('provisional_number', v)}
                placeholder="63/123,456"
              />
            )}
            {cfg.fields.includes('application_number') && (
              <Field
                label="Application #"
                value={form.application_number}
                onChange={v => set('application_number', v)}
                placeholder="17/123,456"
              />
            )}
            {cfg.fields.includes('patent_number') && (
              <Field
                label="Patent Number"
                value={form.patent_number}
                onChange={v => set('patent_number', v)}
                placeholder="US10,123,456"
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Filing Date"
                value={form.filing_date}
                onChange={handleFilingDate}
                type="date"
              />
              {importStatus === 'provisional' && (
                <Field
                  label="Deadline (auto)"
                  value={form.provisional_deadline}
                  onChange={v => set('provisional_deadline', v)}
                  type="date"
                  hint="+12 months from filing"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1">Description / Abstract</label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                placeholder="Brief description or abstract..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
              />
            </div>

            <Field
              label="Tags"
              value={form.tags}
              onChange={v => set('tags', v)}
              placeholder="ai, mobile, saas (comma-separated)"
            />

            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{saveError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="flex-1 py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Adding to Portfolio…' : '📋 Add to Portfolio'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
