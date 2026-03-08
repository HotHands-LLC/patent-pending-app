'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import { Suspense } from 'react'

type Step = 'loading' | 'already-enrolled' | 'scan' | 'verify' | 'done' | 'error'

function Setup2FAForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'
  const required = searchParams.get('required') === 'true'

  const [step, setStep] = useState<Step>('loading')
  const [qrUrl, setQrUrl] = useState('')
  const [totpUri, setTotpUri] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Clean up any pending (unverified) factor before enrolling a new one
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verified = factors?.totp?.find(f => f.status === 'verified')
      if (verified) { setStep('already-enrolled'); return }

      // Unenroll any pending (not-yet-verified) factors to avoid stale state
      const pending = factors?.totp?.filter(f => f.status !== 'verified') ?? []
      for (const pf of pending) {
        await supabase.auth.mfa.unenroll({ factorId: pf.id })
      }

      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'PatentPending',
      })
      if (enrollErr || !data) {
        setError(enrollErr?.message ?? 'Enrollment failed')
        setStep('error')
        return
      }

      setFactorId(data.id)
      setQrUrl(data.totp.qr_code)
      setTotpUri(data.totp.uri)
      setStep('scan')
    }
    init()
  }, [router])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr || !challengeData) {
      setError(challengeErr?.message ?? 'Challenge failed')
      setLoading(false)
      return
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code.replace(/\s/g, ''),
    })
    setLoading(false)

    if (verifyErr) {
      setError(verifyErr.message.includes('expired')
        ? 'Code expired — enter the current 6-digit code'
        : 'Invalid code — check your authenticator app')
      return
    }

    setStep('done')
    await supabase.auth.refreshSession()
    setTimeout(() => router.push(next), 1500)
  }

  if (step === 'loading') return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </>
  )

  if (step === 'done') return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-lg font-bold text-gray-800">Two-factor authentication enabled</p>
          <p className="text-sm text-gray-500 mt-1">Redirecting…</p>
        </div>
      </div>
    </>
  )

  if (step === 'already-enrolled') return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-sm w-full p-8 text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">2FA already active</h1>
          <p className="text-sm text-gray-500 mb-6">Your account is protected with two-factor authentication.</p>
          <button
            onClick={() => router.push(next)}
            className="w-full px-4 py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561]"
          >
            Continue →
          </button>
        </div>
      </div>
    </>
  )

  if (step === 'error') return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-semibold text-gray-800 mb-2">Setup failed</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold"
          >
            Try Again
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-md mx-auto">
          {required && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              🔐 Two-factor authentication is required for your account. Please complete setup to continue.
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="bg-[#1a1f36] text-white px-6 py-5 rounded-t-2xl">
              <h1 className="text-lg font-bold">Set Up Two-Factor Authentication</h1>
              <p className="text-sm text-white/70 mt-1">Adds a second layer of security to your account</p>
            </div>

            <div className="p-6 space-y-6">
              {step === 'scan' && (
                <>
                  <div>
                    <h2 className="text-sm font-bold text-gray-700 mb-3">Step 1 — Scan this QR code</h2>
                    <p className="text-sm text-gray-500 mb-4">
                      Open Google Authenticator, Authy, 1Password, or any TOTP app and scan the code below.
                    </p>
                    <div className="flex justify-center mb-4">
                      {qrUrl ? (
                        <div className="border-2 border-gray-200 rounded-xl p-3 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrUrl} alt="TOTP QR Code" width={200} height={200} />
                        </div>
                      ) : (
                        <div className="w-48 h-48 bg-gray-100 rounded-xl flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-xs text-gray-500 font-mono break-all flex-1">{totpUri}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(totpUri); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 whitespace-nowrap ml-2 font-semibold"
                      >
                        {copied ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setStep('verify')}
                    className="w-full px-4 py-3 bg-[#1a1f36] text-white rounded-lg text-sm font-bold hover:bg-[#2d3561]"
                  >
                    I&apos;ve scanned it — Enter Code →
                  </button>
                </>
              )}

              {step === 'verify' && (
                <form onSubmit={handleVerify} className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-gray-700 mb-1">Step 2 — Enter the 6-digit code</h2>
                    <p className="text-sm text-gray-500 mb-4">Enter the code from your authenticator app to confirm setup.</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="000000"
                      autoFocus
                      className="w-full text-center text-2xl tracking-[0.5em] font-mono border-2 border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                    />
                    {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={loading || code.length < 6}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-60"
                  >
                    {loading ? 'Verifying…' : 'Confirm & Enable 2FA'}
                  </button>
                  <button type="button" onClick={() => setStep('scan')}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
                    ← Back to QR code
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function DashboardSetup2FAPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <Setup2FAForm />
    </Suspense>
  )
}
