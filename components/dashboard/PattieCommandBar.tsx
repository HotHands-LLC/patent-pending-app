'use client'

/**
 * PattieCommandBar — Pattie command interface for the authenticated dashboard.
 * Rendered at the top of the dashboard. Shows status snapshot + Pattie input.
 * Handles context priming from homepage handoff via sessionStorage.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import VoiceInput from '@/components/VoiceInput'

const CONTEXT_KEY = 'pattie_homepage_context'
const HISTORY_KEY = 'pattie_dashboard_history'

interface Message {
  role: 'user' | 'assistant'
  content: string
  navigate_to?: string | null
}

interface StatusSnapshot {
  patentCount: number
  urgentDeadlineCount: number
  listingCount: number
  recentPatentTitle?: string
  urgentPatentName?: string
  urgentDeadlineDays?: number
}

interface PattieCommandBarProps {
  authToken: string
  firstName: string
  snapshot: StatusSnapshot
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-1.5 mt-0.5 shrink-0">P</div>
      )}
      <div className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
        isUser ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
      }`}>
        {msg.content}
        {msg.navigate_to && (
          <div className="mt-2">
            <Link
              href={msg.navigate_to}
              className="inline-block text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors"
            >
              Go → {msg.navigate_to.split('/').pop()?.replace(/-/g, ' ')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex justify-start mb-2">
      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-1.5 mt-0.5 shrink-0">P</div>
      <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm px-3.5 py-2">
        <div className="flex gap-1 items-center h-4">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PattieCommandBar({ authToken, firstName, snapshot }: PattieCommandBarProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [priming, setPriming] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    // Check for homepage context handoff
    try {
      const raw = sessionStorage.getItem(CONTEXT_KEY)
      if (raw) {
        const ctx = JSON.parse(raw)
        setPriming(ctx)
        sessionStorage.removeItem(CONTEXT_KEY)
      }
    } catch { /* noop */ }

    // Load previous dashboard conversation
    try {
      const hist = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]')
      setMessages(hist)
    } catch { /* noop */ }
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-20))) } catch { /* noop */ }
    }
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

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
      const res = await fetch('/api/pattie/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          messages: apiMessages,
          priming: priming.length > 0 ? priming : undefined,
        }),
      })

      // Clear priming after first use
      if (priming.length > 0) setPriming([])

      if (!res.ok || !res.body) { setStreaming(false); return }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let accumulated = ''
      let navigateTo: string | null = null

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
            if (evt.type === 'meta') { navigateTo = evt.navigate_to ?? null }
          } catch { /* skip */ }
        }
      }

      const assistantMsg: Message = { role: 'assistant', content: accumulated, navigate_to: navigateTo }
      setMessages(prev => [...prev, assistantMsg])
      setStreamText('')

      // Auto-navigate if Pattie gave a route
      if (navigateTo && !accumulated.toLowerCase().includes('confirm')) {
        router.push(navigateTo)
      }
    } catch { /* noop */ }
    finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [messages, streaming, priming, authToken, router])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  // Contextual quick chips
  const chips: string[] = []
  if (snapshot.recentPatentTitle) chips.push(`Review "${snapshot.recentPatentTitle.slice(0, 30)}…"`)
  if (snapshot.urgentPatentName && snapshot.urgentDeadlineDays !== undefined) {
    chips.push(`⚠️ ${snapshot.urgentPatentName.slice(0, 25)} — ${snapshot.urgentDeadlineDays}d`)
  }
  if (snapshot.listingCount === 0) chips.push('List my IP for sale')
  chips.push('Start a new patent')
  chips.push('Search prior art')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 mb-6 overflow-hidden">
      {/* ── Status snapshot ───────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-4 flex-wrap text-xs text-gray-500 bg-gray-50">
        <Link href="/dashboard/patents" className="hover:text-indigo-600 transition-colors">
          <span className="font-bold text-gray-800">{snapshot.patentCount}</span> patent{snapshot.patentCount !== 1 ? 's' : ''}
        </Link>
        <Link href="/dashboard/deadlines" className={`hover:text-indigo-600 transition-colors ${snapshot.urgentDeadlineCount > 0 ? 'text-red-600 font-semibold' : ''}`}>
          {snapshot.urgentDeadlineCount > 0 ? `⚠️ ${snapshot.urgentDeadlineCount} deadline${snapshot.urgentDeadlineCount !== 1 ? 's' : ''} in 30 days` : '✓ No urgent deadlines'}
        </Link>
        <Link href="/marketplace" className="hover:text-indigo-600 transition-colors">
          <span className="font-bold text-gray-800">{snapshot.listingCount}</span> marketplace listing{snapshot.listingCount !== 1 ? 's' : ''}
        </Link>
        <Link href="/dashboard/patents" className="ml-auto text-indigo-500 hover:underline">View all patents →</Link>
      </div>

      {/* ── Chat history ──────────────────────────────────────────────────── */}
      {messages.length > 0 && (
        <div className="px-5 pt-4 max-h-72 overflow-y-auto">
          {messages.map((m, i) => <Bubble key={i} msg={m} />)}
          {streaming && !streamText && <TypingDots />}
          {streaming && streamText && <Bubble msg={{ role: 'assistant', content: streamText }} />}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-600 mb-3 font-medium">
            {greeting}, {firstName}. What are we working on?
            {priming.length > 0 && <span className="text-indigo-500 text-xs ml-2">↩ Continuing from homepage…</span>}
          </p>
        )}

        {/* Quick chips */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {chips.slice(0, 5).map(c => (
              <button key={c} onClick={() => send(c)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                  c.startsWith('⚠️')
                    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700'
                }`}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Pattie or type a command…"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 disabled:opacity-50 max-h-24 leading-relaxed"
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
    </div>
  )
}
