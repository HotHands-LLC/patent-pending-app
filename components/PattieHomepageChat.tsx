'use client'

/**
 * PattieHomepageChat
 * Google-simple, inline Pattie chat for the pp.app homepage.
 * - No floating widget, no hero copy, no feature grid
 * - Just a centered input that expands into a conversation
 * - Unlimited messages with a natural $9 revenue gate after concept milestone
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const LS_KEY = 'pattie_homepage_v2'
const MILESTONE_THRESHOLD = 5 // user messages before showing $9 gate

// ── localStorage ──────────────────────────────────────────────────────────────
function loadSession(): { messages: Message[]; userCount: number; gateDismissed: boolean } {
  if (typeof window === 'undefined') return { messages: [], userCount: 0, gateDismissed: false }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { messages: [], userCount: 0, gateDismissed: false }
    return JSON.parse(raw)
  } catch {
    return { messages: [], userCount: 0, gateDismissed: false }
  }
}

function saveSession(messages: Message[], userCount: number, gateDismissed: boolean) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ messages, userCount, gateDismissed }))
  } catch { /* noop */ }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PattieAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
      P
    </div>
  )
}

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
      {!isUser && <PattieAvatar />}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {msg.content}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex justify-start gap-2">
      <PattieAvatar />
      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RevenueGate({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <PattieAvatar />
        <div>
          <p className="text-sm font-semibold text-indigo-900 mb-1">
            You&apos;re making real progress! 🎉
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">
            I&apos;ve helped you explore your invention concept. Want to take this all the way?
            For <strong>$9</strong>, I&apos;ll draft a full patent specification, independent claims,
            and give you a filing roadmap.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Link
          href="/signup?intent=session&ref=gate"
          className="flex-1 text-center py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
        >
          Continue for $9 →
        </Link>
        <Link
          href="/signup"
          className="flex-1 text-center py-2.5 border border-indigo-300 text-indigo-700 rounded-xl text-sm font-semibold hover:bg-indigo-50 transition-colors"
        >
          Create free account
        </Link>
      </div>
      <button onClick={onDismiss} className="block w-full text-center text-xs text-gray-400 hover:text-gray-600 pt-1">
        Keep chatting for free
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PattieHomepageChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [userCount, setUserCount] = useState(0)
  const [gateDismissed, setGateDismissed] = useState(false)
  const [showGate, setShowGate] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [started, setStarted] = useState(false) // true after first message
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const saved = loadSession()
    if (saved.messages.length > 0) {
      setMessages(saved.messages)
      setUserCount(saved.userCount)
      setGateDismissed(saved.gateDismissed)
      setStarted(true)
      if (saved.userCount >= MILESTONE_THRESHOLD && !saved.gateDismissed) setShowGate(true)
    }
  }, [mounted])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, showGate])

  const dismissGate = useCallback(() => {
    setShowGate(false)
    setGateDismissed(true)
    saveSession(messages, userCount, true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [messages, userCount])

  const send = useCallback(async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim()
    if (!trimmed || loading) return

    setInput('')
    setStarted(true)
    setShowGate(false)

    const userMsg: Message = { role: 'user', content: trimmed }
    const next = [...messages, userMsg]
    const newUserCount = userCount + 1

    setMessages(next)
    setUserCount(newUserCount)
    saveSession(next, newUserCount, gateDismissed)
    setLoading(true)

    try {
      const res = await fetch('/api/pattie/demo-widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })

      let reply = "Sorry, I hit a snag. Please try again in a moment."
      if (res.ok) {
        const data = await res.json()
        reply = data.reply ?? reply
      } else if (res.status === 429) {
        reply = "You're moving fast! Give me a moment to catch up — try again shortly."
      }

      const assistantMsg: Message = { role: 'assistant', content: reply }
      const withReply = [...next, assistantMsg]
      setMessages(withReply)
      saveSession(withReply, newUserCount, gateDismissed)

      // Show revenue gate after milestone (5 user messages) if not dismissed
      if (newUserCount >= MILESTONE_THRESHOLD && !gateDismissed) {
        setTimeout(() => setShowGate(true), 400)
      }
    } catch {
      const errMsg: Message = { role: 'assistant', content: "Sorry, something went wrong. Please try again." }
      const withErr = [...next, errMsg]
      setMessages(withErr)
      saveSession(withErr, newUserCount, gateDismissed)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, loading, messages, userCount, gateDismissed])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); send() }
  }

  // Suggestion chips for first-time visitors
  const SUGGESTIONS = [
    "I have an idea for a smart water bottle",
    "Is my app idea patentable?",
    "How do I file a provisional patent?",
    "What's the difference between utility and design patents?",
  ]

  if (!mounted) return null

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Conversation area — only visible after first message */}
      {started && (
        <div className="space-y-3 mb-4 max-h-[420px] overflow-y-auto px-1">
          {messages.map((m, i) => (
            <ChatBubble key={i} msg={m} />
          ))}
          {loading && <TypingDots />}
          {showGate && !loading && (
            <RevenueGate onDismiss={dismissGate} />
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div className={`relative ${started ? '' : ''}`}>
        <div className="flex items-center gap-2 border border-gray-200 rounded-2xl bg-white shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-indigo-300 transition-all px-4 py-3">
          {!started && (
            <span className="text-indigo-600 text-lg">✦</span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={started ? "Ask Pattie anything…" : "What is your invention idea?"}
            className="flex-1 text-base outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
            autoFocus
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="w-9 h-9 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
            aria-label="Send"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <span className="text-sm font-bold">↑</span>
            }
          </button>
        </div>

        {/* Suggestion chips — only before first message */}
        {!started && (
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-full hover:border-indigo-300 hover:text-indigo-700 transition-colors bg-white"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Tagline — only before first message */}
        {!started && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Pattie helps inventors protect their ideas — free to try, no account needed
          </p>
        )}
      </div>
    </div>
  )
}
