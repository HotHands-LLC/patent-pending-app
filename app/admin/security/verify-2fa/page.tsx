'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Suspense } from 'react'

function VerifyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/admin'

  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [notEnrolled, setNotEnrolled] = useState(false)
  const [alreadyVerified, setAlreadyVerified] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Check current assurance level
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === 'aal2') {
        setAlreadyVerified(true)
        router.push(next)
        return
      }

      // Check enrolled factors
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verified = factors?.totp?.find(f => f.status === 'verified')
      if (!verified) {
        setNotEnrolled(true)
        router.push('/admin/security/setup-2fa')
        return
      }

      setFactorId(verified.id)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
    init()
  }, [router, next])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setLoading(true)
    setError('')

    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr || !challenge) {
      setError(challengeErr?.message ?? 'Challenge failed')
      setLoading(false)
      return
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.replace(/\s/g, ''),
    })
    setLoading(false)

    if (verifyErr) {
      setCode('')
      setError(verifyErr.message.includes('expired') ? 'Code expired — enter the current 6-digit code' : 'Invalid code — try again')
      inputRef.current?.focus()
      return
    }

    // Refresh session to get aal2 JWT
    await supabase.auth.refreshSession()
    router.push(next)
  }

  if (alreadyVerified || notEnrolled) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-sm w-full">
        {/* Header */}
        <div className="bg-[#1a1f36] text-white px-6 py-5 rounded-t-2xl text-center">
          <div className="text-3xl mb-2">🔐</div>
          <h1 className="text-lg font-bold">Admin Verification Required</h1>
          <p className="text-sm text-white/70 mt-1">Enter your authenticator code to continue</p>
        </div>

        <form onSubmit={handleVerify} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 text-center">
              6-Digit Code
            </label>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="000000"
              autoComplete="one-time-code"
              className="w-full text-center text-3xl tracking-[0.6em] font-mono border-2 border-gray-200 rounded-xl px-4 py-4 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {error && (
              <p className="text-sm text-red-600 text-center mt-3 font-medium">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full px-4 py-3 bg-[#1a1f36] text-white rounded-xl text-sm font-bold hover:bg-[#2d3561] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying…' : 'Verify & Enter Admin'}
          </button>

          <div className="text-center space-y-1">
            <p className="text-xs text-gray-400">
              Open your authenticator app and enter the current code for <strong>PatentPending</strong>
            </p>
            <button
              type="button"
              onClick={() => router.push('/admin/security/setup-2fa')}
              className="text-xs text-indigo-500 hover:underline"
            >
              Lost access to your authenticator? Re-enroll →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Verify2FAPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyForm />
    </Suspense>
  )
}
