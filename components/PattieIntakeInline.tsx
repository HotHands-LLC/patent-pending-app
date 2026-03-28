'use client'
/**
 * PattieIntakeInline — Inline (non-modal) variant of the Pattie intake flow.
 *
 * Used on /dashboard/patents/new as the default first screen.
 * Same 4-question flow as PattieIntakeModal but rendered as a page section
 * rather than an overlay.
 *
 * Props:
 *   onManualFallback — called when user clicks "I'd rather fill in the details myself →"
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2 | 3 | 4

interface Answers {
  description: string
  type: string
  disclosed: string
  drawings: string
}

interface Props {
  onManualFallback: () => void
}

// ── Step config ───────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    id: 0,
    pattie: "What's your invention? Give me a sentence or two.",
    placeholder: 'e.g. A water bottle that tracks hydration and sends reminders to your phone.',
    multiline: true,
    options: undefined as string[] | undefined,
  },
  {
    id: 1,
    pattie: 'Is this a product, a process, a method, a system, or software?',
    placeholder: '',
    multiline: false,
    options: ['Product', 'Process', 'Method', 'System', 'Software'],
  },
  {
    id: 2,
    pattie: 'Have you told anyone about this yet, or shown it publicly?',
    placeholder: 'e.g. No / Yes, I demoed it at a conference last month.',
    multiline: true,
    options: undefined as string[] | undefined,
  },
  {
    id: 3,
    pattie: 'Do you have any drawings or sketches?',
    placeholder: '',
    multiline: false,
    options: ['Yes', 'No, not yet'],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function PattieIntakeInline({ onManualFallback }: Props) {
  const router = useRouter()

  const [step, setStep] = useState<Step>(0)
  const [answers, setAnswers] = useState<Partial<Answers>>({})
  const [inputValue, setInputValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [authToken, setAuthToken] = useState('')

  // Grab auth token on mount
  useEffect(() => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    )
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setAuthToken(session.access_token)
    })
  }, [])

  const currentQ = QUESTIONS[step as number]

  function handleNext() {
    if (!inputValue.trim()) return

    const key = ['description', 'type', 'disclosed', 'drawings'][step] as keyof Answers
    const updated = { ...answers, [key]: inputValue.trim() }
    setAnswers(updated)
    setInputValue('')

    if (step < 3) {
      setStep((step + 1) as Step)
    } else {
      setStep(4)
      createPatent(updated as Answers)
    }
  }

  async function createPatent(a: Answers) {
    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/patents/pattie-intake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          description: a.description,
          type: a.type,
          disclosed: a.disclosed,
          drawings: a.drawings,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Something went wrong — please try again.')
        setCreating(false)
        return
      }

      router.push(`/dashboard/patents/${json.patent_id}`)
    } catch {
      setError('Network error — please try again.')
      setCreating(false)
    }
  }

  // ── Confirm/Creating screen ───────────────────────────────────────────────

  if (step === 4) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-4">
        {creating ? (
          <>
            <div className="flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-500">Setting up your patent…</p>
          </>
        ) : error ? (
          <>
            <div className="text-3xl">⚠️</div>
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => { setStep(3); setCreating(false); setError('') }}
              className="text-sm text-indigo-600 hover:underline"
            >
              ← Go back
            </button>
          </>
        ) : (
          <>
            <div className="text-4xl">🎉</div>
            <p className="font-semibold text-[#1a1f36]">
              Got it — I&apos;ve set up your patent. Let&apos;s start building your provisional.
            </p>
            <p className="text-sm text-gray-400">Redirecting you now…</p>
          </>
        )}
      </div>
    )
  }

  // ── Question steps ────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xl flex-shrink-0">
          ✨
        </div>
        <div>
          <h2 className="text-sm font-bold text-[#1a1f36] leading-none">Pattie</h2>
          <p className="text-xs text-gray-400 mt-0.5">Your patent intake assistant</p>
        </div>

        {/* Progress dots */}
        <div className="ml-auto flex items-center gap-1.5">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i < (step as number)
                  ? 'w-5 bg-[#1a1f36]'
                  : i === (step as number)
                    ? 'w-5 bg-indigo-400'
                    : 'w-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Previous answers (thread) */}
        {step > 0 && (
          <div className="space-y-3 max-h-40 overflow-y-auto">
            {QUESTIONS.slice(0, step).map((q, i) => {
              const key = ['description', 'type', 'disclosed', 'drawings'][i] as keyof Answers
              const val = answers[key]
              if (!val) return null
              return (
                <div key={i} className="flex flex-col gap-1.5 opacity-60">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-xs">✨</div>
                    <div className="bg-indigo-50 rounded-xl rounded-tl-none px-3 py-1.5 text-xs text-[#1a1f36]">{q.pattie}</div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-[#1a1f36] text-white rounded-xl rounded-tr-none px-3 py-1.5 text-xs max-w-[75%]">{val}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Current Pattie question */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-lg">
            ✨
          </div>
          <div className="bg-indigo-50 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-[#1a1f36] leading-relaxed flex-1">
            {currentQ.pattie}
          </div>
        </div>

        {/* Input area */}
        {currentQ.options ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {currentQ.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => setInputValue(opt)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    inputValue === opt
                      ? 'bg-[#1a1f36] text-white border-[#1a1f36]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a1f36] hover:text-[#1a1f36]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={!currentQ.options.includes(inputValue) ? inputValue : ''}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Or type your own answer…"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              onKeyDown={e => e.key === 'Enter' && handleNext()}
            />
          </div>
        ) : currentQ.multiline ? (
          <textarea
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={currentQ.placeholder}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleNext()
              }
            }}
          />
        ) : (
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={currentQ.placeholder}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleNext()}
          />
        )}

        {/* Continue button */}
        <button
          onClick={handleNext}
          disabled={!inputValue.trim()}
          className="w-full py-2.5 bg-[#1a1f36] text-white rounded-xl text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-40 transition-colors"
        >
          {step < 3 ? 'Continue →' : 'Finish →'}
        </button>

        {/* Escape hatch */}
        <div className="text-center">
          <button
            onClick={onManualFallback}
            className="text-xs text-gray-400 hover:text-gray-600 hover:underline transition-colors"
          >
            I&apos;d rather fill in the details myself →
          </button>
        </div>
      </div>
    </div>
  )
}
