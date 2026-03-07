'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const PENDING_INVITE_KEY = 'pp_pending_invite'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const prefilledEmail = searchParams.get('email') ?? ''
  const redirectPath = searchParams.get('redirect')

  const [email, setEmail] = useState(prefilledEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Store invite token before auth
  useEffect(() => {
    if (inviteToken) localStorage.setItem(PENDING_INVITE_KEY, inviteToken)
  }, [inviteToken])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
    if (loginErr) {
      setError(loginErr.message)
      setLoading(false)
      return
    }

    // Check pending invite
    const pendingToken = localStorage.getItem(PENDING_INVITE_KEY)
    if (pendingToken && data.session) {
      try {
        const res = await fetch('/api/invite/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ token: pendingToken }),
        })
        const d = await res.json()
        localStorage.removeItem(PENDING_INVITE_KEY)
        if (res.ok) {
          router.push(`/dashboard/patents/${d.patent_id}`)
          return
        }
      } catch { localStorage.removeItem(PENDING_INVITE_KEY) }
    }

    router.push(redirectPath ?? '/dashboard')
  }

  return (
    <>
      {inviteToken && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 text-sm text-indigo-800">
          🎉 Sign in to accept your patent invite.
        </div>
      )}

      <form onSubmit={handleLogin}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] focus:border-transparent"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] focus:border-transparent"
            placeholder="••••••••"
            required
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-[#1a1f36] text-white rounded-lg font-medium text-sm hover:bg-[#2d3561] transition-colors disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-gray-500 hover:text-[#1a1f36] transition-colors">
            Forgot password?
          </Link>
          <Link
            href={`/signup${inviteToken ? `?invite=${inviteToken}&email=${encodeURIComponent(prefilledEmail)}` : ''}`}
            className="text-indigo-600 font-medium hover:underline"
          >
            Create account
          </Link>
        </div>
      </form>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
          <p className="text-gray-500 mt-2 text-sm">Sign in to your dashboard</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
          <Suspense fallback={<div className="h-40" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
