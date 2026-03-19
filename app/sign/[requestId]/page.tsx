'use client'
import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface SigningData {
  id: string
  patent_title: string
  application_number: string | null
  document_type: string
  document_label: string
  signer_name: string
  signer_email: string
  prefill_data: Record<string, string>
  status: string
  signed_at: string | null
  signed_date: string | null
  requested_by_name: string
  created_at: string
}

const DOC_EXPLANATIONS: Record<string, string> = {
  aia_01:
    "This is your inventor declaration — a formal statement that you're one of the original inventors of this patent. The USPTO requires this before examining the application. You're confirming the invention is genuinely yours.",
  sb0015a:
    "This certifies that you qualify as a micro entity, which reduces your USPTO filing fees by 80%. You're confirming you haven't filed more than 4 patents before and your income is below the threshold.",
  assignment:
    'This document transfers ownership or licensing rights for this patent. Review carefully before signing.',
  aia_08:
    'This is your oath or declaration under 37 CFR 1.63. You are confirming the truthfulness of the application contents.',
}

const S_SIG_REGEX = /^\/[a-zA-Z\s\-'.]+\/$/

function today(): string {
  return new Date().toISOString().split('T')[0]
}

export default function SignPage() {
  const params = useParams()
  const requestId = params?.requestId as string

  const [data, setData] = useState<SigningData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [signature, setSignature] = useState('')
  const [signatureError, setSignatureError] = useState<string | null>(null)
  const [signedDate, setSignedDate] = useState(today())
  const [attested, setAttested] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!requestId) return
    fetch(`/api/signing/${requestId}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? 'Not found')
        }
        return res.json()
      })
      .then((d: SigningData) => {
        setData(d)
        setSignature(`/${d.signer_name}/`)
        if (d.status === 'signed') {
          setSubmitted(true)
          setSignedDate(d.signed_date ?? today())
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [requestId])

  const handleSignatureChange = (val: string) => {
    setSignature(val)
    if (val && !S_SIG_REGEX.test(val)) {
      setSignatureError('Format must be /First Last/ — type your full name between forward slashes')
    } else {
      setSignatureError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch(`/api/signing/${requestId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          s_signature: signature,
          signed_date: signedDate,
          attested,
        }),
      })

      if (res.ok) {
        setSubmitted(true)
      } else {
        const err = await res.json()
        setSubmitError(err.error ?? 'Failed to submit signature')
      }
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const isValid = S_SIG_REGEX.test(signature) && attested && signedDate

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Request Not Found</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Confirmation screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#1a1f36]">PatentPending</h1>
          <p className="text-sm text-gray-500 mt-1">Document Signing</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Document Signed</h2>
          <p className="text-gray-600 text-sm mb-4">
            Your <strong>{data.document_label}</strong> has been saved to the patent record.{' '}
            <strong>{data.requested_by_name}</strong> has been notified.
          </p>
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-500">
            Signed: <strong>{signedDate}</strong>
          </div>
          <p className="text-xs text-gray-400 mt-6">
            Signed electronically pursuant to 37 CFR 1.4(d)(2)
          </p>
        </div>
      </div>
    )
  }

  const explanation = DOC_EXPLANATIONS[data.document_type] ?? 'This document requires your signature as part of the patent application process.'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-[#1a1f36]">PatentPending</h1>
        <p className="text-sm text-gray-500 mt-1">Document Signing</p>
      </div>

      <div className="w-full max-w-lg space-y-4">
        {/* Document info card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">{data.document_label}</h2>
          <p className="text-sm text-gray-500 mb-3">{data.patent_title}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
            <span>Requested by: {data.requested_by_name}</span>
            <span>Date: {new Date(data.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Explanation */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm text-blue-800 leading-relaxed">{explanation}</p>
        </div>

        {/* Signing form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
          {/* Read-only fields */}
          {data.application_number && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Application Number</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                {data.application_number}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Patent Title</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
              {data.patent_title}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Signer</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
              {data.signer_name}
            </div>
          </div>

          {/* S-signature input */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">
              Your S-signature
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Type your name between forward slashes: /First Last/
            </p>
            <input
              type="text"
              value={signature}
              onChange={(e) => handleSignatureChange(e.target.value)}
              placeholder="/Your Name/"
              className={`w-full px-4 py-3 border rounded-lg text-base font-mono focus:outline-none focus:ring-2 ${
                signatureError
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-gray-300 focus:ring-indigo-500'
              }`}
            />
            {signatureError && (
              <p className="text-red-500 text-xs mt-1">{signatureError}</p>
            )}
            <p className="text-xs text-gray-400 mt-1.5">
              S-signatures are legally valid under USPTO 37 CFR 1.4(d)(2)
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Date</label>
            <input
              type="date"
              value={signedDate}
              onChange={(e) => setSignedDate(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Attestation */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
            />
            <span className="text-sm text-gray-700">
              I confirm this is my own signature and I am the named signer.
            </span>
          </label>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={!isValid || submitting}
            className="w-full py-3.5 bg-[#1a1f36] text-white rounded-xl font-semibold text-base hover:bg-[#2d3561] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting…' : 'Sign Document'}
          </button>

          <p className="text-xs text-center text-gray-400">
            By signing, you agree this electronic signature is legally valid pursuant to 37 CFR 1.4(d)(2).
          </p>
        </form>

        <p className="text-center text-xs text-gray-400 pb-6">
          PatentPending · patentpending.app
        </p>
      </div>
    </div>
  )
}
