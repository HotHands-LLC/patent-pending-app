'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import PattieSuggestionCards from '@/components/PattieSuggestionCards'

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
  initialMessage?: string  // context-only; sent to API but NOT shown as a visible message
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
  initialMessage,
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  const isFirstMessage = messages.length === 0

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming])
  useEffect(() => { inputRef.current?.focus() }, [])

  // If opened with an initialMessage (e.g. from ?pattie= URL param), auto-send it as
  // hidden context — Pattie gets the full message but only her RESPONSE is shown (not the prompt).
  useEffect(() => {
    if (initialMessage && messages.length === 0 && authToken && !streaming) {
      const hiddenMsg = initialMessage.trim()
      if (!hiddenMsg) return
      // Send to API with the hidden message but don't add it to visible messages array
      const apiMessages = [{ role: 'user', content: hiddenMsg }]
      setStreaming(true)
      setMessages([{ role: 'assistant', content: '' }])
      const ctrl = new AbortController()
      abortRef.current = ctrl
      fetch(`/api/patents/${patentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ patentId, messages: apiMessages }),
        signal: ctrl.signal,
      }).then(async res => {
        if (!res.ok || !res.body) { setStreaming(false); setMessages([]); return }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let text = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') break
            try {
              const p = JSON.parse(data)
              if (p.text) {
                text += p.text
                setMessages([{ role: 'assistant', content: text }])
              }
            } catch { /* partial */ }
          }
        }
        setStreaming(false)
      }).catch(() => { setStreaming(false); setMessages([]) })
    }
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage])

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

      // ── Auto-journal: write a 🤖 Pattie Update entry (non-blocking) ────────
      const fieldLabel = msg.suggestion.field_name
        .replace(/_draft$/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
      const preview = (msg.suggestion.proposed_value ?? '').slice(0, 150).replace(/\n/g, ' ')
      const suffix = preview.length >= 150 ? '\u2026' : ''
      const summary = preview
        ? `Pattie applied an update to ${fieldLabel}: "${preview}${suffix}"`
        : `Applied Pattie suggestion to ${fieldLabel}.`
      fetch('/api/correspondence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          patent_id: patentId,
          type: 'pattie_session',
          title: `Pattie updated ${fieldLabel}`,
          content: summary,
          correspondence_date: new Date().toISOString().split('T')[0],
          from_party: 'Pattie (PatentPending.app)',
          tags: ['pattie', 'auto-journal'],
        }),
      }).catch(() => {/* non-blocking — ignore errors */})
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
    // Strip suggestion/state from messages when building API payload
    const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)

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
              setMessages(prev => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last?.role === 'assistant') {
                  copy[copy.length - 1] = { ...last, content: last.content + parsed.text }
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
      setStreaming(false)
      abortRef.current = null
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, messages, streaming, patentId, authToken, onTierRequired])

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
      <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={onClose} aria-hidden />
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
            <button onClick={onClose} aria-label="Close chat"
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
            <>
              {/* P-Fix-3b: Proactive suggestion cards — shown before first message */}
              <PattieSuggestionCards
                patentId={patentId}
                authToken={authToken}
                onAccept={(message) => sendMessage(message)}
              />
              <div className="flex flex-wrap gap-2 pl-9 pt-1">
                {starterChips.map(chip => (
                  <button key={chip} onClick={() => sendMessage(chip)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[#4f46e5] text-[#4f46e5] hover:bg-[#4f46e5] hover:text-white transition-colors font-medium">
                    {chip}
                  </button>
                ))}
              </div>
            </>
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
    </>
  )
}
