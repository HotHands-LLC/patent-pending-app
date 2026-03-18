'use client'

/**
 * PattieInterviewDrawer.tsx
 * Arc 1 — Conversational invention disclosure interview.
 * Pattie asks one question at a time; generates draft patent fields on completion.
 *
 * Props:
 *   patentId    — patent to interview for
 *   patentTitle — shown in header
 *   authToken   — Bearer token
 *   onClose     — close handler
 *   onDraftApplied — called after Apply All succeeds; parent reloads patent data
 *   onSwitchToPolish — called to close this drawer and open PattieChatDrawer
 *   onTierRequired — called when Pro tier is required
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { stripInterviewDraft, stripSessionSummary, type InterviewDraft } from '@/lib/pattie-sop'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PattieInterviewDrawerProps {
  patentId:         string
  patentTitle:      string
  authToken:        string
  onClose:          () => void
  onDraftApplied?:  () => void
  onSwitchToPolish?: () => void
  onTierRequired?:  (feature: string) => void
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function PattieAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-violet-700"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      🦞
    </div>
  )
}

// ── Typing indicator ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

// ── Draft ready card ──────────────────────────────────────────────────────────
function DraftReadyCard({
  draft,
  onApplyAll,
  applying,
  applied,
  onSwitchToPolish,
}: {
  draft: InterviewDraft
  onApplyAll: () => void
  applying: boolean
  applied: boolean
  onSwitchToPolish?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const fields = [
    { label: 'Title',                  value: draft.title },
    { label: 'Abstract',               value: draft.abstract },
    { label: 'Background & Summary',   value: draft.background },
    { label: 'Claim Concepts (draft)', value: draft.claimsSkeleton },
    { label: 'Tags',                   value: draft.tags },
  ]

  return (
    <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 mt-3">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-lg">✨</span>
        <div>
          <p className="text-sm font-semibold text-violet-900">Pattie has drafted your patent fields</p>
          <p className="text-xs text-violet-700 mt-0.5">Review below, then apply — or jump straight in.</p>
        </div>
      </div>

      {/* Field previews */}
      <div className="space-y-1.5 mb-3">
        {fields.map(f => (
          <div key={f.label} className="flex items-start gap-2 text-xs">
            <span className="text-green-600 font-bold flex-shrink-0 mt-0.5">✅</span>
            <div className="min-w-0">
              <span className="font-medium text-violet-900">{f.label}</span>
              {expanded && f.value && (
                <p className="text-violet-700 mt-0.5 line-clamp-3 leading-relaxed">
                  {f.value.slice(0, 160)}{f.value.length > 160 ? '…' : ''}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Review toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="text-xs text-violet-600 hover:text-violet-800 underline mb-3 block"
      >
        {expanded ? 'Hide previews ▴' : 'Review first ▾'}
      </button>

      {/* Action buttons */}
      {applied ? (
        <div className="space-y-2">
          <div className="rounded-lg bg-green-100 border border-green-200 px-3 py-2 text-xs text-green-800 font-medium">
            ✅ Fields drafted — ready for polish
          </div>
          {onSwitchToPolish && (
            <button
              onClick={onSwitchToPolish}
              className="w-full px-4 py-2 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-[#4338ca] transition-colors"
            >
              Polish with Pattie →
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onApplyAll}
            disabled={applying}
            className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {applying ? 'Applying…' : 'Apply All Drafts'}
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="px-3 py-2 border border-violet-300 text-violet-700 rounded-lg text-sm font-medium hover:bg-violet-100 transition-colors"
          >
            Review First
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export default function PattieInterviewDrawer({
  patentId,
  patentTitle,
  authToken,
  onClose,
  onDraftApplied,
  onSwitchToPolish,
  onTierRequired,
}: PattieInterviewDrawerProps) {
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [streaming, setStreaming]   = useState(false)
  const [interviewDraft, setInterviewDraft] = useState<InterviewDraft | null>(null)
  const [applying, setApplying]     = useState(false)
  const [applied, setApplied]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [showInput, setShowInput]   = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const abortRef     = useRef<AbortController | null>(null)
  const openingFired = useRef(false)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  // ── Fire opening message on mount ────────────────────────────────────────
  const streamMessage = useCallback(async (
    msgs: Message[],
    isOpening = false
  ) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setStreaming(true)
    setError(null)

    // Add empty assistant placeholder
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch(`/api/patents/${patentId}/arc1-interview`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body:   JSON.stringify({ messages: msgs, isOpening }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 403 && err.code === 'TIER_REQUIRED') {
          onTierRequired?.(err.feature ?? 'pattie')
          onClose()
          return
        }
        throw new Error(err.error ?? 'Failed to reach Pattie')
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          try {
            const evt = JSON.parse(raw)

            if (evt.type === 'token' && evt.text) {
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.role === 'assistant') {
                  copy[copy.length - 1] = { ...last, content: last.content + evt.text }
                }
                return copy
              })
            }

            if (evt.type === 'interview_draft_ready' && evt.draft) {
              setInterviewDraft(evt.draft as InterviewDraft)
            }

            if (evt.type === 'text_complete' && evt.text) {
              // Replace last assistant message with the final clean text
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.role === 'assistant') {
                  const clean = stripSessionSummary(stripInterviewDraft(evt.text as string))
                  copy[copy.length - 1] = { ...last, content: clean }
                }
                return copy
              })
            }

            if (evt.type === 'done') break

          } catch { /* skip malformed */ }
        }
      }
      reader.releaseLock()

      // Clean final message of any block markers that leaked through
      setMessages(prev => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant' && last.content) {
          copy[copy.length - 1] = {
            ...last,
            content: stripSessionSummary(stripInterviewDraft(last.content)),
          }
        }
        return copy
      })

      setShowInput(true)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
      setMessages(prev => {
        const copy = [...prev]
        if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) {
          copy.pop()
        }
        return copy
      })
    } finally {
      setStreaming(false)
    }
  }, [patentId, authToken, onClose, onTierRequired])

  useEffect(() => {
    if (openingFired.current) return
    openingFired.current = true
    streamMessage([], true)
  }, [streamMessage])

  // ── Send user message ─────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')

    const userMsg: Message = { role: 'user', content: text }
    const updatedMsgs = [...messages, userMsg]
    setMessages(updatedMsgs)
    setShowInput(false)
    await streamMessage(updatedMsgs.map(m => ({ role: m.role, content: m.content })))
  }, [input, streaming, messages, streamMessage])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // ── Apply All drafts ──────────────────────────────────────────────────────
  const applyAll = useCallback(async () => {
    if (!interviewDraft || applying) return
    setApplying(true)

    const description = [
      '## Background\n',
      interviewDraft.background,
      '\n\n## Summary of the Invention\n',
      interviewDraft.summary,
    ].join('')

    const claimsDraft = [
      '⚠️ DRAFT CLAIM CONCEPTS — Not formatted patent claims.',
      'Review and refine with Pattie.\n\n',
      interviewDraft.claimsSkeleton,
    ].join('')

    const tagsArray = interviewDraft.tags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)

    try {
      const res = await fetch(`/api/patents/${patentId}`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title:        interviewDraft.title   || undefined,
          abstract:     interviewDraft.abstract || undefined,
          description,
          claims_draft: claimsDraft,
          tags:         tagsArray.length ? tagsArray : undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Apply failed')
      }

      setApplied(true)
      onDraftApplied?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Apply failed'
      setError(msg)
    } finally {
      setApplying(false)
    }
  }, [interviewDraft, applying, patentId, authToken, onDraftApplied])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white shadow-2xl flex flex-col"
      role="dialog"
      aria-label="Pattie Interview"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-violet-50">
        <div className="flex items-center gap-3">
          <PattieAvatar size={32} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-violet-900 text-sm">Invention Interview</span>
              <span className="bg-violet-200 text-violet-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Interview Mode
              </span>
            </div>
            <p className="text-xs text-violet-600">Tell Pattie about your invention</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
          aria-label="Close interview"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}
          >
            {msg.role === 'assistant' && <PattieAvatar size={26} />}
            <div className={`max-w-[85%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {(msg.content || (msg.role === 'assistant' && streaming && idx === messages.length - 1)) && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#4f46e5] text-white rounded-br-sm'
                      : 'bg-violet-50 text-violet-900 border border-violet-100 rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'assistant' && msg.content === '' && streaming ? (
                    <TypingDots />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              )}
              {/* Draft ready card — appended after last assistant message */}
              {msg.role === 'assistant' && idx === messages.length - 1 && interviewDraft && (
                <DraftReadyCard
                  draft={interviewDraft}
                  onApplyAll={applyAll}
                  applying={applying}
                  applied={applied}
                  onSwitchToPolish={onSwitchToPolish}
                />
              )}
            </div>
          </div>
        ))}

        {/* Streaming typing indicator (before first token arrives) */}
        {streaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex justify-start items-end gap-2">
            <PattieAvatar size={26} />
            <div className="bg-violet-50 border border-violet-100 rounded-2xl rounded-bl-sm px-3 py-2">
              <TypingDots />
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {showInput && !interviewDraft && (
        <div className="border-t border-gray-200 bg-white p-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Tell Pattie about your invention…"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              disabled={streaming}
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition-colors self-end"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
        </div>
      )}

      {/* Post-apply: input disabled, polish CTA shown in draft card */}
      {applied && (
        <div className="border-t border-gray-200 bg-violet-50 p-3 text-center">
          <p className="text-xs text-violet-600">Interview complete. Use Polish mode to refine your claims.</p>
        </div>
      )}
    </div>
  )
}
