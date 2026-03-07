'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type InviteStatus = 'loading' | 'landing' | 'needs-login' | 'accepting' | 'success' | 'error'

interface InviteInfo {
  patent_title: string
  invited_email: string
  role: string
  role_label: string
}

const PENDING_INVITE_KEY = 'pp_pending_invite'

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<InviteStatus>('loading')
  const [message, setMessage] = useState('')
  const [info, setInfo] = useState<InviteInfo | null>(null)

  useEffect(() => {
    async function handleInvite() {
      // 1. Peek at invite details (no auth required)
      const peek = await fetch(`/api/invite/peek?token=${token}`)
      if (!peek.ok) {
        const d = await peek.json()
        setMessage(d.error ?? 'This invite link is invalid or has already been used.')
        setStatus('error')
        return
      }
      const inviteInfo: InviteInfo = await peek.json()
      setInfo(inviteInfo)

      // 2. Check auth state
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        // Store invite token for post-auth pickup
        localStorage.setItem(PENDING_INVITE_KEY, token)
        setStatus('landing')
        return
      }

      // 3. Authed — accept immediately
      setStatus('accepting')
      await acceptInvite(token, session.access_token, inviteInfo.patent_title)
    }

    handleInvite()
  }, [token, router])

  async function acceptInvite(t: string, bearerToken: string, patentTitle: string) {
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify({ token: t }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? 'Failed to accept invite')
        return
      }
      localStorage.removeItem(PENDING_INVITE_KEY)
      setStatus('success')
      setTimeout(() => router.push(`/dashboard/patents/${data.patent_id}`), 2000)
    } catch {
      setStatus('error')
      setMessage('Network error — please try again')
    }
  }

  const roleIcon: Record<string, string> = {
    co_inventor: '🔬',
    counsel: '⚖️',
    attorney: '📋',
    viewer: '👁️',
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">

        {status === 'loading' && (
          <>
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading invite...</p>
          </>
        )}

        {status === 'landing' && info && (
          <>
            <div className="text-5xl mb-4">{roleIcon[info.role] ?? '📩'}</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re invited!</h1>
            <p className="text-gray-600 mb-1">
              You&apos;ve been granted <strong>{info.role_label}</strong> access to:
            </p>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 my-4">
              <p className="font-bold text-indigo-900 text-lg">{info.patent_title}</p>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Sign in or create a free account to accept this invite.
              {info.invited_email && (
                <> This invite was sent to <strong>{info.invited_email}</strong>.</>
              )}
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href={`/signup?invite=${token}${info.invited_email ? `&email=${encodeURIComponent(info.invited_email)}` : ''}`}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
              >
                Create Free Account →
              </Link>
              <Link
                href={`/login?invite=${token}${info.invited_email ? `&email=${encodeURIComponent(info.invited_email)}` : ''}`}
                className="w-full py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:border-indigo-300 hover:text-indigo-700 transition-colors"
              >
                Sign In
              </Link>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              PatentPending accounts are free. No credit card required to accept an invite.
            </p>
          </>
        )}

        {status === 'accepting' && (
          <div className="flex items-center justify-center gap-3 text-gray-500 py-4">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Accepting invite...</span>
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Invite Accepted!</h2>
            <p className="text-gray-500">
              You now have access to <strong>{info?.patent_title}</strong>.
              <br />Redirecting to the patent...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invite Issue</h2>
            <p className="text-red-600 mb-4 text-sm">{message}</p>
            <Link href="/dashboard" className="text-indigo-600 underline text-sm">
              Go to Dashboard
            </Link>
          </>
        )}

      </div>
    </div>
  )
}
