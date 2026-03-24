'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

export default function NewPatentPage() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    inventors: '',
    provisional_number: '',
    application_number: '',
    filing_date: '',
    provisional_deadline: '',
    status: 'provisional',
    tags: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // Auto-calculate 12-month deadline from filing date
  function handleFilingDateChange(date: string) {
    const deadline = date ? new Date(date + 'T00:00:00') : null
    if (deadline) {
      deadline.setFullYear(deadline.getFullYear() + 1)
      const ddStr = deadline.toISOString().split('T')[0]
      setForm(f => ({ ...f, filing_date: date, provisional_deadline: ddStr }))
    } else {
      setForm(f => ({ ...f, filing_date: date }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data, error: err } = await supabase.from('patents').insert({
      owner_id: user.id,
      title: form.title,
      description: form.description || null,
      inventors: form.inventors ? form.inventors.split(',').map(s => s.trim()).filter(Boolean) : [],
      provisional_number: form.provisional_number || null,
      application_number: form.application_number || null,
      filing_date: form.filing_date || null,
      provisional_deadline: form.provisional_deadline || null,
      status: form.status,
      tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    }).select().single()

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    // Also create the deadline record
    if (data && form.provisional_deadline) {
      await supabase.from('patent_deadlines').insert({
        patent_id: data.id,
        owner_id: user.id,
        deadline_type: 'non_provisional',
        due_date: form.provisional_deadline,
        notes: 'File non-provisional or PCT by this date — 12 months from provisional',
      })
    }

    router.push(`/dashboard/patents/${data?.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1a1f36]">Register New Patent</h1>
          <p className="text-gray-500 mt-1">Add a patent to your portfolio. Deadline auto-calculated from filing date.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Patent Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
              placeholder="e.g. QR+ Interactive Media Platform"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Inventors</label>
            <input
              type="text"
              value={form.inventors}
              onChange={(e) => setForm(f => ({ ...f, inventors: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
              placeholder="Chad Bostwick, Jane Smith (comma-separated)"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Filing Date</label>
              <input
                type="date"
                value={form.filing_date}
                onChange={(e) => handleFilingDateChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">
                Provisional Deadline
                <span className="text-gray-400 font-normal"> (auto-calculated)</span>
              </label>
              <input
                type="date"
                value={form.provisional_deadline}
                onChange={(e) => setForm(f => ({ ...f, provisional_deadline: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] bg-yellow-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Provisional Number</label>
              <input
                type="text"
                value={form.provisional_number}
                onChange={(e) => setForm(f => ({ ...f, provisional_number: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                placeholder="e.g. 63/791,240"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Application Number</label>
              <input
                type="text"
                value={form.application_number}
                onChange={(e) => setForm(f => ({ ...f, application_number: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                placeholder="e.g. 17/123,456"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
            >
              {['provisional', 'non_provisional', 'published', 'granted', 'abandoned'].map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
              placeholder="Brief description of the invention..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Tags</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
              placeholder="ai, mobile, saas (comma-separated)"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#1a1f36] text-white rounded-lg font-medium text-sm hover:bg-[#2d3561] transition-colors disabled:opacity-50"
            >
              {saving ? 'Registering...' : 'Register Patent'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
