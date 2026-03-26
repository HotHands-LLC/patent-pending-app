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
  'Amazon':    '2,000 char description',
  'Attorney Outreach': 'Email — no limit',
}

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
    }
  }, [])

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
              <h2 className="font-bold text-[#1a1f36]">📄 Content Cards</h2>
              <button onClick={generateAttorneyOutreach} disabled={generatingAttorney}
                className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">
                {generatingAttorney ? '⏳ Drafting…' : '⚖️ Generate Attorney Outreach'}
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {contentCards.map(idea => (
                <ContentCard key={idea.id} idea={idea}
                  onBodyEdit={v => handleBodyEdit(idea.id, v)}
                  onSubjectEdit={v => handleSubjectEdit(idea.id, v)}
                  onCopy={(text, label) => copyText(idea.id, text, label)}
                  onDownload={() => download(idea)}
                  onMarkPosted={() => markPosted(idea.id)}
                  onDelete={() => deleteIdea(idea.id)}
                  copiedId={copiedId}
                  ownId={idea.id}
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

// ── ContentCard ───────────────────────────────────────────────────────────────
function ContentCard({ idea, onBodyEdit, onSubjectEdit, onCopy, onDownload, onMarkPosted, onDelete, copiedId, ownId }: {
  idea: Idea
  onBodyEdit: (v: string) => void
  onSubjectEdit: (v: string) => void
  onCopy: (text: string, label: string) => void
  onDownload: () => void
  onMarkPosted: () => void
  onDelete: () => void
  copiedId: string | null
  ownId: string
}) {
  const isAtty = idea.channel === 'Attorney Outreach'
  const charLimit = CHAR_LIMITS[idea.channel] ?? ''
  const bodyLen = (idea.body ?? '').length
  const isPosted = idea.status === 'posted'

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
            <textarea value={idea.body ?? ''} onChange={e => onBodyEdit(e.target.value)} rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-indigo-300 font-mono mb-2"
              placeholder="Content body — edit inline, auto-saves." />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{bodyLen.toLocaleString()} chars · {charLimit}</span>
              <div className="flex gap-2">
                <button onClick={() => onCopy(idea.body ?? '', '')}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#1a1f36] text-white rounded-lg hover:bg-[#2d3561]">
                  {copiedId === ownId ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
