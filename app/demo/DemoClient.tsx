'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  intent?: string
}

// ── Session storage key ───────────────────────────────────────────────────────
const SESSION_KEY = 'pattie_demo_history'

function loadHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(msgs: ChatMessage[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs))
  } catch { /* non-fatal */ }
}

// ── Suggestion chips ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'What is patentpending.app?',
  'How does Pattie help with filing?',
  'Tell me about the Partner Program',
  'How does the Marketplace work?',
  'What does Pro tier include?',
]

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold mr-2 mt-0.5 shrink-0">
          P
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
        }`}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-bold ml-2 mt-0.5 shrink-0">
          U
        </div>
      )}
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold mr-2 mt-0.5 shrink-0">
        P
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1.5 items-center h-4">
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

// ── Main component ────────────────────────────────────────────────────────────
export default function DemoClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const hasLoadedRef = useRef(false)

  // Load from sessionStorage on mount (preserves within-session history)
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      setMessages(loadHistory())
    }
  }, [])

  // Persist on change
  useEffect(() => {
    if (messages.length > 0) saveHistory(messages)
  }, [messages])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

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

    // Build API payload — last 20 messages max to keep context manageable
    const apiMessages = nextMessages.slice(-20).map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch('/api/pattie/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
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
      let detectedIntent = ''

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
            } else if (evt.type === 'intent') {
              detectedIntent = evt.intent
            }
          } catch { /* skip */ }
        }
      }

      // Commit completed response
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: accumulated,
        intent: detectedIntent || undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">

      {/* ── Top bar — minimal ──────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-center py-5 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-extrabold text-base shadow-sm">
            P
          </div>
          <div>
            <div className="font-bold text-gray-900 text-base leading-none">Pattie</div>
            <div className="text-xs text-gray-400 mt-0.5">Patent Filing, Simplified</div>
          </div>
          <div className="ml-2 w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Online" />
        </div>
      </div>

      {/* ── Chat area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto py-4">

          {/* Empty state hero */}
          {isEmpty && (
            <div className="text-center mb-10 px-4">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight mb-2">
                Hi, I&apos;m Pattie
              </h1>
              <p className="text-gray-500 text-base max-w-md mx-auto leading-relaxed">
                Ask me anything about patentpending.app, patent filing, or how we work with attorneys.
              </p>

              {/* Suggestion chips */}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-700 hover:shadow-sm transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message history */}
          {messages.map((msg, i) => (
            <Bubble key={i} msg={msg} />
          ))}

          {/* Streaming response */}
          {streaming && !streamingText && <TypingIndicator />}
          {streaming && streamingText && (
            <Bubble msg={{ role: 'assistant', content: streamingText }} />
          )}

          {/* Rate limit banner */}
          {rateLimited && (
            <div className="mb-4 text-center">
              <div className="inline-block bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                ⚠️ Demo limit reached (20 messages/hour). Come back later or{' '}
                <a href="https://patentpending.app" className="font-semibold underline">
                  sign up free
                </a>
                .
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 text-center">
              <div className="inline-block bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      {!rateLimited && (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 py-3 safe-area-inset-bottom">
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Pattie a question…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 disabled:opacity-50 max-h-32 leading-relaxed"
              style={{ overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim()}
              className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
              aria-label="Send"
            >
              {streaming ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                '↑'
              )}
            </button>
          </div>
          <p className="text-center text-xs text-gray-300 mt-2">
            Powered by{' '}
            <a href="https://patentpending.app" className="hover:text-gray-400 transition-colors">
              patentpending.app
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
