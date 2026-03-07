'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type InviteStatus = 'loading' | 'needs-login' | 'accepting' | 'success' | 'error'

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<InviteStatus>('loading')
  const [message, setMessage] = useState('')
  const [patentTitle, setPatentTitle] = useState('')

  useEffect(() => {
    async function handleInvite() {
      // Check auth state
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setStatus('needs-login')
        return
      }

      setStatus('accepting')

      try {
        const res = await fetch('/api/invite/accept', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()

        if (!res.ok) {
          setStatus('error')
          setMessage(data.error ?? 'Failed to accept invite')
          return
        }

        setPatentTitle(data.patent_title ?? 'your patent')
        setStatus('success')
        setTimeout(() => router.push(`/dashboard/patents/${data.patent_id}`), 2000)
      } catch {
        setStatus('error')
        setMessage('Network error — please try again')
      }
    }

    handleInvite()
  }, [token, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">⚖️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Patent Collaboration Invite</h1>

        {status === 'loading' && (
          <p className="text-gray-500">Verifying invite...</p>
        )}

        {status === 'needs-login' && (
          <>
            <p className="text-gray-600 mb-6">
              You need to sign in (or create a free account) to accept this invite.
            </p>
            <button
              onClick={() => router.push(`/login?redirect=/invite/${token}`)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors w-full"
            >
              Sign In to Accept →
            </button>
          </>
        )}

        {status === 'accepting' && (
          <div className="flex items-center justify-center gap-3 text-gray-500">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Accepting invite...</span>
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invite Accepted!</h2>
            <p className="text-gray-500">
              You now have access to <strong>{patentTitle}</strong>.
              Redirecting to the patent...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-red-600 mb-4">{message}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-indigo-600 underline text-sm"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
