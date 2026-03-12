'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PattieChatDrawerProps {
  patentId: string
  patentTitle: string
  authToken: string
  onClose: () => void
  canEdit?: boolean      // prereq gate for future Pattie write mode (Prompt 8)
  patentStatus?: string  // drives status-aware chips and system prompt addendum
  onTierRequired?: (feature: string) => void
}

const STARTER_CHIPS_DEFAULT = [
  'How strong are my claims?',
  "What's my next filing step?",
  'Explain my spec in plain English',
]

const STARTER_CHIPS_FILED = [
  "What can I do with 'Patent Pending' status?",
  'Help me improve my claims',
  'Explain the non-provisional process',
  'Can I license my patent now?',
]

const STARTER_CHIPS_GRANTED = [
  'Who might want to license this patent?',
  'What industries could use this technology?',
  'How do I protect my rights as an inventor?',
]

/** PP logomark — circular monogram, matches brand indigo */
function PattieAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#4f46e5',
        color: '#fff',
        fontSize: Math.round(size * 0.38),
        fontWeight: 800,
        letterSpacing: '-0.5px',
        flexShrink: 0,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      PP
    </span>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }}
        />
      ))}
    </div>
  )
}

export default function PattieChatDrawer({
  patentId,
  patentTitle,
  authToken,
  onClose,
  onTierRequired,
  canEdit = false,
  patentStatus,
}: PattieChatDrawerProps) {
  // canEdit is the prerequisite for Pattie write mode (Prompt 8)
  void canEdit
  const isGrantedPatent = patentStatus === 'granted'
  const isFiledPatent   = patentStatus === 'provisional_filed' || patentStatus === 'nonprov_filed'
  const starterChips = isGrantedPatent ? STARTER_CHIPS_GRANTED
                     : isFiledPatent   ? STARTER_CHIPS_FILED
                     : STARTER_CHIPS_DEFAULT
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const isFirstMessage = messages.length === 0

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || streaming) return

    setInput('')
    setError('')
    const userMsg: Message = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setStreaming(true)

    // Add empty assistant bubble to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    abortRef.current = new AbortController()

    try {
      const res = await fetch(`/api/patents/${patentId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          patentId,
          messages: updatedMessages,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        if (res.status === 403 && errData.code === 'TIER_REQUIRED') {
          onTierRequired?.(errData.feature ?? 'pattie')
          return
        }
        throw new Error(errData.error ?? `Error ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                setMessages(prev => {
                  const copy = [...prev]
                  const last = copy[copy.length - 1]
                  if (last?.role === 'assistant') {
                    copy[copy.length - 1] = { ...last, content: last.content + parsed.text }
                  }
                  return copy
                })
              }
            } catch {
              // skip malformed
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Something went wrong. Try again.'
      setError(msg)
      // Remove empty assistant bubble on error
      setMessages(prev => {
        const copy = [...prev]
        if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) {
          copy.pop()
        }
        return copy
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, messages, streaming, patentId, authToken])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleReset = () => {
    abortRef.current?.abort()
    setMessages([])
    setInput('')
    setError('')
    setStreaming(false)
  }

  // Simple markdown bold renderer
  function renderContent(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    )
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 sm:hidden"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        className="
          fixed inset-0 z-50 flex flex-col bg-white shadow-2xl
          sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-[420px]
          sm:border-l sm:border-gray-200
        "
        role="dialog"
        aria-label="Pattie Chat"
        aria-modal="true"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <PattieAvatar size={34} />
            <div>
              <div className="font-semibold text-[#1a1f36] text-sm leading-tight">Pattie 🦞</div>
              <div className="text-xs text-gray-400 leading-tight">Your PatentPending assistant</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              title="Clear chat"
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Message list ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {/* Greeting (always visible when no messages) */}
          {isFirstMessage && (
            <div className="flex justify-start items-end gap-2">
              <PattieAvatar size={26} />
              <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-gray-100 text-[#1a1f36] text-sm leading-relaxed">
                <p>
                  Hi! I&apos;m Pattie — your PatentPending assistant. I know{' '}
                  <strong>{patentTitle}</strong> inside and out. Ask me anything about
                  your claims, spec, or next steps.
                </p>
              </div>
            </div>
          )}

          {/* ── Starter chips (first open only) ── */}
          {isFirstMessage && !streaming && (
            <div className="flex flex-wrap gap-2 pl-9 pt-1">
              {starterChips.map(chip => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  className="
                    text-xs px-3 py-1.5 rounded-full
                    border border-[#4f46e5] text-[#4f46e5]
                    hover:bg-[#4f46e5] hover:text-white
                    transition-colors font-medium
                  "
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Conversation messages */}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}
            >
              {msg.role === 'assistant' && <PattieAvatar size={26} />}

              <div
                className={`
                  max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-[#4f46e5] text-white rounded-br-sm'
                    : 'bg-gray-100 text-[#1a1f36] rounded-bl-sm'
                  }
                `}
              >
                {msg.role === 'assistant' && msg.content === '' && streaming ? (
                  <TypingDots />
                ) : (
                  <p className="whitespace-pre-wrap break-words">
                    {renderContent(msg.content)}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Standalone typing indicator (before first assistant bubble appears) */}
          {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start items-end gap-2">
              <PattieAvatar size={26} />
              <div className="bg-gray-100 text-[#1a1f36] px-3 py-2 rounded-2xl rounded-bl-sm">
                <TypingDots />
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              ⚠️ {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input area ── */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 pt-3 pb-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Pattie anything about your patent…"
              rows={1}
              disabled={streaming}
              className="
                flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2
                text-sm text-[#1a1f36] placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30 focus:border-[#4f46e5]
                disabled:opacity-60 disabled:cursor-not-allowed
                min-h-[40px] max-h-[120px] overflow-y-auto
              "
              style={{ height: 'auto' }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || streaming}
              aria-label="Send message"
              className="
                shrink-0 w-10 h-10 rounded-xl bg-[#4f46e5] text-white
                flex items-center justify-center
                hover:bg-[#4338ca] transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {streaming ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>

          {/* ── Disclaimer (persistent) ── */}
          <p className="text-[10px] text-gray-400 mt-2 mb-1 text-center leading-tight">
            Pattie is an AI assistant, not a licensed attorney. Always verify with a qualified professional.
          </p>
        </div>
      </div>
    </>
  )
}
