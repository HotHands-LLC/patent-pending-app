'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { stripSessionSummary } from '@/lib/pattie-sop'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Suggestion {
  tool_use_id: string
  field_name: string
  proposed_value: string
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  suggestion?: Suggestion   // optional inline suggestion card
  suggestionState?: 'pending' | 'applied' | 'rejected' | 'editing'
  editedValue?: string       // if user edits before applying
}

const FIELD_LABELS: Record<string, string> = {
  abstract_draft:             'Abstract',
  claims_draft:               'Claims',
  background:                 'Background',
  summary_of_invention:       'Summary of Invention',
  detailed_description:       'Detailed Description',
  brief_description_of_drawings: 'Brief Description of Drawings',
  entity_status:              'Entity Status',
  inventor_name:              'Inventor Name',
}

interface PattieChatDrawerProps {
  patentId: string
  patentTitle: string
  authToken: string
  onClose: () => void
  canEdit?: boolean
  patentStatus?: string
  onTierRequired?: (feature: string) => void
  onFieldApplied?: (fieldName: string, value: string) => void  // callback when suggestion applied
  /** When provided, Pattie fires this as the first message automatically on open */
  initialPrompt?: string
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

function PattieAvatar({ size = 28 }: { size?: number }) {
  return (
    <span aria-hidden style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%', background: '#4f46e5',
      color: '#fff', fontSize: Math.round(size * 0.38), fontWeight: 800,
      letterSpacing: '-0.5px', flexShrink: 0, lineHeight: 1, userSelect: 'none',
    }}>PP</span>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }} />
      ))}
    </div>
  )
}

// ── Contextual thinking status messages ─────────────────────────────────────
function getThinkingMessages(text: string): string[] {
  const t = text.toLowerCase()
  if (/\bclaim|independent|dependent|prior art|claim set/.test(t))
    return ['Reading your claims…', 'Checking claim structure…', 'Drafting claim language…']
  if (/\bspec|description|embodiment|figure|drawing/.test(t))
    return ['Reviewing your specification…', 'Analyzing technical details…', 'Drafting description…']
  if (/\babstract/.test(t))
    return ['Reading your abstract…', 'Checking USPTO format…', 'Drafting abstract…']
  if (/\bsearch|prior art|novel|similar|patent landscape/.test(t))
    return ['Thinking through prior art…', 'Reviewing patent landscape…', 'Checking novelty…']
  return ['Reading your patent…', 'Thinking…', 'Drafting response…']
}

function ThinkingChip({ status }: { status: string }) {
  return (
    <div className="flex justify-start items-end gap-2 mb-1">
      <PattieAvatar size={26} />
      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs text-indigo-600 font-medium animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDuration: '0.8s' }} />
        {status}
      </div>
    </div>
  )
}

