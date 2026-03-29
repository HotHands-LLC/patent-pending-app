'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_MESSAGES = 5
const LS_KEY = 'pattie_demo_widget_v1'

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content:
    "Hi! I'm Pattie, your AI patent assistant. Ask me anything about patents — how to file, what's patentable, or how to protect your invention. You have 5 free questions.",
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function loadSession(): { messages: Message[]; userCount: number } {
  if (typeof window === 'undefined') return { messages: [], userCount: 0 }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { messages: [], userCount: 0 }
    return JSON.parse(raw)
  } catch {
    return { messages: [], userCount: 0 }
  }
}

function saveSession(messages: Message[], userCount: number) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ messages, userCount }))
  } catch { /* noop */ }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PattieAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
  return (
    <div
      className={`${dim} rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shrink-0`}
    >
      P
    </div>
  )
}

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      {!isUser && <PattieAvatar size="sm" />}
      <div
        className={`mx-2 max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
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

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-2">
      <PattieAvatar size="sm" />
      <div className="mx-2 bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2.5">
        <div className="flex gap-1 items-center h-3">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CTACard() {
  return (
    <div className="mx-2 mb-3 bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
      <p className="text-sm font-semibold text-indigo-900 mb-1">
        You&apos;ve used your 5 free messages.
      </p>
      <p className="text-xs text-indigo-700 mb-3 leading-relaxed">
        Sign up free to keep chatting with Pattie — no credit card required.
      </p>
      <Link
        href="/signup"
        className="block w-full text-center py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
      >
        Sign up free to keep going →
      </Link>
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function PattieDemoWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [userCount, setUserCount] = useState(0)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Hydration guard
  useEffect(() => { setMounted(true) }, [])

  // Load from localStorage once mounted
  useEffect(() => {
    if (!mounted) return
    const { messages: savedMsgs, userCount: savedCount } = loadSession()
    if (savedMsgs.length > 0) {
      setMessages(savedMsgs)
      setUserCount(savedCount)
    } else {
      setMessages([WELCOME_MESSAGE])
    }
  }, [mounted])

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const reachedLimit = userCount >= MAX_MESSAGES

  const send = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || loading || reachedLimit) return

    setInput('')
    const userMsg: Message = { role: 'user', content: trimmed }
    const next = [...messages, userMsg]
    const newUserCount = userCount + 1

    setMessages(next)
    setUserCount(newUserCount)
    saveSession(next, newUserCount)
    setLoading(true)

    try {
      const res = await fetch('/api/pattie/demo-widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (res.status === 429) {
        const limitMsg: Message = {
          role: 'assistant',
          content: "You've reached the rate limit. Please try again later or sign up for unlimited access.",
        }
        const withLimit = [...next, limitMsg]
        setMessages(withLimit)
        saveSession(withLimit, newUserCount)
        return
      }

      if (!res.ok) {
        const errMsg: Message = {
          role: 'assistant',
          content: "Sorry, I hit a snag. Please try again in a moment.",
        }
        const withErr = [...next, errMsg]
        setMessages(withErr)
        saveSession(withErr, newUserCount)
        return
      }

      const data = await res.json()
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.reply ?? "Sorry, I couldn't generate a response.",
      }
      const withReply = [...next, assistantMsg]
      setMessages(withReply)
      saveSession(withReply, newUserCount)
    } catch {
      const errMsg: Message = {
        role: 'assistant',
        content: "Sorry, something went wrong. Please try again.",
      }
      const withErr = [...next, errMsg]
      setMessages(withErr)
      saveSession(withErr, newUserCount)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, loading, reachedLimit, messages, userCount])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); send() }
  }

  if (!mounted) return null

  const remaining = Math.max(0, MAX_MESSAGES - userCount)

  return (
    <>
      {/* ── Floating chat panel ─────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-20 right-4 sm:right-6 z-50 w-[min(400px,calc(100vw-2rem))] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ animation: 'pattie-slide-up 0.2s ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-600 shrink-0">
            <PattieAvatar />
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-tight">Try Pattie free</p>
              <p className="text-indigo-200 text-xs">AI patent assistant</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-indigo-200 hover:text-white transition-colors text-lg leading-none ml-2"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-3 bg-white">
            {messages.map((m, i) => (
              <ChatBubble key={i} msg={m} />
            ))}
            {loading && <TypingIndicator />}
            {reachedLimit && !loading && <CTACard />}
            <div ref={bottomRef} />
          </div>

          {/* Footer: counter + input */}
          <div className="shrink-0 border-t border-gray-100 bg-white px-3 py-2">
            {/* Message counter */}
            {!reachedLimit && (
              <p className="text-xs text-gray-400 mb-1.5 text-right">
                {userCount} of {MAX_MESSAGES} free messages used
              </p>
            )}

            {/* Input */}
            {!reachedLimit ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Pattie a question…"
                  disabled={loading}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
                  aria-label="Send"
                >
                  {loading
                    ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : '↑'}
                </button>
              </div>
            ) : (
              <div className="text-center py-1">
                <Link
                  href="/signup"
                  className="text-xs text-indigo-600 font-semibold hover:underline"
                >
                  Create free account to continue →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Chat bubble trigger ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 sm:right-6 z-50 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label={open ? 'Close Pattie chat' : 'Open Pattie chat'}
      >
        {open ? (
          <span className="text-xl">✕</span>
        ) : (
          <span className="text-2xl font-extrabold">P</span>
        )}
        {/* Unread dot for first visit */}
        {!open && userCount === 0 && (
          <span className="absolute top-1 right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />
        )}
      </button>

      {/* ── Keyframe animation ──────────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes pattie-slide-up {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}
