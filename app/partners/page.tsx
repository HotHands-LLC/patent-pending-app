'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const PARTNERS_SESSION_ID_KEY = 'pattie_partners_session_id'

function getPartnersSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  const existing = sessionStorage.getItem(PARTNERS_SESSION_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem(PARTNERS_SESSION_ID_KEY, id)
  return id
}

// ── Smooth scroll helper ──────────────────────────────────────────────────────
function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── Chat bubble ───────────────────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold mr-2 mt-0.5 shrink-0">
          P
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-slate-800 text-white rounded-br-sm'
            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
        }`}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-sm font-bold ml-2 mt-0.5 shrink-0">
          Y
        </div>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold mr-2 mt-0.5 shrink-0">
        P
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Pattie chat widget (attorney mode) ───────────────────────────────────────
function PartnersChatWidget() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const SUGGESTIONS = [
    'Will this replace me as an attorney?',
    'What does the referral program look like?',
    'How do I handle malpractice concerns?',
    'What quality should I expect from the drafts?',
    'How does my client intake process change?',
  ]

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    setInput('')
    setError(null)
    setStreamingText('')

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setStreaming(true)

    const apiMessages = nextMessages.slice(-20).map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch('/api/pattie/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, session_id: getPartnersSessionId() }),
      })

      if (res.status === 429) {
        setRateLimited(true)
        setStreaming(false)
        return
      }

      if (!res.ok || !res.body) {
        setError('Pattie is unavailable right now. Please try again shortly.')
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue

          try {
            const evt = JSON.parse(raw)
            if (evt.type === 'text') {
              accumulated += evt.text
              setStreamingText(accumulated)
            }
          } catch { /* skip */ }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
      setStreamingText('')
    } catch {
      setError('Connection error — please try again.')
    } finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [messages, streaming])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0 && !streaming

  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex flex-col" style={{ height: '520px' }}>
      {/* Chat header */}
      <div className="bg-white border-b border-slate-100 px-5 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold">
          P
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Pattie</div>
          <div className="text-xs text-slate-400">patentpending.app</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-slate-400">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty && (
          <div className="mb-6">
            <div className="text-sm text-slate-500 mb-4 text-center">
              Ask Pattie about the platform, the partner program, or anything you&apos;d want to know before referring clients.
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatBubble key={i} msg={msg} />
        ))}

        {streaming && !streamingText && <TypingIndicator />}
        {streaming && streamingText && (
          <ChatBubble msg={{ role: 'assistant', content: streamingText }} />
        )}

        {rateLimited && (
          <div className="mb-4 text-center">
            <div className="inline-block bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              Rate limit reached (20 messages/hour). Please check back later or use the waitlist form below.
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 text-center">
            <div className="inline-block bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!rateLimited && (
        <div className="border-t border-slate-100 bg-white px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Pattie a question…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-slate-50 disabled:opacity-50 max-h-28 leading-relaxed"
              style={{ overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim()}
              className="px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
              aria-label="Send"
            >
              {streaming ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                '↑'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Waitlist form ─────────────────────────────────────────────────────────────
type FormState = 'idle' | 'submitting' | 'success' | 'error'

function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [firm, setFirm] = useState('')
  const [focusArea, setFocusArea] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    setState('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/partners/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          firm: firm.trim() || undefined,
          focus_area: focusArea || undefined,
        }),
      })

      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string }

      if (res.ok && data.success) {
        setState('success')
      } else {
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
        setState('error')
      }
    } catch {
      setErrorMsg('Connection error — please try again.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">You&apos;re on the list.</h3>
        <p className="text-slate-500">We&apos;ll be in touch within 48 hours.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@yourfirm.com"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Firm / practice</label>
        <input
          type="text"
          value={firm}
          onChange={e => setFirm(e.target.value)}
          placeholder="Smith & Associates"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Focus area</label>
        <select
          value={focusArea}
          onChange={e => setFocusArea(e.target.value)}
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-700 appearance-none"
        >
          <option value="">Patent</option>
          <option value="patent">Patent</option>
          <option value="trademark">Trademark</option>
          <option value="ip_litigation">IP Litigation</option>
          <option value="other">Other</option>
        </select>
      </div>

      {state === 'error' && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={state === 'submitting' || !name.trim() || !email.trim()}
        className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-700 disabled:opacity-40 transition-colors"
      >
        {state === 'submitting' ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Submitting…
          </span>
        ) : (
          'Request access →'
        )}
      </button>

      <p className="text-center text-xs text-slate-400">We&apos;ll reach out within 48 hours.</p>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">

      {/* ── Minimal top nav ────────────────────────────────────────────────── */}
      <header className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900 tracking-tight">
            patentpending.app <span className="text-slate-400 font-normal">/ for attorneys</span>
          </span>
          <button
            onClick={() => scrollTo('waitlist')}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Request access →
          </button>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="px-6 pt-20 pb-16 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-5">
            For patent &amp; IP attorneys
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight tracking-tight mb-5">
            Your clients arrive unprepared.<br />
            <span className="text-slate-500">We fix that before they reach you.</span>
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed mb-10">
            patentpending.app prepares inventors for patent prosecution —
            so your billable hours go toward strategy, not extraction.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => scrollTo('how-it-works')}
              className="px-6 py-3 bg-white border border-slate-300 text-slate-800 rounded-xl font-semibold text-sm hover:border-slate-500 hover:shadow-sm transition-all"
            >
              See how it works →
            </button>
            <button
              onClick={() => scrollTo('waitlist')}
              className="px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-700 transition-colors"
            >
              Request partner access →
            </button>
          </div>
        </div>
      </section>

      {/* ── Value prop cards ───────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-slate-50">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">

          <div className="bg-white border border-slate-200 rounded-2xl p-7">
            <div className="text-2xl mb-4">📋</div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Better-prepared clients</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Inventors arrive with drafted specs, mapped claims, and prior art research already done.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-7">
            <div className="text-2xl mb-4">💼</div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-base font-semibold text-slate-900">Referral revenue</h3>
              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">launching soon</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              20% of first-year subscription for every client you refer who upgrades to Pro.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-7">
            <div className="text-2xl mb-4">🔗</div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Clients you couldn&apos;t serve before</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Inventors who can&apos;t afford full-service get prepared here first — then come to you ready to file.
            </p>
          </div>

        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-12">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">

            {/* connector line — desktop only */}
            <div className="hidden sm:block absolute top-6 left-1/6 right-1/6 h-px bg-slate-200" style={{ left: '16.66%', right: '16.66%' }} />

            {[
              {
                num: '1',
                title: 'You refer clients',
                body: 'Share your partner link with inventors who aren\'t ready for full-service yet.',
              },
              {
                num: '2',
                title: 'Pattie prepares them',
                body: 'Arc 1 interview, drafted spec, claims, prior art research — all done.',
              },
              {
                num: '3',
                title: 'They come back to you',
                body: 'Ready to file the non-provisional. Your time spent on value.',
              },
            ].map(step => (
              <div key={step.num} className="text-center">
                <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center text-lg font-bold mx-auto mb-4 relative z-10">
                  {step.num}
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.body}</p>
              </div>
            ))}

          </div>
        </div>
      </section>

      {/* ── Pattie attorney chat ───────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 py-16 bg-slate-50 scroll-mt-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Ask Pattie anything about the platform</h2>
            <p className="text-slate-500 text-sm">She&apos;s built for inventors — but she knows how to talk to attorneys.</p>
          </div>
          <PartnersChatWidget />
        </div>
      </section>

      {/* ── Waitlist form ──────────────────────────────────────────────────── */}
      <section id="waitlist" className="px-6 py-16 scroll-mt-8">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Request early partner access</h2>
            <p className="text-sm text-slate-500">Be among the first attorneys in the program when it launches.</p>
          </div>
          <WaitlistForm />
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 px-6 py-6 text-center">
        <p className="text-xs text-slate-400">
          patentpending.app &nbsp;·&nbsp; © 2026 Hot Hands LLC
        </p>
      </footer>

    </div>
  )
}
