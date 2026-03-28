'use client'
/**
 * /onboarding — P16: Inventor Onboarding — First 10 Minutes
 *
 * 3-step Pattie conversation to get the inventor to their first patent draft.
 * Redirects returning users (onboarding_completed=true) straight to /dashboard.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PATTIE_AVATAR = (
  <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow">
    PP
  </div>
)

type Step = 1 | 2 | 3 | 'done'

interface Message {
  from: 'pattie' | 'user'
  text: string
}

const TYPE_OPTIONS = [
  { label: 'Product', value: 'product' },
  { label: 'Process / Method', value: 'process_method' },
  { label: 'System', value: 'system' },
  { label: 'Software', value: 'software' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [session, setSession] = useState<{ access_token: string; user_id: string } | null>(null)

  // Conversation state
  const [messages, setMessages] = useState<Message[]>([])
  const [step, setStep] = useState<Step>(1)
  const [input, setInput] = useState('')
  const [description, setDescription] = useState('')
  const [inventionType, setInventionType] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Auth + onboarding gate ───────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      const { data: { session: sess } } = await supabase.auth.getSession()
      if (!sess) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', sess.user.id)
        .single()

      if (profile?.onboarding_completed) {
        router.push('/dashboard')
        return
      }

      setSession({ access_token: sess.access_token, user_id: sess.user.id })

      // Kick off conversation with Step 1
      setMessages([{
        from: 'pattie',
        text: "Hi! I'm Pattie, your AI patent assistant. I'm going to help you protect your invention. First — what did you invent? Give me a sentence or two.",
      }])
      setChecking(false)
    }
    check()
  }, [router])

  // Auto-scroll to bottom as messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function addUserMessage(text: string) {
    setMessages(prev => [...prev, { from: 'user', text }])
  }

  function addPattieMessage(text: string) {
    setMessages(prev => [...prev, { from: 'pattie', text }])
  }

  function handleStep1Submit() {
    const val = input.trim()
    if (!val) return
    addUserMessage(val)
    setDescription(val)
    setInput('')
    setStep(2)
    setTimeout(() => {
      addPattieMessage("That sounds interesting! Is this more of a product, a process/method, a system, or software?")
    }, 400)
  }

  function handleStep2Pick(type: string, label: string) {
    addUserMessage(label)
    setInventionType(type)
    setStep(3)
    setTimeout(() => {
      addPattieMessage("Have you told anyone about this yet, or shown it publicly? (This affects your filing timeline)")
    }, 400)
  }

  function handleStep2TypeInput() {
    const val = input.trim()
    if (!val) return
    addUserMessage(val)
    setInventionType(val)
    setInput('')
    setStep(3)
    setTimeout(() => {
      addPattieMessage("Have you told anyone about this yet, or shown it publicly? (This affects your filing timeline)")
    }, 400)
  }

  async function handleStep3Submit() {
    const val = input.trim()
    if (!val || !session) return
    addUserMessage(val)
    setInput('')
    setSubmitting(true)

    setTimeout(() => {
      addPattieMessage("Perfect — I've created your first patent draft. Let's start building your provisional application.")
    }, 400)

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          description,
          inventionType,
          privacyResponse: val,
        }),
      })

      const data = await res.json()
      if (res.ok && data.patent_id) {
        setStep('done')
        setTimeout(() => {
          router.push(`/dashboard/patents/${data.patent_id}`)
        }, 1800)
      } else {
        console.error('[onboarding] complete failed:', data)
        router.push('/dashboard')
      }
    } catch (err) {
      console.error('[onboarding] fetch error:', err)
      router.push('/dashboard')
    }
  }

  async function handleSkip() {
    if (!session) { router.push('/dashboard'); return }
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ skip: true }),
      })
    } catch { /* non-fatal */ }
    router.push('/dashboard')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (step === 1) handleStep1Submit()
      else if (step === 2) handleStep2TypeInput()
      else if (step === 3) handleStep3Submit()
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isSubmitting = submitting || step === 'done'

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center pt-8 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-xs">PP</div>
          <span className="font-semibold text-gray-700 text-sm">PatentPending.app</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xl mx-auto px-4 mb-2">
        <div className="flex gap-1.5">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                (step === 'done' || (typeof step === 'number' && step > n))
                  ? 'bg-indigo-600'
                  : typeof step === 'number' && step === n
                  ? 'bg-indigo-300'
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">
          {step === 'done' ? 'Complete!' : `Step ${step} of 3`}
        </p>
      </div>

      {/* Chat area */}
      <div className="flex-1 w-full max-w-xl mx-auto px-4 pb-4 overflow-y-auto">
        <div className="space-y-4 py-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.from === 'user' ? 'justify-end' : 'items-start'}`}>
              {msg.from === 'pattie' && PATTIE_AVATAR}
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.from === 'pattie'
                    ? 'bg-white text-gray-800 rounded-tl-sm border border-gray-100'
                    : 'bg-indigo-600 text-white rounded-tr-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      {!isSubmitting && (
        <div className="w-full max-w-xl mx-auto px-4 pb-6">
          {/* Step 2: type picker chips */}
          {step === 2 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleStep2Pick(opt.value, opt.label)}
                  className="px-4 py-2 rounded-full border border-indigo-300 text-sm text-indigo-700 bg-white hover:bg-indigo-50 hover:border-indigo-500 transition-colors font-medium"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Text input */}
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={step === 1 ? 3 : 2}
              placeholder={
                step === 1
                  ? 'Describe your invention…'
                  : step === 2
                  ? 'Or type your own…'
                  : 'Yes / No / describe…'
              }
              className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
            />
            <button
              onClick={
                step === 1
                  ? handleStep1Submit
                  : step === 2
                  ? handleStep2TypeInput
                  : handleStep3Submit
              }
              disabled={!input.trim()}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0"
            >
              Send
            </button>
          </div>

          {/* Skip link */}
          <div className="text-center mt-4">
            <button
              onClick={handleSkip}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip for now →
            </button>
          </div>
        </div>
      )}

      {/* Redirecting spinner */}
      {isSubmitting && (
        <div className="w-full max-w-xl mx-auto px-4 pb-8 text-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-400">Opening your patent draft…</p>
        </div>
      )}
    </div>
  )
}
