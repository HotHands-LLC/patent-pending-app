'use client'
import { useState, useEffect, Suspense } from 'react'
import { trackEvent, getStoredUtm } from '@/components/GoogleAnalytics'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const PENDING_INVITE_KEY = 'pp_pending_invite'
const REFERRAL_CODE_KEY  = 'pp_referral_code'

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken    = searchParams.get('invite')
  const prefilledEmail = searchParams.get('email') ?? ''
  const refCode        = searchParams.get('ref')?.toUpperCase().trim() ?? null

  const [email, setEmail] = useState(prefilledEmail)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [referralBadge, setReferralBadge] = useState<string | null>(null)
  const [referralPartnerId, setReferralPartnerId] = useState<string | null>(null)

  // Store invite token + validate referral code
  useEffect(() => {
    if (inviteToken) localStorage.setItem(PENDING_INVITE_KEY, inviteToken)
    if (refCode) {
      localStorage.setItem(REFERRAL_CODE_KEY, refCode)
      trackEvent('signup_started', { ref_code: refCode, source: 'partner_referral' })
      // Validate code and get display name for trust badge
      fetch(`/api/partner/validate-code?code=${encodeURIComponent(refCode)}`)
        .then(r => r.json())
        .then(d => {
          if (d.valid) {
            setReferralBadge(d.display_name)
            setReferralPartnerId(d.partner_id)
          }
        })
        .catch(() => {})
    } else {
      // Check localStorage for a previously stored code (e.g. from landing page visit)
      const stored = localStorage.getItem(REFERRAL_CODE_KEY)
      if (stored) {
        fetch(`/api/partner/validate-code?code=${encodeURIComponent(stored)}`)
          .then(r => r.json())
          .then(d => {
            if (d.valid) { setReferralBadge(d.display_name); setReferralPartnerId(d.partner_id) }
          })
          .catch(() => {})
      }
    }
  }, [inviteToken, refCode])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const pendingRefCode = refCode ?? localStorage.getItem(REFERRAL_CODE_KEY)

    const utmParams = getStoredUtm()

    const { data, error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          // Store referral code in user metadata so auth/callback can read it
          // even when email confirmation is required (localStorage unavailable server-side)
          ...(pendingRefCode ? { referred_by_code: pendingRefCode } : {}),
          // Store UTM params so they survive email confirmation delay
          ...(Object.keys(utmParams).length > 0 ? { utm_params: utmParams } : {}),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?invite=${inviteToken ?? ''}`,
      },
    })

    if (signupErr) {
      setError(signupErr.message)
      setLoading(false)
      return
    }

    // If email confirmation is required, show done state
    if (data.user && !data.session) {
      trackEvent('signup_completed', { method: 'email_confirmation', has_referral: !!(refCode ?? localStorage.getItem(REFERRAL_CODE_KEY)) })
      setDone(true)
      setLoading(false)
      return
    }

    // Immediate session (e.g. confirmation disabled) — record referral + check pending invite
    if (data.session && data.user) {
      trackEvent('signup_completed', { method: 'immediate', has_referral: !!(refCode ?? localStorage.getItem(REFERRAL_CODE_KEY)) })
      await recordReferral(data.session.access_token, data.user.id)
      await handlePendingInvite(data.session.access_token)
      return
    }

    setLoading(false)
  }

  async function recordReferral(accessToken: string, _userId: string) {
    const code = refCode ?? localStorage.getItem(REFERRAL_CODE_KEY)
    const partnerId = referralPartnerId
    if (!code) return
    try {
      // Write referred_by_code + referred_by_partner_id to user's patent_profile
      await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          referred_by_code: code,
          ...(partnerId ? { referred_by_partner_id: partnerId } : {}),
        }),
      })
      localStorage.removeItem(REFERRAL_CODE_KEY)
    } catch { /* non-fatal */ }
  }

  async function handlePendingInvite(accessToken: string) {
    const pendingToken = localStorage.getItem(PENDING_INVITE_KEY)
    if (!pendingToken) { router.push('/dashboard'); return }

    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ token: pendingToken }),
      })
      const data = await res.json()
      localStorage.removeItem(PENDING_INVITE_KEY)
      if (res.ok) {
        router.push(`/dashboard/patents/${data.patent_id}`)
      } else {
        router.push('/dashboard')
      }
    } catch {
      localStorage.removeItem(PENDING_INVITE_KEY)
      router.push('/dashboard')
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="text-5xl mb-4">📧</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-600 text-sm">
          We sent a confirmation link to <strong>{email}</strong>.
          <br />Click it to finish creating your account and accept your invite.
        </p>
      </div>
    )
  }

  return (
    <>
      {referralBadge && !inviteToken && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 text-sm text-indigo-800 flex items-center gap-2">
          <span className="text-lg">⚖️</span>
          <span>You've been referred by <strong>{referralBadge}</strong></span>
        </div>
      )}
      {inviteToken && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 text-sm text-indigo-800">
          🎉 You have a pending patent invite. Create your account to accept it.
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Steve McCain"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            readOnly={!!prefilledEmail}
            className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${prefilledEmail ? 'bg-gray-50 text-gray-500' : ''}`}
            placeholder="you@example.com"
          />
          {prefilledEmail && (
            <p className="text-xs text-gray-400 mt-1">Email set by your invite — use a different address? <button type="button" onClick={() => setEmail('')} className="text-indigo-600 underline">Change</button></p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Min 8 characters"
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Creating account...' : 'Create Free Account →'}
        </button>
      </form>

      {/* Google OAuth */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-gray-200" /><span className="text-xs text-gray-400">or</span><div className="flex-1 h-px bg-gray-200" />
      </div>
      <button
        onClick={async () => {
          await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${typeof window !== 'undefined' ? window.location.origin : 'https://patentpending.app'}/auth/callback`,
              queryParams: { access_type: 'offline', prompt: 'consent' },
            },
          })
        }}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[44px]"
      >
        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
        Continue with Google
      </button>

      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account?{' '}
        <Link
          href={`/login${inviteToken ? `?invite=${inviteToken}&email=${encodeURIComponent(prefilledEmail)}` : ''}`}
          className="text-indigo-600 font-medium hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  )
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
          <p className="text-gray-500 mt-2 text-sm">Create your free account</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
          <Suspense fallback={<p className="text-gray-400 text-sm text-center">Loading...</p>}>
            <SignupForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
