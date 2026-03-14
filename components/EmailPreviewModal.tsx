'use client'
/**
 * EmailPreviewModal — reusable "Review before sending" email modal.
 *
 * When a correspondence record has tags including 'pending_email' or type 'outbound_email',
 * the correspondence panel shows a "Review & Send" button that opens this modal.
 *
 * Buttons: Edit, Copy to clipboard, Close.
 * When the full Resend preview-and-send flow is built, a "Send" button can be added here.
 */

import { useState, useEffect } from 'react'

interface EmailPreviewModalProps {
  title: string             // modal heading
  emailContent: string      // plain-text email body (contains To:, Subject:, body)
  onClose: () => void
}

function parseEmail(raw: string): { to: string; subject: string; body: string } {
  const lines = raw.split('\n')
  let to = ''
  let subject = ''
  let bodyStart = 0

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('To:')) { to = lines[i].replace('To:', '').trim(); bodyStart = i + 1 }
    if (lines[i].startsWith('Subject:')) { subject = lines[i].replace('Subject:', '').trim(); bodyStart = i + 1 }
    if (lines[i].trim() === '' && to && subject) { bodyStart = i + 1; break }
  }

  const body = lines.slice(bodyStart).join('\n').trim()
  return { to, subject, body }
}

export default function EmailPreviewModal({ title, emailContent, onClose }: EmailPreviewModalProps) {
  const [editing, setEditing]       = useState(false)
  const [editValue, setEditValue]   = useState(emailContent)
  const [copied, setCopied]         = useState(false)

  // Parse or re-parse when editing is confirmed
  const displayContent = editing ? editValue : emailContent
  const { to, subject, body } = parseEmail(displayContent)

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = displayContent
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-[#1a1f36] text-base leading-tight">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Review and copy — paste into your email client to send</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Email meta */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 space-y-1">
          {to && (
            <div className="flex items-start gap-2 text-xs">
              <span className="font-semibold text-gray-500 w-14 shrink-0">To:</span>
              <span className="text-gray-800">{to}</span>
            </div>
          )}
          {subject && (
            <div className="flex items-start gap-2 text-xs">
              <span className="font-semibold text-gray-500 w-14 shrink-0">Subject:</span>
              <span className="text-gray-800">{subject}</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {editing ? (
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full h-full min-h-[300px] text-sm text-gray-700 border border-indigo-300 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono leading-relaxed"
            />
          ) : (
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono">
              {body || emailContent}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center gap-2">
            {editing ? (
              <button onClick={() => setEditing(false)}
                className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">
                Done editing
              </button>
            ) : (
              <button onClick={() => setEditing(true)}
                className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
                ✏️ Edit
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors">
              Close
            </button>
            <button onClick={handleCopy}
              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}>
              {copied ? '✅ Copied!' : '📋 Copy to clipboard'}
            </button>
          </div>
        </div>

        {/* Coming soon note */}
        <div className="px-6 pb-3">
          <p className="text-[10px] text-gray-400 text-center leading-tight">
            Copy and paste into your email client (Gmail, Outlook, etc.) to send.
            In-app &quot;Send&quot; button coming soon.
          </p>
        </div>
      </div>
    </div>
  )
}
