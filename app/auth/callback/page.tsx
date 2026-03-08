'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Suspense } from 'react'

const PENDING_INVITE_KEY = 'pp_pending_invite'
const REFERRAL_CODE_KEY  = 'pp_referral_code'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Verifying your email…')

  useEffect(() => {
    async function handle() {
      const code  = searchParams.get('code')
      const invite = searchParams.get('invite') || localStorage.getItem(PENDING_INVITE_KEY)

      if (!code) {
        // No PKCE code — might be implicit flow with hash tokens (handled by Supabase client automatically)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await postSessionWork(session.access_token, session.user, invite)
        } else {
          setStatus('Verification failed — please try again.')
          setTimeout(() => router.push('/login'), 2000)
        }
        return
      }

      setStatus('Completing sign-in…')
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error || !data?.session) {
        setStatus('Verification failed — please try again.')
        setTimeout(() => router.push('/login?error=callback_failed'), 2000)
        return
      }

      await postSessionWork(data.session.access_token, data.session.user, invite)
    }

    handle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function postSessionWork(
    accessToken: string,
    user: { id: string; user_metadata?: Record<string, unknown> },
    invite: string | null
  ) {
    setStatus('Setting up your account…')

    // ── Record referral (idempotent) ─────────────────────────────────────────
    // Check user_metadata first (set at signUp if ref code was present),
    // then fall back to localStorage
    const metaCode = user.user_metadata?.referred_by_code as string | undefined
    const lsCode   = localStorage.getItem(REFERRAL_CODE_KEY)
    const refCode  = metaCode || lsCode

    if (refCode) {
      try {
        await fetch('/api/partner/record-referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ referral_code: refCode }),
        })
        localStorage.removeItem(REFERRAL_CODE_KEY)
      } catch { /* non-fatal */ }
    }

    // ── Handle pending invite ────────────────────────────────────────────────
    const pendingToken = invite || localStorage.getItem(PENDING_INVITE_KEY)
    if (pendingToken) {
      try {
        const res = await fetch('/api/invite/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ token: pendingToken }),
        })
        const d = await res.json()
        localStorage.removeItem(PENDING_INVITE_KEY)
        if (d.patent_id) {
          router.push(`/dashboard/patents/${d.patent_id}`)
          return
        }
      } catch { /* non-fatal — fall through to dashboard */ }
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">{status}</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  )
}
