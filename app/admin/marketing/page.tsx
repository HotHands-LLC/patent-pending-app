'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Idea {
  id: string
  brand: string
  channel: string
  title: string
  body: string | null
  hook: string | null
  subject_line: string | null
  status: 'idea' | 'drafting' | 'ready' | 'posted'
  source: 'chad' | 'pattie'
  created_at: string
  posted_at: string | null
  scheduled_for: string | null
  tone: string | null
  hashtags: string | null
  reddit_title: string | null
  amazon_bullets: string[] | null
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BRANDS = ['pp.app', 'ody.net']
const CHANNELS = ['TikTok', 'Instagram', 'LinkedIn', 'Reddit', 'Attorney Outreach', 'Amazon']

const CHANNEL_COLORS: Record<string, string> = {
  'TikTok':            'bg-pink-100 text-pink-700 border-pink-200',
  'Instagram':         'bg-purple-100 text-purple-700 border-purple-200',
  'LinkedIn':          'bg-blue-100 text-blue-700 border-blue-200',
  'Reddit':            'bg-orange-100 text-orange-700 border-orange-200',
  'Attorney Outreach': 'bg-gray-100 text-gray-700 border-gray-200',
  'Amazon':            'bg-yellow-100 text-yellow-700 border-yellow-200',
}

const CHAR_LIMITS: Record<string, string> = {
  'TikTok':    '2,200 char caption',
  'Instagram': '2,200 char caption',
  'LinkedIn':  '3,000 char post',
  'Reddit':    'No limit',
  'Amazon':    '500 char description',
  'Attorney Outreach': 'Email — no limit',
}

const CHAR_MAX: Record<string, number> = {
  'TikTok': 2200, 'Instagram': 2200, 'LinkedIn': 3000, 'Amazon': 500,
}

const CHAR_OPTIMAL: Record<string, string> = {
  'TikTok': 'Hook: 3–5 words. Caption: 150 chars optimal.',
  'Instagram': 'Optimal: 300 chars + hashtags.',
  'LinkedIn': 'Optimal: 1,000–1,300 chars. Line breaks matter.',
  'Reddit': 'Title: 300 chars max. Body: 500 chars optimal.',
  'Amazon': 'Listing title: 200 chars. 5 bullet points.',
  'Attorney Outreach': 'Subject + body. Body: 200 words optimal.',
}

const DEFAULT_TONE: Record<string, string> = {
  'TikTok': 'story', 'Instagram': 'story', 'LinkedIn': 'professional',
  'Reddit': 'educational', 'Attorney Outreach': 'professional', 'Amazon': 'educational',
}

const TONES = [
  { id: 'educational', label: '📖 Educational' },
  { id: 'story',       label: '📣 Story' },
  { id: 'hype',        label: '🔥 Hype' },
  { id: 'professional',label: '🤝 Professional' },
]