// ── Suggestion Card ────────────────────────────────────────────────────────────
function SuggestionCard({
  suggestion,
  state,
  editedValue,
  onApply,
  onReject,
  onEdit,
  onEditChange,
  onEditApply,
}: {
  suggestion: Suggestion
  state: 'pending' | 'applied' | 'rejected' | 'editing'
  editedValue?: string
  onApply: () => void
  onReject: () => void
  onEdit: () => void
  onEditChange: (v: string) => void
  onEditApply: () => void
}) {
  const label = FIELD_LABELS[suggestion.field_name] ?? suggestion.field_name
  const borderColor =
    state === 'applied' ? 'border-green-300 bg-green-50' :
    state === 'rejected' ? 'border-gray-200 bg-gray-50 opacity-60' :
    suggestion.confidence === 'high' ? 'border-green-400 bg-green-50' :
    suggestion.confidence === 'low' ? 'border-yellow-400 bg-yellow-50' :
    'border-indigo-300 bg-indigo-50'

  if (state === 'rejected') {
    return (
      <div className={`rounded-xl border p-3 text-xs text-gray-400 ${borderColor}`}>
        💡 Suggestion for <strong>{label}</strong> was rejected.
      </div>
    )
  }

  if (state === 'applied') {
    return (
      <div className={`rounded-xl border p-3 text-xs text-green-700 ${borderColor}`}>
        ✅ <strong>{label}</strong> updated successfully.
      </div>
    )
  }

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-base">💡</span>
        <div>
          <p className="text-xs font-bold text-[#1a1f36]">
            Pattie suggests updating <span className="text-indigo-600">{label}</span>
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{suggestion.reasoning}</p>
        </div>
        <span className={`ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded-full
          ${suggestion.confidence === 'high' ? 'bg-green-100 text-green-700' :
            suggestion.confidence === 'low' ? 'bg-yellow-100 text-yellow-700' :
            'bg-indigo-100 text-indigo-700'}`}>
          {suggestion.confidence}
        </span>
      </div>

      {/* Proposed value */}
      {state === 'editing' ? (
        <textarea
          className="w-full text-xs border border-indigo-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 min-h-[80px] max-h-[200px]"
          value={editedValue ?? suggestion.proposed_value}
          onChange={e => onEditChange(e.target.value)}
          rows={4}
        />
      ) : (
        <div className="rounded-lg bg-white border border-gray-200 p-2 max-h-[160px] overflow-y-auto">
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
            {suggestion.proposed_value}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {state === 'editing' ? (
          <button onClick={onEditApply}
            className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">
            Apply Edited ✓
          </button>
        ) : (
          <>
            <button onClick={onEdit}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
              Edit
            </button>
            <button onClick={onReject}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
              Reject
            </button>
            <button onClick={onApply}
              className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">
              Apply ✓
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PattieChatDrawer({
  patentId,
  patentTitle,
  authToken,
  onClose,
  onTierRequired,
  canEdit = false,
  patentStatus,
  onFieldApplied,
  initialPrompt,
}: PattieChatDrawerProps) {
  void canEdit
  const isGrantedPatent = patentStatus === 'granted'
  const isFiledPatent   = patentStatus === 'provisional_filed' || patentStatus === 'nonprov_filed'
  const starterChips    = isGrantedPatent ? STARTER_CHIPS_GRANTED
                        : isFiledPatent   ? STARTER_CHIPS_FILED
                        : STARTER_CHIPS_DEFAULT

  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [streaming, setStreaming]  = useState(false)
  const [error, setError]         = useState('')
  const [closePending, setClosePending] = useState(false)   // close warning dialog
  const [summaryToast, setSummaryToast] = useState<'saving' | 'saved' | 'error' | null>(null)
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null)
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const abortRef  = useRef<AbortController | null>(null)
  const initialPromptFiredRef = useRef(false)
  // Session ID: stable per drawer open
  const sessionId = useMemo(() => crypto.randomUUID(), [])

  const isFirstMessage = messages.length === 0

  // ── Auto-save a single message (fire-and-forget) ──────────────────────────
  const saveMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    if (!authToken || !content.trim()) return
    fetch(`/api/patents/${patentId}/chat-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ session_id: sessionId, role, content }),
    }).catch(() => {/* non-blocking */})
  }, [authToken, patentId, sessionId])

  // ── Session summary on close (if 3+ exchanges) ────────────────────────────
  const saveSummaryAndClose = useCallback(async (msgs: Message[]) => {
    const exchanges = msgs.filter(m => !m.suggestion || m.suggestionState !== 'pending').length
    if (exchanges < 3) { onClose(); return }

    setSummaryToast('saving')
    const plainMsgs = msgs.map(m => ({ role: m.role, content: m.content }))

    fetch(`/api/patents/${patentId}/chat-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ messages: plainMsgs, patent_title: patentTitle }),
    }).then(r => {
      if (!r.ok) throw new Error('save failed')
      setSummaryToast('saved')
      setTimeout(() => { setSummaryToast(null); onClose() }, 2000)
    }).catch(() => {
      setSummaryToast('error')
      setTimeout(() => { setSummaryToast(null); onClose() }, 2000)
    })
  }, [authToken, patentId, patentTitle, onClose])

  // ── Close handler (checks for pending suggestions) ────────────────────────
  const handleClose = useCallback(() => {
    const hasPendingSuggestions = messages.some(
      m => m.suggestion && m.suggestionState === 'pending'
    )
    if (hasPendingSuggestions) {
      setClosePending(true)
    } else {
      saveSummaryAndClose(messages)
    }
  }, [messages, saveSummaryAndClose])

  useEffect(() => {
    // Scroll within the chat container only — never escape to window
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages, streaming])
  useEffect(() => { inputRef.current?.focus() }, [])

  // ── Apply suggestion via PATCH ─────────────────────────────────────────────
  const applySuggestion = useCallback(async (msgIdx: number, overrideValue?: string) => {
    const msg = messages[msgIdx]
    if (!msg?.suggestion) return
    const value = overrideValue ?? msg.suggestion.proposed_value

    // Optimistic update
    setMessages(prev => prev.map((m, i) =>
      i === msgIdx ? { ...m, suggestionState: 'applied' } : m
    ))

    try {
      const res = await fetch(`/api/patents/${patentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ [msg.suggestion.field_name]: value }),
      })
      if (!res.ok) throw new Error('Update failed')
      onFieldApplied?.(msg.suggestion.field_name, value)
    } catch {
      // Revert on failure
      setMessages(prev => prev.map((m, i) =>
        i === msgIdx ? { ...m, suggestionState: 'pending' } : m
      ))
    }
  }, [messages, patentId, authToken, onFieldApplied])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || streaming) return

    setInput('')
    setError('')
    const userMsg: Message = { role: 'user', content: text }
    // Auto-save user message
    saveMessage('user', text)
    // Strip suggestion/state from messages when building API payload
    const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)

    // Start thinking status rotation
    const thinkingMsgs = getThinkingMessages(text)
    let thinkIdx = 0
    setThinkingStatus(thinkingMsgs[0])
    if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current)
    thinkingTimerRef.current = setInterval(() => {
      thinkIdx = (thinkIdx + 1) % thinkingMsgs.length
      setThinkingStatus(thinkingMsgs[thinkIdx])
    }, 2500)

    // Add empty assistant bubble
    setMessages(prev => [...prev, { role: 'assistant', content: '', suggestionState: undefined }])

    abortRef.current = new AbortController()

    try {
      const res = await fetch(`/api/patents/${patentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ patentId, messages: apiMessages }),
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

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)

            // Text delta
            if (parsed.text) {
              // First token — clear thinking status
              if (thinkingTimerRef.current) { clearInterval(thinkingTimerRef.current); thinkingTimerRef.current = null }
              setThinkingStatus(null)
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.role === 'assistant') {
                  copy[copy.length - 1] = { ...last, content: last.content + parsed.text }
                }
                return copy
              })
            }

            // Session summary saved — strip the summary block from rendered message text
            if (parsed.type === 'session_summary_saved') {
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.role === 'assistant' && last.content) {
                  copy[copy.length - 1] = { ...last, content: stripSessionSummary(last.content) }
                }
                return copy
              })
            }

            // Suggestion event
            if (parsed.suggestion) {
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.role === 'assistant') {
                  copy[copy.length - 1] = {
                    ...last,
                    suggestion: parsed.suggestion as Suggestion,
                    suggestionState: 'pending',
                  }
                }
                return copy
              })
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Something went wrong. Try again.'
      setError(msg)
      setMessages(prev => {
        const copy = [...prev]
        if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) copy.pop()
        return copy
      })
    } finally {
      // Clear thinking status
      if (thinkingTimerRef.current) { clearInterval(thinkingTimerRef.current); thinkingTimerRef.current = null }
      setThinkingStatus(null)
      // Auto-save completed assistant message
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content) {
          saveMessage('assistant', last.content)
        }
        return prev
      })
      setStreaming(false)
      abortRef.current = null
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, messages, streaming, patentId, authToken, onTierRequired, saveMessage])

  // Auto-fire initialPrompt as first message (only once on open)
  useEffect(() => {
    if (initialPrompt && !initialPromptFiredRef.current && !streaming) {
      initialPromptFiredRef.current = true
      // Small delay so the drawer renders first
      setTimeout(() => sendMessage(initialPrompt), 300)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleReset = () => {
    abortRef.current?.abort()
    setMessages([]); setInput(''); setError(''); setStreaming(false)
  }

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
      <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={handleClose} aria-hidden />
      <div
        className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-[420px] sm:border-l sm:border-gray-200"
        role="dialog" aria-label="Pattie Chat" aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <PattieAvatar size={34} />
            <div>
              <div className="font-semibold text-[#1a1f36] text-sm leading-tight">Pattie 🦞</div>
              <div className="text-xs text-gray-400 leading-tight">Your PatentPending assistant</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
              Clear
            </button>
            <button onClick={handleClose} aria-label="Close chat"
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Message list — scroll container scoped here, never escapes to window */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {isFirstMessage && (
            <div className="flex justify-start items-end gap-2">
              <PattieAvatar size={26} />
              <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-gray-100 text-[#1a1f36] text-sm leading-relaxed">
                <p>Hi! I&apos;m Pattie — your PatentPending assistant. I know{' '}
                  <strong>{patentTitle}</strong> inside and out. Ask me anything about your claims, spec, or next steps.</p>
              </div>
            </div>
          )}

          {isFirstMessage && !streaming && (
            <div className="flex flex-wrap gap-2 pl-9 pt-1">
              {starterChips.map(chip => (
                <button key={chip} onClick={() => sendMessage(chip)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#4f46e5] text-[#4f46e5] hover:bg-[#4f46e5] hover:text-white transition-colors font-medium">
                  {chip}
                </button>
              ))}
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {msg.role === 'assistant' && <PattieAvatar size={26} />}
              <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Text bubble */}
                {(msg.content || (msg.role === 'assistant' && streaming && idx === messages.length - 1)) && (
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed
                    ${msg.role === 'user' ? 'bg-[#4f46e5] text-white rounded-br-sm' : 'bg-gray-100 text-[#1a1f36] rounded-bl-sm'}`}>
                    {msg.role === 'assistant' && msg.content === '' && streaming ? (
                      <TypingDots />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{renderContent(msg.content)}</p>
                    )}
                  </div>
                )}

                {/* Suggestion card — only for assistant messages */}
                {msg.role === 'assistant' && msg.suggestion && msg.suggestionState && (
                  <div className="w-full max-w-[340px]">
                    <SuggestionCard
                      suggestion={msg.suggestion}
                      state={msg.suggestionState}
                      editedValue={msg.editedValue}
                      onApply={() => applySuggestion(idx)}
                      onReject={() => setMessages(prev => prev.map((m, i) =>
                        i === idx ? { ...m, suggestionState: 'rejected' } : m
                      ))}
                      onEdit={() => setMessages(prev => prev.map((m, i) =>
                        i === idx ? { ...m, suggestionState: 'editing', editedValue: m.suggestion?.proposed_value ?? '' } : m
                      ))}
                      onEditChange={v => setMessages(prev => prev.map((m, i) =>
                        i === idx ? { ...m, editedValue: v } : m
                      ))}
                      onEditApply={() => applySuggestion(idx, messages[idx]?.editedValue)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start items-end gap-2">
              <PattieAvatar size={26} />
              <div className="bg-gray-100 text-[#1a1f36] px-3 py-2 rounded-2xl rounded-bl-sm">
                <TypingDots />
              </div>
            </div>
          )}

          {/* Thinking status chip — shows before first stream token */}
          {thinkingStatus && !streaming && (
            <ThinkingChip status={thinkingStatus} />
          )}
          {thinkingStatus && streaming && (
            <ThinkingChip status={thinkingStatus} />
          )}

          {error && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              ⚠️ {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 pt-3 pb-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Pattie anything about your patent…"
              rows={1} disabled={streaming}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#1a1f36] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30 focus:border-[#4f46e5] disabled:opacity-60 disabled:cursor-not-allowed min-h-[40px] max-h-[120px] overflow-y-auto"
              style={{ height: 'auto' }}
              onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || streaming} aria-label="Send message"
              className="shrink-0 w-10 h-10 rounded-xl bg-[#4f46e5] text-white flex items-center justify-center hover:bg-[#4338ca] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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
          <p className="text-[10px] text-gray-400 mt-2 mb-1 text-center leading-tight">
            Pattie is an AI assistant, not a licensed attorney. Always verify with a qualified professional.
          </p>
        </div>
      </div>

      {/* ── Summary saving toast ─────────────────────────────────────────── */}
      {/* Summary saving toast — bottom-right, non-blocking */}
      {summaryToast && (
        <div className={`fixed bottom-6 right-6 z-[60] text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg transition-all ${
          summaryToast === 'saving' ? 'bg-[#1a1f36] text-white' :
          summaryToast === 'saved'  ? 'bg-green-600 text-white' :
          'bg-gray-100 text-gray-500'
        }`}>
          {summaryToast === 'saving' ? '🦞 Saving conversation summary…' :
           summaryToast === 'saved'  ? '✓ Saved to Correspondence' :
           'Couldn\'t save summary'}
        </div>
      )}

      {/* ── Close warning: pending suggestions ──────────────────────────────── */}
      {closePending && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-bold text-[#1a1f36] text-base mb-2">Unsaved Pattie suggestions</h3>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              Your conversation will be saved to Correspondence, but pending suggestions won&apos;t be applied automatically.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  // Apply all pending suggestions
                  setMessages(prev => {
                    const copy = [...prev]
                    copy.forEach((m, i) => {
                      if (m.suggestion && m.suggestionState === 'pending') {
                        copy[i] = { ...m, suggestionState: 'applied' }
                        // Fire the PATCH
                        fetch(`/api/patents/${patentId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                          body: JSON.stringify({ [m.suggestion.field_name]: m.suggestion.proposed_value }),
                        }).catch(() => {})
                        onFieldApplied?.(m.suggestion.field_name, m.suggestion.proposed_value)
                      }
                    })
                    return copy
                  })
                  setClosePending(false)
                  saveSummaryAndClose(messages)
                }}
                className="w-full py-2.5 bg-[#4f46e5] text-white rounded-xl text-sm font-semibold hover:bg-[#4338ca] transition-colors"
              >
                Apply all suggestions &amp; close
              </button>
              <button
                onClick={() => { setClosePending(false); saveSummaryAndClose(messages) }}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Close anyway
              </button>
              <button
                onClick={() => setClosePending(false)}
                className="w-full py-2 text-gray-400 text-sm hover:text-gray-600 transition-colors"
              >
                Stay in chat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
