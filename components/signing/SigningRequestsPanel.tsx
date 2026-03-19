'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface SigningRequest {
  id: string
  signer_name: string
  signer_email: string
  document_type: string
  document_label: string
  status: 'pending' | 'viewed' | 'signed' | 'declined'
  signed_at: string | null
  signed_date: string | null
  correspondence_id: string | null
  created_at: string
  reminder_count: number
}

const DOCUMENT_LABELS: Record<string, string> = {
  aia_01: 'Inventor Declaration (AIA/01)',
  sb0015a: 'Micro Entity Certification (SB/0015a)',
  assignment: 'Patent Assignment',
  aia_08: 'Oath/Declaration (AIA/08)',
  other: 'Other Document',
}

const DOCUMENT_TYPES = Object.entries(DOCUMENT_LABELS)

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  viewed: 'bg-blue-100 text-blue-800 border border-blue-200',
  signed: 'bg-green-100 text-green-800 border border-green-200',
  declined: 'bg-red-100 text-red-800 border border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  viewed: 'Viewed',
  signed: 'Signed',
  declined: 'Declined',
}

interface Props {
  patentId: string
  applicationNumber?: string | null
}

export default function SigningRequestsPanel({ patentId, applicationNumber }: Props) {
  const [requests, setRequests] = useState<SigningRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [formEmail, setFormEmail] = useState('')
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('aia_01')
  const [formLabel, setFormLabel] = useState(DOCUMENT_LABELS.aia_01)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadRequests = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    try {
      const res = await fetch(`/api/patents/${patentId}/signing-requests`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setRequests(data)
      }
    } finally {
      setLoading(false)
    }
  }, [patentId])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const handleTypeChange = (type: string) => {
    setFormType(type)
    setFormLabel(DOCUMENT_LABELS[type] ?? 'Other Document')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch(`/api/patents/${patentId}/signing-requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              signer_email: formEmail,
              signer_name: formName,
              document_type: formType,
              document_label: formLabel,
            },
          ],
        }),
      })

      if (res.ok) {
        showToast('Request sent ✓')
        setShowForm(false)
        setFormEmail('')
        setFormName('')
        setFormType('aia_01')
        setFormLabel(DOCUMENT_LABELS.aia_01)
        await loadRequests()
      } else {
        const err = await res.json()
        showToast(err.error ?? 'Failed to send request')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemind = async (requestId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch(
      `/api/patents/${patentId}/signing-requests/${requestId}/remind`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      }
    )
    if (res.ok) {
      showToast('Reminder sent ✓')
    } else {
      showToast('Failed to send reminder')
    }
  }

  // Show panel when applicationNumber is set OR there are requests
  const shouldShow = !!(applicationNumber || requests.length > 0)
  if (!shouldShow && !loading) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5 mt-4">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Required Signatures
          </span>
          {requests.length > 0 && (
            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {requests.length}
            </span>
          )}
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            + Request Signatures
          </button>
        )}
      </div>

      <div className="px-5 py-4">
        {/* Inline form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">New Signature Request</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Signer Email</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="inventor@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Signer Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Document Type</label>
                <select
                  value={formType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {DOCUMENT_TYPES.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Document Label</label>
                <input
                  type="text"
                  required
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] disabled:opacity-50 min-h-[36px]"
              >
                {submitting ? 'Sending...' : 'Send Request'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[36px]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Empty state */}
        {!loading && requests.length === 0 && !showForm && (
          <div className="text-center py-6 text-gray-400">
            <p className="text-sm mb-3">No signature requests yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561]"
            >
              Request Signatures
            </button>
          </div>
        )}

        {/* Requests list */}
        {requests.length > 0 && (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                    <span className="text-sm font-medium text-gray-800 truncate">{r.document_label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{r.signer_name} · {r.signer_email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.status === 'signed' && r.correspondence_id && (
                    <a
                      href={`/dashboard/patents/${patentId}?tab=correspondence`}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      View
                    </a>
                  )}
                  {(r.status === 'pending' || r.status === 'viewed') && (
                    <button
                      onClick={() => handleRemind(r.id)}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 px-2 py-1 rounded"
                    >
                      Remind
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1f36] text-white px-5 py-2.5 rounded-full text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
