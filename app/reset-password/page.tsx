'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tokenError, setTokenError] = useState(false)
  const [ready, setReady] = useState(false)
  const router = useRouter()

  // Supabase puts the token in the URL hash (#access_token=...&type=recovery)
  // The JS client automatically exchanges it when the page loads.
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Also check if there's already an active session with recovery type
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    // If no recovery event fires within 3s, the token is likely missing/expired
    const timeout = setTimeout(() => {
      if (!ready) setTokenError(true)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [ready])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <Link href="/" className="text-2xl font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
            <div className="text-3xl mb-4">⚠️</div>
            <h2 className="font-semibold text-[#1a1f36] mb-2">Link expired or invalid</h2>
            <p className="text-sm text-gray-500 mb-6">
              This password reset link has expired or already been used.
              Reset links are valid for 1 hour.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block w-full py-2.5 bg-[#1a1f36] text-white rounded-lg font-medium text-sm hover:bg-[#2d3561] transition-colors text-center"
            >
              Request a new link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
          <p className="text-gray-500 mt-2 text-sm">Choose a new password</p>
        </div>

        <form onSubmit={handleReset} className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
          <div className="mb-4">
            <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] focus:border-transparent"
              placeholder="Min. 8 characters"
              required
              minLength={8}
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !ready}
            className="w-full py-2.5 bg-[#1a1f36] text-white rounded-lg font-medium text-sm hover:bg-[#2d3561] transition-colors disabled:opacity-50"
          >
            {loading ? 'Updating...' : !ready ? 'Verifying link...' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