const STATUS_LABELS: Record<string, string> = {
  idea: '💡 Idea', drafting: '✍️ Drafting', ready: '✅ Ready', posted: '📤 Posted',
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MarketingPage() {
  const router = useRouter()
  const [authToken, setAuthToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedBrand, setSelectedBrand] = useState('pp.app')
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [generatingIdeas, setGeneratingIdeas] = useState(false)
  const [generatingAttorney, setGeneratingAttorney] = useState(false)
  const [newIdeaTitle, setNewIdeaTitle] = useState('')
  const [newIdeaChannel, setNewIdeaChannel] = useState('TikTok')
  const [addingIdea, setAddingIdea] = useState(false)
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [calendarView, setCalendarView] = useState(false)
  const [eventSuggestions, setEventSuggestions] = useState<Array<{title: string; channel: string; reason: string}>>([])
  const [rewritingId, setRewritingId] = useState<string | null>(null)
  const [hashtagLoadingId, setHashtagLoadingId] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const fetchIdeas = useCallback(async (token: string, brand: string) => {
    const res = await fetch(`/api/admin/marketing/ideas?brand=${encodeURIComponent(brand)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setIdeas(d.ideas ?? [])
      // Check event-driven suggestions
      fetchEventSuggestions(token)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchEventSuggestions(token: string) {
    try {
      const supa = await import('@/lib/supabase').then(m => m.supabase)
      // Check provisional_ready patents
      const { data: readyPatents } = await supa.from('patents')
        .select('id, title').eq('filing_status', 'provisional_ready').limit(3)
      // Check patents with deadline < 30 days
      const soon = new Date(); soon.setDate(soon.getDate() + 30)
      const { data: urgentPatents } = await supa.from('patents')
        .select('id, title, provisional_deadline')
        .lt('provisional_deadline', soon.toISOString().split('T')[0])
        .gt('provisional_deadline', new Date().toISOString().split('T')[0])
        .limit(2)
      const suggestions: Array<{title: string; channel: string; reason: string}> = []
      for (const p of (readyPatents ?? []).slice(0, 1)) {
        suggestions.push({ title: `Announce: "${p.title.slice(0, 40)}"`, channel: 'LinkedIn', reason: 'Patent just graduated to Provisional Ready' })
      }
      for (const p of (urgentPatents ?? []).slice(0, 1)) {
        const days = Math.ceil((new Date(p.provisional_deadline).getTime() - Date.now()) / 86400000)
        suggestions.push({ title: `Filing deadline in ${days} days — share your story`, channel: 'TikTok', reason: `Patent deadline approaching: ${p.title.slice(0, 30)}` })
      }
      setEventSuggestions(suggestions)
    } catch { /* non-blocking */ }
  }

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('marketing_brand') : null
    if (saved && BRANDS.includes(saved)) setSelectedBrand(saved)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? ''
        setAuthToken(token)
        const brand = saved && BRANDS.includes(saved) ? saved : 'pp.app'
        fetchIdeas(token, brand).finally(() => setLoading(false))
      })
    })
  }, [router, fetchIdeas])

  function switchBrand(brand: string) {
    setSelectedBrand(brand)
    localStorage.setItem('marketing_brand', brand)
    fetchIdeas(authToken, brand)
  }

  // ── Generate 5 ideas ──────────────────────────────────────────────────────
  async function generateIdeas() {
    setGeneratingIdeas(true)
    try {
      const res = await fetch('/api/admin/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ brand: selectedBrand, type: 'ideas' }),
      })
      const d = await res.json()
      const generated: Array<{ channel: string; title: string; hook?: string; rationale?: string }> = d.result ?? []
      if (!Array.isArray(generated)) { showToast('⚠️ Could not parse ideas'); return }
      // Save all to DB
      for (const idea of generated) {
        await fetch('/api/admin/marketing/ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ brand: selectedBrand, channel: idea.channel, title: idea.title, hook: idea.hook, source: 'pattie', status: 'idea' }),
        })
      }
      await fetchIdeas(authToken, selectedBrand)
      showToast(`✅ ${generated.length} ideas generated`)
    } catch { showToast('❌ Generation failed') }
    finally { setGeneratingIdeas(false) }
  }

  // ── Generate attorney outreach ────────────────────────────────────────────
  async function generateAttorneyOutreach() {
    setGeneratingAttorney(true)
    try {
      const res = await fetch('/api/admin/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ brand: selectedBrand, type: 'attorney_outreach' }),
      })
      const d = await res.json()
      const result = d.result as { subject?: string; body?: string } | null
      if (!result?.subject) { showToast('⚠️ Could not parse attorney draft'); return }
      await fetch('/api/admin/marketing/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          brand: selectedBrand, channel: 'Attorney Outreach',
          title: result.subject, body: result.body, subject_line: result.subject,
          source: 'pattie', status: 'ready',
        }),
      })
      await fetchIdeas(authToken, selectedBrand)
      showToast('✅ Attorney outreach drafted')
    } catch { showToast('❌ Draft failed') }
    finally { setGeneratingAttorney(false) }
  }

  // ── Draft idea into full content ──────────────────────────────────────────
  async function draftIdea(idea: Idea) {
    setDraftingId(idea.id)
    try {
      const gemKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY  // won't work client-side — use API route
      const res = await fetch('/api/admin/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          brand: selectedBrand, type: 'draft_single',
          channel: idea.channel, title: idea.title, hook: idea.hook,
        }),
      })
      const d = await res.json()
      const body = typeof d.result === 'string' ? d.result
        : (d.result?.body ?? d.raw ?? '')
      await fetch('/api/admin/marketing/ideas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id: idea.id, body, status: 'ready' }),
      })
      await fetchIdeas(authToken, selectedBrand)
      showToast('✅ Content drafted')
    } catch { showToast('❌ Draft failed') }
    finally { setDraftingId(null) }
  }

  // ── Add manual idea ────────────────────────────────────────────────────────
  async function addManualIdea() {
    if (!newIdeaTitle.trim()) return
    setAddingIdea(true)
    try {
      await fetch('/api/admin/marketing/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ brand: selectedBrand, channel: newIdeaChannel, title: newIdeaTitle.trim(), source: 'chad', status: 'idea' }),
      })
      setNewIdeaTitle('')
      await fetchIdeas(authToken, selectedBrand)
    } finally { setAddingIdea(false) }
  }

  // ── Inline body edit (auto-save) ──────────────────────────────────────────
  function handleBodyEdit(id: string, value: string) {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, body: value } : i))
    clearTimeout(autoSaveTimers.current[id])
    autoSaveTimers.current[id] = setTimeout(() => {
      fetch('/api/admin/marketing/ideas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id, body: value }),
      })
    }, 1200)
  }

  function handleSubjectEdit(id: string, value: string) {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, subject_line: value } : i))
    clearTimeout(autoSaveTimers.current[`subj-${id}`])
    autoSaveTimers.current[`subj-${id}`] = setTimeout(() => {
      fetch('/api/admin/marketing/ideas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id, subject_line: value }),
      })
    }, 1200)
  }

  // ── Copy to clipboard ─────────────────────────────────────────────────────
  async function copyText(id: string, text: string, label = '') {
    await navigator.clipboard.writeText(text)
    setCopiedId(id + label)
    showToast('📋 Copied!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── Download .txt ─────────────────────────────────────────────────────────
  function download(idea: Idea) {
    const text = idea.channel === 'Attorney Outreach'
      ? `Subject: ${idea.subject_line ?? idea.title}\n\n${idea.body ?? ''}`
      : (idea.body ?? '')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${idea.channel.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Tone rewrite ──────────────────────────────────────────────────────────
  async function rewriteWithTone(idea: Idea, tone: string) {
    if (!authToken) return
    setRewritingId(idea.id)
    try {
      const res = await fetch('/api/admin/marketing/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id: idea.id, tone, channel: idea.channel, current_body: idea.body }),
      })
      const d = await res.json()
      if (res.ok && d.body) {
        setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, body: d.body, tone } : i))
        handleBodyEdit(idea.id, d.body)
        showToast(`✅ Rewritten in ${tone} tone`)
      } else showToast(d.error ?? 'Rewrite failed')
    } catch { showToast('Network error') }
    finally { setRewritingId(null) }
  }

  // ── Hashtag assistant ─────────────────────────────────────────────────────
  async function getHashtags(idea: Idea) {
    if (!authToken) return
    setHashtagLoadingId(idea.id)
    try {
      const res = await fetch('/api/admin/marketing/hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ channel: idea.channel, body: idea.body, title: idea.title }),
      })
      const d = await res.json()
      if (res.ok && d.hashtags) {
        setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, hashtags: d.hashtags } : i))
        showToast('# Hashtags generated')
      } else showToast(d.error ?? 'Hashtag generation failed')
    } catch { showToast('Network error') }
    finally { setHashtagLoadingId(null) }
  }

  // ── Mark posted ───────────────────────────────────────────────────────────
  async function markPosted(id: string) {
    await fetch('/api/admin/marketing/ideas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id, status: 'posted' }),
    })
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, status: 'posted', posted_at: new Date().toISOString() } : i))
    showToast('📤 Marked as posted')
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function deleteIdea(id: string) {
    await fetch(`/api/admin/marketing/ideas?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    })
    setIdeas(prev => prev.filter(i => i.id !== id))
    setDeleteConfirmId(null)
    showToast('🗑️ Deleted')
  }

  // ── Derived lists ──────────────────────────────────────────────────────────
  const pattieIdeas = ideas.filter(i => i.source === 'pattie' && i.status === 'idea')
  const chadIdeas   = ideas.filter(i => i.source === 'chad' && i.status === 'idea')
  const contentCards = ideas
    .filter(i => i.status !== 'idea' || i.body)
    .sort((a, b) => {
      const order = { ready: 0, drafting: 1, idea: 2, posted: 3 }
      return (order[a.status] ?? 2) - (order[b.status] ?? 2)
    })

  if (loading) return (
    <div className="min-h-screen bg-gray-50"><Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
              <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link>
              <span>/</span>
              <span className="text-[#1a1f36]">Marketing</span>
            </div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">📣 Marketing Command Center</h1>
          </div>
          {/* Brand switcher */}
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
            {BRANDS.map(b => (
              <button key={b} onClick={() => switchBrand(b)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  selectedBrand === b ? 'bg-white text-[#1a1f36] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>{b}</button>
            ))}
          </div>
        </div>

        {/* ── Event Suggestions ────────────────────────────────────────────── */}
        {eventSuggestions.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-900 mb-2">💡 Suggested for You</p>
            <div className="space-y-2">
              {eventSuggestions.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-amber-100">
                  <div>
                    <span className="text-xs font-semibold text-gray-800">{s.title}</span>
                    <span className="ml-2 text-[10px] text-gray-400">via {s.channel}</span>
                    <p className="text-[10px] text-amber-600">{s.reason}</p>
                  </div>
                  <button
                    onClick={() => { setNewIdeaTitle(s.title); setNewIdeaChannel(s.channel) }}
                    className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 whitespace-nowrap font-semibold"
                  >
                    Draft It
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Ideas Queue ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Pattie Ideas */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[#1a1f36] text-sm">🤖 Pattie Ideas</h2>
              <button onClick={generateIdeas} disabled={generatingIdeas}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {generatingIdeas ? '⏳ Generating…' : '✨ Generate Ideas'}
              </button>
            </div>
            {pattieIdeas.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No ideas yet — click Generate Ideas to get 5 from Pattie.</p>
            ) : (
              <div className="space-y-2">
                {pattieIdeas.map(idea => (
                  <IdeaCard key={idea.id} idea={idea}
                    onDraft={() => draftIdea(idea)}
                    onDelete={() => setDeleteConfirmId(idea.id)}
                    isDrafting={draftingId === idea.id}
                    confirmDelete={deleteConfirmId === idea.id}
                    onConfirmDelete={() => deleteIdea(idea.id)}
                    onCancelDelete={() => setDeleteConfirmId(null)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Chad Ideas */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-[#1a1f36] text-sm mb-4">✏️ My Ideas</h2>
            <div className="flex gap-2 mb-4">
              <input type="text" value={newIdeaTitle} onChange={e => setNewIdeaTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addManualIdea()}
                placeholder="Idea title…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <select value={newIdeaChannel} onChange={e => setNewIdeaChannel(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none">
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={addManualIdea} disabled={addingIdea || !newIdeaTitle.trim()}
                className="px-3 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50">
                + Add
              </button>
            </div>
            {chadIdeas.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Add your own ideas above.</p>
            ) : (
              <div className="space-y-2">
                {chadIdeas.map(idea => (
                  <IdeaCard key={idea.id} idea={idea}
                    onDraft={() => draftIdea(idea)}
                    onDelete={() => setDeleteConfirmId(idea.id)}
                    isDrafting={draftingId === idea.id}
                    confirmDelete={deleteConfirmId === idea.id}
                    onConfirmDelete={() => deleteIdea(idea.id)}
                    onCancelDelete={() => setDeleteConfirmId(null)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Content Cards ─────────────────────────────────────────────────── */}
        {(contentCards.length > 0 || ideas.some(i => i.channel === 'Attorney Outreach')) && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-[#1a1f36]">📄 Content Cards</h2>
                {/* Calendar / List toggle */}
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs">
                  <button onClick={() => setCalendarView(false)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${!calendarView ? 'bg-white text-[#1a1f36] shadow-sm' : 'text-gray-500'}`}>
                    ☰ List
                  </button>
                  <button onClick={() => setCalendarView(true)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${calendarView ? 'bg-white text-[#1a1f36] shadow-sm' : 'text-gray-500'}`}>
                    📅 Calendar
                  </button>
                </div>
              </div>
              <button onClick={generateAttorneyOutreach} disabled={generatingAttorney}
                className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">
                {generatingAttorney ? '⏳ Drafting…' : '⚖️ Generate Attorney Outreach'}
              </button>
            </div>
            {calendarView ? (
              <CalendarGrid ideas={contentCards} />
            ) : null}
            <div className={calendarView ? 'hidden' : 'grid grid-cols-1 lg:grid-cols-2 gap-4'}>
              {contentCards.map(idea => (
                <ContentCard key={idea.id} idea={idea}
                  onBodyEdit={v => handleBodyEdit(idea.id, v)}
                  onSubjectEdit={v => handleSubjectEdit(idea.id, v)}
                  onCopy={(text, label) => copyText(idea.id, text, label)}
                  onDownload={() => download(idea)}
                  onMarkPosted={() => markPosted(idea.id)}
                  onDelete={() => deleteIdea(idea.id)}
                  onToneRewrite={tone => rewriteWithTone(idea, tone)}
                  onGetHashtags={() => getHashtags(idea)}
                  copiedId={copiedId}
                  ownId={idea.id}
                  rewriting={rewritingId === idea.id}
                  hashtagLoading={hashtagLoadingId === idea.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Inbound Leads (placeholder) ───────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-[#1a1f36] text-sm mb-3">📥 Inbound Leads</h2>
          <p className="text-sm text-gray-400">
            Marketplace inquiry leads are visible per-patent in the patent detail → Leads tab.{' '}
            <Link href="/admin" className="text-indigo-600 hover:underline">View in Mission Control →</Link>
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-5 py-3 rounded-xl text-sm font-semibold shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── IdeaCard ──────────────────────────────────────────────────────────────────
function IdeaCard({ idea, onDraft, onDelete, isDrafting, confirmDelete, onConfirmDelete, onCancelDelete }: {
  idea: Idea
  onDraft: () => void
  onDelete: () => void
  isDrafting: boolean
  confirmDelete: boolean
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/50">
      <div className="flex items-start gap-2">
        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${CHANNEL_COLORS[idea.channel] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
          {idea.channel}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 leading-snug">{idea.title}</p>
          {idea.hook && <p className="text-xs text-gray-400 mt-0.5 italic">"{idea.hook.slice(0, 80)}…"</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={onDraft} disabled={isDrafting}
          className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 disabled:opacity-50">
          {isDrafting ? '⏳' : '✍️ Draft It'}
        </button>
        {confirmDelete ? (
          <>
            <span className="text-xs text-red-600">Delete?</span>
            <button onClick={onConfirmDelete} className="text-xs text-red-600 font-semibold hover:underline">Yes</button>
            <button onClick={onCancelDelete} className="text-xs text-gray-400 hover:underline">No</button>
          </>
        ) : (
          <button onClick={onDelete} className="text-xs text-gray-300 hover:text-red-400 ml-auto">✕</button>
        )}
      </div>
    </div>
  )
}

// ── CalendarGrid ──────────────────────────────────────────────────────────────
function CalendarGrid({ ideas }: { ideas: Idea[] }) {
  const today = new Date()
  today.setHours(0,0,0,0)
  const days: Date[] = []
  for (let i = 0; i < 28; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d)
  }
  const scheduled = ideas.filter(i => i.scheduled_for)
  const byDate: Record<string, Idea[]> = {}
  for (const idea of scheduled) {
    if (!byDate[idea.scheduled_for!]) byDate[idea.scheduled_for!] = []
    byDate[idea.scheduled_for!].push(idea)
  }
  const weeks: Date[][] = []
  for (let w = 0; w < 4; w++) weeks.push(days.slice(w * 7, w * 7 + 7))

  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="px-2 py-1.5 text-center text-xs font-semibold text-gray-500">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-0">
          {week.map(day => {
            const key = day.toISOString().split('T')[0]
            const isToday = key === today.toISOString().split('T')[0]
            const dayIdeas = byDate[key] ?? []
            return (
              <div key={key} className={`min-h-[64px] p-1.5 border-r border-gray-50 last:border-0 ${isToday ? 'bg-indigo-50' : ''}`}>
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-indigo-700' : 'text-gray-400'}`}>
                  {day.getDate()}
                </div>
                {dayIdeas.map(idea => (
                  <div key={idea.id} className={`text-[10px] px-1 py-0.5 rounded mb-0.5 truncate ${CHANNEL_COLORS[idea.channel]?.replace('border-','border ') ?? 'bg-gray-100'}`}>
                    {idea.title.slice(0, 20)}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ))}
      {scheduled.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-400">
          No cards scheduled. Set a scheduled date on content cards to see them here.
        </div>
      )}
    </div>
  )
}

// ── ContentCard ───────────────────────────────────────────────────────────────
function ContentCard({ idea, onBodyEdit, onSubjectEdit, onCopy, onDownload, onMarkPosted, onDelete, onToneRewrite, onGetHashtags, copiedId, ownId, rewriting, hashtagLoading }: {
  idea: Idea
  onBodyEdit: (v: string) => void
  onSubjectEdit: (v: string) => void
  onCopy: (text: string, label: string) => void
  onDownload: () => void
  onMarkPosted: () => void
  onDelete: () => void
  onToneRewrite: (tone: string) => void
  onGetHashtags: () => void
  copiedId: string | null
  ownId: string
  rewriting?: boolean
  hashtagLoading?: boolean
}) {
  const isAtty = idea.channel === 'Attorney Outreach'
  const isSocial = idea.channel === 'TikTok' || idea.channel === 'Instagram'
  const charLimit = CHAR_LIMITS[idea.channel] ?? ''
  const charMax = CHAR_MAX[idea.channel] ?? 0
  const bodyLen = (idea.body ?? '').length
  const charPct = charMax > 0 ? bodyLen / charMax : 0
  const charColor = charPct > 0.9 ? 'text-red-500' : charPct > 0.7 ? 'text-amber-500' : 'text-gray-400'
  const currentTone = idea.tone ?? DEFAULT_TONE[idea.channel] ?? 'story'
  const isPosted = idea.status === 'posted'
  const hashtagList = (idea.hashtags ?? '').split(/\s+/).filter((h: string) => h.startsWith('#'))

  return (
    <div className={`border rounded-xl overflow-hidden ${isPosted ? 'opacity-50 border-gray-200' : 'border-gray-200'}`}>
      <div className={`px-4 py-2.5 flex items-center justify-between border-b border-gray-100 ${isPosted ? 'bg-gray-50' : 'bg-white'}`}>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${CHANNEL_COLORS[idea.channel] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {idea.channel}
          </span>
          <span className="text-xs text-gray-400">{STATUS_LABELS[idea.status]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {!isPosted && (
            <button onClick={onMarkPosted} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
              📤 Mark Posted
            </button>
          )}
          <button onClick={onDownload} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">⬇️</button>
          <button onClick={onDelete} className="text-xs text-gray-300 hover:text-red-400 px-1.5">✕</button>
        </div>
      </div>

      <div className="p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">{idea.title}</p>

        {/* Attorney outreach: subject + body */}
        {isAtty ? (
          <>
            <div className="mb-2">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Subject</label>
              <div className="flex gap-2">
                <input type="text" value={idea.subject_line ?? ''} onChange={e => onSubjectEdit(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  placeholder="Email subject line…" />
                <button onClick={() => onCopy(idea.subject_line ?? '', '-subject')}
                  className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                  {copiedId === ownId + '-subject' ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            </div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Body</label>
            <textarea value={idea.body ?? ''} onChange={e => onBodyEdit(e.target.value)} rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-indigo-300 font-mono mb-2"
              placeholder="Email body…" />
            <button onClick={() => onCopy(idea.body ?? '', '-body')}
              className="px-4 py-2 text-xs font-semibold bg-[#1a1f36] text-white rounded-lg hover:bg-[#2d3561]">
              {copiedId === ownId + '-body' ? '✓ Copied!' : '📋 Copy Body'}
            </button>
          </>
        ) : (
          <>
            {/* Tone selector */}
            {!isPosted && (
              <div className="flex items-center gap-1 mb-2 flex-wrap">
                {TONES.map(t => (
                  <button key={t.id} onClick={() => onToneRewrite(t.id)} disabled={rewriting}
                    className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                      currentTone === t.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50`}>
                    {t.label}
                  </button>
                ))}
                {rewriting && <span className="text-xs text-indigo-500 animate-pulse ml-1">✨ Rewriting…</span>}
              </div>
            )}
            <textarea value={idea.body ?? ''} onChange={e => onBodyEdit(e.target.value)} rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-indigo-300 font-mono mb-1"
              placeholder="Content body — edit inline, auto-saves." />
            {/* Char counter */}
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs ${charColor}`}>
                {bodyLen.toLocaleString()}{charMax > 0 ? `/${charMax.toLocaleString()}` : ''} chars
                {charMax > 0 && charPct > 0.9 ? ' ⚠️' : ''}
                {charMax === 0 ? ` · ${charLimit}` : ''}
              </span>
              {CHAR_OPTIMAL[idea.channel] && (
                <span className="text-[10px] text-gray-400 italic">{CHAR_OPTIMAL[idea.channel]}</span>
              )}
            </div>
            {/* Hashtag section for social */}
            {isSocial && (
              <div className="mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={onGetHashtags} disabled={hashtagLoading}
                    className="px-3 py-1 text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50">
                    {hashtagLoading ? '⏳' : '# Get Hashtags'}
                  </button>
                  {hashtagList.length > 0 && (
                    <button onClick={() => onCopy(hashtagList.join(' '), '-tags')}
                      className="px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50">
                      📋 Copy Tags
                    </button>
                  )}
                </div>
                {hashtagList.length > 0 && (
                  <div className="flex flex-wrap gap-1 p-2 bg-purple-50 rounded-lg">
                    {hashtagList.map(h => (
                      <span key={h} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-mono cursor-pointer hover:bg-purple-200"
                        onClick={() => onCopy(h, '-onetag')}>
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => onCopy(idea.body ?? '', '')}
                className="px-3 py-1.5 text-xs font-semibold bg-[#1a1f36] text-white rounded-lg hover:bg-[#2d3561]">
                {copiedId === ownId ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
