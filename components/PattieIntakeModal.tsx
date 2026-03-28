'use client'
/**
 * PattieIntakeModal — P-Fix-3c
 *
 * A 4-question Pattie conversation that collects enough context to create a
 * provisional_draft patent record without requiring the user to fill in a
 * manual form up front.
 *
 * Steps:
 *   Q1  What's your invention?
 *   Q2  Type? (product / process / method / system / software)
 *   Q3  Disclosed publicly?
 *   Q4  Drawings / sketches?
 *   → Confirm + create record → redirect to patent page
 *
 * Escape hatch on every step: "I'd rather fill in the details myself →"
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2 | 3 | 4  // 0-3 = questions, 4 = confirm/creating

interface Answers {
  description: string   // Q1
  type: string          // Q2
  disclosed: string     // Q3
  drawings: string      // Q4
}

interface Props {
  onClose: () => void
  onManualFallback: () => void   // opens the traditional NewPatentModal
  authToken: string
}

// ── Step config ───────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    id: 0,
    pattie: "What's your invention? Give me a sentence or two.",
    placeholder: 'e.g. A water bottle that tracks hydration and sends reminders to your phone.',
    multiline: true,
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
  },
  {
    id: 3,
    pattie: 'Do you have any drawings or sketches?',
    placeholder: 'e.g. Yes, rough sketches / No, not yet.',
    multiline: false,
    options: ['Yes', 'No, not yet'],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function PattieIntakeModal({ onClose, onManualFallback, authToken }: Props) {
  const router = useRouter()

  const [step, setStep] = useState<Step>(0)
  const [answers, setAnswers] = useState<Partial<Answers>>({})
  const [inputValue, setInputValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

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
      // All 4 answered — move to confirm/create
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

      // Redirect to new patent page
      onClose()
      router.push(`/dashboard/patents/${json.patent_id}`)
    } catch {
      setError('Network error — please try again.')
      setCreating(false)
    }
  }

  // ── Escape hatch ──────────────────────────────────────────────────────────

  function handleManualEscape() {
    onClose()
    onManualFallback()
  }

  // ── Overlay ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="text-base font-bold text-[#1a1f36] leading-none">New Patent</h2>
              <p className="text-xs text-gray-400 mt-0.5">Pattie will set everything up</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-lg"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Progress dots ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 pt-4 px-6">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i < (step as number)
                  ? 'w-6 bg-[#1a1f36]'
                  : i === (step as number) && step < 4
                    ? 'w-6 bg-indigo-400'
                    : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="px-6 pb-6 pt-4">

          {/* Confirm / Creating state */}
          {step === 4 && (
            <div className="py-8 text-center space-y-4">
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
                  <div className="text-3xl">🎉</div>
                  <p className="font-semibold text-[#1a1f36]">
                    Got it — I&apos;ve set up your patent. Let&apos;s start building your provisional.
                  </p>
                  <p className="text-sm text-gray-400">Redirecting you now…</p>
                </>
              )}
            </div>
          )}

          {/* Question steps */}
          {step < 4 && currentQ && (
            <div className="space-y-5">
              {/* Pattie bubble */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-lg">
                  ✨
                </div>
                <div className="bg-indigo-50 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-[#1a1f36] leading-relaxed flex-1">
                  {currentQ.pattie}
                </div>
              </div>

              {/* Previous answers (read-only thread) */}
              {step > 0 && (
                <div className="space-y-3 max-h-36 overflow-y-auto">
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
                  {/* Allow free-form too */}
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
            </div>
          )}

          {/* Escape hatch — every step */}
          {step < 4 && (
            <div className="text-center mt-4">
              <button
                onClick={handleManualEscape}
                className="text-xs text-gray-400 hover:text-gray-600 hover:underline transition-colors"
              >
                I&apos;d rather fill in the details myself →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
