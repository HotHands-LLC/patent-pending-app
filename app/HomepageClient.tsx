'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import VoiceInput from '@/components/VoiceInput'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface FeaturedListing {
  id: string
  title: string
  marketplace_slug: string | null
  deal_page_brief: string | null
  ip_readiness_score: number | null
  status: string
}

// ── Session storage keys ──────────────────────────────────────────────────────
const HISTORY_KEY = 'pattie_homepage_history'
const GATE_KEY    = 'pattie_gate_shown'
const CONTEXT_KEY = 'pattie_homepage_context'

// ── Gated intents ─────────────────────────────────────────────────────────────
const GATED_INTENTS = new Set(['inventor_filing', 'attorney_evaluating', 'pricing_inquiry'])

// ── Suggestion chips ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'How do I file a provisional patent?',
  "What's the difference between provisional and non-provisional?",
  'Can I patent an AI invention?',
  'How does the patent marketplace work?',
  'What does patentpending.app do?',
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadHistory(): Message[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}
function saveHistory(msgs: Message[]) {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(msgs)) } catch { /* noop */ }
}
function gateAlreadyShown(): boolean {
  return typeof window !== 'undefined' && sessionStorage.getItem(GATE_KEY) === '1'
}
function markGateShown() {
  try { sessionStorage.setItem(GATE_KEY, '1') } catch { /* noop */ }
}
function saveContextHandoff(msgs: Message[]) {
  const last6 = msgs.slice(-6) // last 3 exchanges = 6 messages
  try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(last6)) } catch { /* noop */ }
}

// ── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-0.5 shrink-0">P</div>
      )}
      <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
        isUser ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
      }`}>
        {msg.content}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold ml-2 mt-0.5 shrink-0">U</div>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-0.5 shrink-0">P</div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1.5 items-center h-3.5">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Soft gate ─────────────────────────────────────────────────────────────────
function SoftGate({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <div className="mx-auto max-w-lg mb-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4">
        <p className="text-sm font-semibold text-indigo-900 mb-1">Want to take this further?</p>
        <p className="text-xs text-indigo-700 mb-3 leading-relaxed">
          Create a free account to file patents, track deadlines, and get Pattie&apos;s full capabilities.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onSignup}
            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
          >
            Create free account
          </button>
          <button
            onClick={onLogin}
            className="flex-1 py-2 border border-indigo-300 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Featured listing card ─────────────────────────────────────────────────────
function ListingCard({ listing }: { listing: FeaturedListing }) {
  const brief = listing.deal_page_brief ?? ''
  const snippet = brief.length > 100 ? brief.slice(0, 97) + '…' : brief
  const score = listing.ip_readiness_score
  return (
    <Link
      href={`/marketplace/${listing.marketplace_slug}`}
      className="group bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col"
    >
      {score !== null && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            score >= 70 ? 'bg-green-100 text-green-700' : score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
          }`}>IP Score: {score}</span>
        </div>
      )}
      <h3 className="text-sm font-bold text-gray-900 leading-snug mb-1.5 group-hover:text-indigo-700 transition-colors line-clamp-2">
        {listing.title}
      </h3>
      {snippet && <p className="text-xs text-gray-500 leading-relaxed flex-1">{snippet}</p>}
      <div className="mt-3 text-xs font-semibold text-indigo-600 group-hover:text-indigo-800">View Listing →</div>
    </Link>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HomepageClient({ listings }: { listings: FeaturedListing[] }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [showGate, setShowGate] = useState(false)
  const [gatedIntentCount, setGatedIntentCount] = useState(0)
  const [rateLimited, setRateLimited] = useState(false)
  const bottomRef          = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef           = useRef<HTMLTextAreaElement>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true
      setMessages(loadHistory())
    }
    // Focus input on load
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (messages.length > 0) saveHistory(messages)
  }, [messages])

  useEffect(() => {
    // Scroll within the chat container only — never escape to window
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages, streamText])

  function handleSignupClick() {
    saveContextHandoff(messages)
    window.open('/signup', '_blank')
  }
  function handleLoginClick() {
    saveContextHandoff(messages)
    window.location.href = '/login'
  }

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    setInput('')
    setStreamText('')

    const userMsg: Message = { role: 'user', content: trimmed }
    const next = [...messages, userMsg]
    setMessages(next)
    setStreaming(true)

    const apiMessages = next.slice(-20).map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/pattie/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (res.status === 429) { setRateLimited(true); setStreaming(false); return }
      if (!res.ok || !res.body) { setStreaming(false); return }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let accumulated = ''
      let intent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue
          try {
            const evt = JSON.parse(raw)
            if (evt.type === 'text') { accumulated += evt.text; setStreamText(accumulated) }
            if (evt.type === 'intent') { intent = evt.intent }
          } catch { /* skip */ }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
      setStreamText('')

      // Soft gate logic: 2+ gated-intent messages in session
      if (GATED_INTENTS.has(intent) && !gateAlreadyShown()) {
        const newCount = gatedIntentCount + 1
        setGatedIntentCount(newCount)
        if (newCount >= 2) {
          setShowGate(true)
          markGateShown()
        }
      }
    } catch { /* noop */ }
    finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [messages, streaming, gatedIntentCount])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const isEmpty = messages.length === 0 && !streaming

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <nav className="border-b border-gray-100 shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <span className="font-bold text-[#1a1f36] text-base">⚖️ PatentPending</span>
          <div className="flex items-center gap-2">
            <Link href="/about" className="text-xs text-gray-400 hover:text-gray-600 transition-colors hidden sm:inline">About</Link>
            <Link href="/pricing" className="text-xs text-gray-400 hover:text-gray-600 transition-colors hidden sm:inline">Pricing</Link>
            <Link href="/login" onClick={() => saveContextHandoff(messages)} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="px-3 py-1.5 text-xs bg-[#1a1f36] text-white rounded-lg font-medium hover:bg-[#2d3561] transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Chat area ─────────────────────────────────────────────────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto py-6">

          {/* Hero (shown when empty) */}
          {isEmpty && (
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 text-white font-extrabold text-lg mb-4 shadow-sm">P</div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-1.5">
                What&apos;s your patent question?
              </h1>
              <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
                Ask Pattie anything about filing, protecting, or licensing your invention.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:border-indigo-300 hover:text-indigo-700 hover:shadow-sm transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m, i) => <Bubble key={i} msg={m} />)}
          {streaming && !streamText && <TypingDots />}
          {streaming && streamText && <Bubble msg={{ role: 'assistant', content: streamText }} />}

          {/* Soft gate (non-blocking) */}
          {showGate && <SoftGate onSignup={handleSignupClick} onLogin={handleLoginClick} />}

          {/* Rate limit */}
          {rateLimited && (
            <div className="text-center mb-4">
              <div className="inline-block bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                ⚠️ Demo limit reached.{' '}
                <Link href="/signup" className="font-semibold underline">Create a free account</Link> for unlimited Pattie access.
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input bar ─────────────────────────────────────────────────────── */}
      {!rateLimited && (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 py-3">
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Pattie a question…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 disabled:opacity-50 max-h-28 leading-relaxed"
            />
            <VoiceInput
              onTranscript={t => setInput(t)}
              onAutoSubmit={t => send(t)}
              disabled={streaming}
            />
            <button
              onClick={() => send(input)}
              disabled={streaming || !input.trim()}
              className="px-3.5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
            >
              {streaming
                ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : '↑'}
            </button>
          </div>
        </div>
      )}

      {/* ── Featured Listings (below fold) ────────────────────────────────── */}
      {listings.length > 0 && (
        <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-4 sm:px-6 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">IP Available for Licensing & Sale</h2>
              <Link href="/marketplace" className="text-xs text-indigo-600 hover:underline">Browse all →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {listings.map(l => <ListingCard key={l.id} listing={l} />)}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-gray-100 py-4 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between text-xs text-gray-400 flex-wrap gap-2">
          <span>© {new Date().getFullYear()} PatentPending</span>
          <div className="flex items-center gap-3">
            <Link href="/about" className="hover:text-gray-600">About</Link>
            <Link href="/marketplace" className="hover:text-gray-600">Marketplace</Link>
            <Link href="/pricing" className="hover:text-gray-600">Pricing</Link>
            <a
              href="mailto:pattie@patentpending.app?subject=PatentPending.app%20%E2%80%94%20%5BQuestion%2FSupport%5D"
              className="hover:text-gray-600"
            >
              Contact Pattie
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
