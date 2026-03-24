'use client'
import { useState } from 'react'

interface Props {
  patentId: string
  patentTitle: string
  dealType: string | null
  onClose: () => void
}

export default function MarketplaceInquiryModal({ patentId, patentTitle, dealType, onClose }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/marketplace/intro-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patent_id: patentId, sender_name: name, sender_email: email, message }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed.'); return }
      setDone(true)
    } catch { setError('Network error — please try again.') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{dealType === 'fixed' ? 'Buy Now' : 'Request Introduction'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">
          {done ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="font-bold text-gray-900 mb-2">Introduction Sent</h3>
              <p className="text-sm text-gray-500">Your introduction has been sent. The inventor will be in touch.</p>
              <button onClick={onClose} className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">Close</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-500 truncate">{patentTitle}</p>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Your name *</label>
                <input value={name} onChange={e => setName(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="Full name" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Your email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Message to inventor <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="Introduce yourself and your interest…" />
              </div>
              <button type="submit" disabled={submitting}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {submitting ? 'Sending…' : 'Send Introduction Request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
