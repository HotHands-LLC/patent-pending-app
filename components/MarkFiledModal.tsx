'use client'
import { useState } from 'react'
import { Patent } from '@/lib/supabase'

interface MarkFiledModalProps {
  patent: Patent
  authToken: string
  onClose: () => void
  onFiled: (updated: Partial<Patent>) => void
}

export default function MarkFiledModal({ patent, authToken, onClose, onFiled }: MarkFiledModalProps) {
  const today = new Date().toISOString().split('T')[0]

  const [appNumber, setAppNumber] = useState('')
  const [filedAt, setFiledAt]     = useState(today)
  const [receiptFile, setReceiptFile]     = useState<File | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!appNumber.trim()) { setError('USPTO Application Number is required.'); return }

    setLoading(true)
    setError('')

    try {
      // Convert receipt file to base64 if provided
      let receiptBase64: string | undefined
      let receiptFilename: string | undefined

      if (receiptFile) {
        const buf = await receiptFile.arrayBuffer()
        receiptBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        receiptFilename = receiptFile.name
      }

      const res = await fetch(`/api/patents/${patent.id}/mark-filed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          app_number:       appNumber.trim(),
          filed_at:         filedAt,
          receipt_file:     receiptBase64,
          receipt_filename: receiptFilename,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || `Server error ${res.status}`)
        return
      }

      onFiled(data.patent)
      onClose()

    } catch (err) {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Compute non-prov deadline preview from selected date
  const previewDeadline = filedAt
    ? (() => {
        const d = new Date(filedAt + 'T00:00:00')
        d.setFullYear(d.getFullYear() + 1)
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      })()
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📬 Mark as Filed</h2>
            <p className="text-xs text-gray-500 mt-0.5">{patent.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* App number */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              USPTO Application Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={appNumber}
              onChange={e => setAppNumber(e.target.value)}
              placeholder="e.g. 63/123,456"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]/20 focus:border-[#1a1f36]"
              disabled={loading}
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              Found on the USPTO Patent Center filing receipt / confirmation email.
            </p>
          </div>

          {/* Filing date */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Filing Date
            </label>
            <input
              type="date"
              value={filedAt}
              max={today}
              onChange={e => setFiledAt(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]/20 focus:border-[#1a1f36]"
              disabled={loading}
            />
            {previewDeadline && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                ⏰ Non-provisional deadline: <strong>{previewDeadline}</strong>
              </p>
            )}
          </div>

          {/* Filing receipt upload */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Filing Receipt PDF <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-gray-300 transition-colors">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
                className="hidden"
                id="receipt-upload"
                disabled={loading}
              />
              <label htmlFor="receipt-upload" className="cursor-pointer">
                {receiptFile ? (
                  <div className="text-sm text-green-700">
                    ✅ {receiptFile.name} ({(receiptFile.size / 1024).toFixed(1)} KB)
                  </div>
                ) : (
                  <div>
                    <div className="text-2xl mb-1">📄</div>
                    <div className="text-sm text-gray-500">Click to upload filing receipt</div>
                    <div className="text-xs text-gray-400 mt-0.5">PDF only — stored securely in your account</div>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              ⚠️ {error}
            </div>
          )}

          {/* Info box */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
            <div className="font-semibold">What happens after you confirm:</div>
            <ul className="list-disc list-inside space-y-0.5 text-blue-700">
              <li>Patent status changes to "Provisional Filed"</li>
              <li>12-month non-provisional countdown starts</li>
              <li>Enhancement tools unlock for the filing period</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-2.5 px-4 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !appNumber.trim()}
              className="flex-1 py-2.5 bg-[#1a1f36] text-white rounded-xl text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span> Saving…
                </span>
              ) : (
                '📬 Confirm Filing'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
