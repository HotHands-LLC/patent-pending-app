'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase, getDaysUntil, getUrgencyBadge } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatentDeadlineRow {
  id: string
  deadline_type: string
  due_date: string
  status: 'pending' | 'completed' | 'missed' | 'extended'
  notes: string | null
  patents: { title: string; id: string }
}

interface BlogPost {
  id: string
  title: string
  slug: string
  status: string
  published_at: string | null
  word_count: number | null
  category: string | null
  created_at: string
}

interface ContentItem {
  id: string
  source: 'marketing_ideas' | 'social_post_log'
  platform: string
  title: string
  body: string | null
  status: string
  posted_at: string | null
}

interface RadarLead {
  id: string
  source: string
  post_url: string
  post_title: string
  post_body: string | null
  draft_reply: string | null
  status: string
  score: number
  found_at: string
}

// ── Platform helpers ──────────────────────────────────────────────────────────

/** Platforms we can post to directly (must match integration_credentials.service) */
const DIRECT_POST_PLATFORMS: Record<string, string> = {
  Facebook: 'facebook',
  LinkedIn: 'linkedin',
}

const PLATFORM_ORDER = ['Reddit', 'LinkedIn', 'TikTok', 'Instagram', 'Facebook']
const PLATFORM_COLORS: Record<string, string> = {
  Reddit:    'bg-orange-100 text-orange-700 border-orange-200',
  LinkedIn:  'bg-blue-100 text-blue-700 border-blue-200',
  TikTok:    'bg-pink-100 text-pink-700 border-pink-200',
  Instagram: 'bg-purple-100 text-purple-700 border-purple-200',
  Facebook:  'bg-blue-100 text-blue-800 border-blue-300',
}
const PLATFORM_ICONS: Record<string, string> = {
  Reddit: '🔴', LinkedIn: '💼', TikTok: '🎵', Instagram: '📸', Facebook: '📘',
}

function platformSort(a: ContentItem, b: ContentItem) {
  const ai = PLATFORM_ORDER.indexOf(a.platform)
  const bi = PLATFORM_ORDER.indexOf(b.platform)
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const show = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }
  return { toast, show }
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h2 className="font-bold text-[#1a1f36] text-base">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const router = useRouter()
  const { toast, show: showToast } = useToast()
  const [authToken, setAuthToken] = useState('')
  const [loading, setLoading] = useState(true)

  // Section data
  const [deadlines, setDeadlines] = useState<PatentDeadlineRow[]>([])
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([])
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [radarLeads, setRadarLeads] = useState<RadarLead[]>([])

  // Active OAuth platform connections (service names that are connected + active)
  const [activeConnections, setActiveConnections] = useState<Set<string>>(new Set())

  // Action states
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [skippingId, setSkippingId] = useState<string | null>(null)
  const [markingPostedId, setMarkingPostedId] = useState<string | null>(null)
  const [markingRepliedId, setMarkingRepliedId] = useState<string | null>(null)
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [postingDirectlyId, setPostingDirectlyId] = useState<string | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (token: string) => {
    // Load active OAuth integrations for direct-post gating
    try {
      const intgRes = await fetch('/api/integrations', { headers: { Authorization: `Bearer ${token}` } })
      if (intgRes.ok) {
        const intgData = await intgRes.json()
        const active = new Set<string>(
          (intgData.integrations ?? [])
            .filter((i: { service: string; is_active: boolean }) => i.is_active)
            .map((i: { service: string }) => i.service),
        )
        setActiveConnections(active)
      }
    } catch { /* non-blocking */ }

    // Patent deadlines — next 90 days, pending only
    const { data: dl } = await supabase
      .from('patent_deadlines')
      .select('id, deadline_type, due_date, status, notes, patents(title, id)')
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(20)
    setDeadlines((dl ?? []) as unknown as PatentDeadlineRow[])

    // Blog queue — draft or scheduled, next 3
    const res = await fetch('/api/admin/blog', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      const queue = (d.posts ?? []).filter((p: BlogPost) =>
        p.status === 'draft' || p.status === 'scheduled'
      ).slice(0, 3)
      setBlogPosts(queue)
    }

    // Content ready to post — marketing_ideas
    const { data: ideas } = await supabase
      .from('marketing_ideas')
      .select('id, channel, title, body, status, posted_at')
      .eq('status', 'ready')
      .is('posted_at', null)
      .order('created_at', { ascending: true })
    const ideaItems: ContentItem[] = (ideas ?? []).map(i => ({
      id: `idea-${i.id}`,
      source: 'marketing_ideas' as const,
      platform: i.channel ?? 'Unknown',
      title: i.title,
      body: i.body,
      status: i.status,
      posted_at: i.posted_at,
      _rawId: i.id,
    } as ContentItem & { _rawId: string }))

    // Content ready to post — social_post_log
    const { data: posts } = await supabase
      .from('social_post_log')
      .select('id, platform, title, content, status, posted_at')
      .eq('status', 'ready')
      .is('posted_at', null)
      .order('created_at', { ascending: true })
    const postItems: ContentItem[] = (posts ?? []).map(p => ({
      id: `log-${p.id}`,
      source: 'social_post_log' as const,
      platform: p.platform ?? 'Unknown',
      title: p.title ?? '',
      body: p.content,
      status: p.status,
      posted_at: p.posted_at,
      _rawId: p.id,
    } as ContentItem & { _rawId: string }))

    const combined = [...ideaItems, ...postItems].sort(platformSort)
    setContentItems(combined)

    // Radar leads — not yet replied/dismissed, with draft_reply
    const { data: radar } = await supabase
      .from('community_radar_leads')
      .select('id, source, post_url, post_title, post_body, draft_reply, status, score, found_at')
      .not('status', 'in', '("replied","dismissed")')
      .order('score', { ascending: false })
      .limit(20)
    setRadarLeads(radar ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? ''
        setAuthToken(token)
        loadAll(token).finally(() => setLoading(false))
      })
    })
  }, [router, loadAll])

  // ── Blog actions ───────────────────────────────────────────────────────────

  async function publishPost(id: string) {
    setPublishingId(id)
    try {
      const res = await fetch('/api/admin/blog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id, status: 'published' }),
      })
      if (res.ok) {
        setBlogPosts(prev => prev.filter(p => p.id !== id))
        showToast('🚀 Post published!')
      }
    } finally { setPublishingId(null) }
  }

  async function skipPost(id: string) {
    setSkippingId(id)
    try {
      const res = await fetch('/api/admin/blog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id, status: 'skipped' }),
      })
      if (res.ok) {
        setBlogPosts(prev => prev.filter(p => p.id !== id))
        showToast('⏭️ Post skipped')
      }
    } finally { setSkippingId(null) }
  }

  // ── Content actions ────────────────────────────────────────────────────────

  async function markPosted(item: ContentItem & { _rawId?: string }) {
    const rawId = (item as unknown as { _rawId: string })._rawId ?? item.id
    setMarkingPostedId(item.id)
    try {
      if (item.source === 'marketing_ideas') {
        await supabase.from('marketing_ideas')
          .update({ status: 'posted', posted_at: new Date().toISOString() })
          .eq('id', rawId)
      } else {
        await supabase.from('social_post_log')
          .update({ status: 'posted', posted_at: new Date().toISOString() })
          .eq('id', rawId)
      }
      setContentItems(prev => prev.filter(c => c.id !== item.id))
      showToast('📤 Marked as posted!')
    } finally { setMarkingPostedId(null) }
  }

  async function copyContent(item: ContentItem) {
    await navigator.clipboard.writeText(item.body ?? item.title)
    showToast('📋 Copied!')
  }

  async function postDirectly(item: ContentItem & { _rawId?: string }) {
    const rawId = (item as unknown as { _rawId: string })._rawId ?? item.id
    const serviceName = DIRECT_POST_PLATFORMS[item.platform]
    if (!serviceName) return
    setPostingDirectlyId(item.id)
    try {
      const res = await fetch('/api/social/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ platform: serviceName, content: item.body ?? item.title }),
      })
      const data = await res.json()
      if (data.success) {
        // Auto-mark as posted
        if (item.source === 'marketing_ideas') {
          await supabase.from('marketing_ideas')
            .update({ status: 'posted', posted_at: new Date().toISOString() })
            .eq('id', rawId)
        } else {
          await supabase.from('social_post_log')
            .update({ status: 'posted', posted_at: new Date().toISOString() })
            .eq('id', rawId)
        }
        setContentItems(prev => prev.filter(c => c.id !== item.id))
        if (data.post_url) {
          showToast(`🚀 Posted! View it → ${data.post_url}`)
        } else {
          showToast(`🚀 Posted to ${item.platform}!`)
        }
      } else {
        showToast(`❌ ${data.error ?? 'Post failed'}`)
      }
    } catch {
      showToast('❌ Network error — post failed')
    } finally {
      setPostingDirectlyId(null)
    }
  }

  // ── Radar actions ──────────────────────────────────────────────────────────

  async function markReplied(id: string) {
    setMarkingRepliedId(id)
    try {
      await supabase.from('community_radar_leads')
        .update({ status: 'replied', replied_at: new Date().toISOString() })
        .eq('id', id)
      setRadarLeads(prev => prev.filter(l => l.id !== id))
      showToast('✅ Marked as replied!')
    } finally { setMarkingRepliedId(null) }
  }

  async function dismissLead(id: string) {
    setDismissingId(id)
    try {
      await supabase.from('community_radar_leads')
        .update({ status: 'dismissed' })
        .eq('id', id)
      setRadarLeads(prev => prev.filter(l => l.id !== id))
      showToast('🚫 Dismissed')
    } finally { setDismissingId(null) }
  }

  async function copyReply(lead: RadarLead) {
    await navigator.clipboard.writeText(lead.draft_reply ?? '')
    showToast('📋 Reply copied!')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading Mission Control…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link>
            <span>/</span>
            <span className="text-[#1a1f36]">Mission Control</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1a1f36]">🎯 Mission Control</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* ── Section 1: Patent Deadlines ──────────────────────────────────── */}
        <Section title="⚖️ Patent Deadlines">
          {deadlines.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No upcoming deadlines. You&apos;re clear! 🎉</p>
          ) : (
            <div className="space-y-3">
              {deadlines.map(d => {
                const days = getDaysUntil(d.due_date)
                return (
                  <div key={d.id} className="flex items-center justify-between gap-4 border border-gray-100 rounded-xl p-4 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#1a1f36] truncate">{d.patents?.title ?? 'Unknown Patent'}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {d.deadline_type.replace(/_/g, ' ')} · Due {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {d.notes && <p className="text-xs text-gray-500 mt-0.5">{d.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getUrgencyBadge(days)}`}>
                        {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'TODAY' : `${days}d`}
                      </span>
                      <a
                        href="https://patentcenter.uspto.gov"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-[#1a1f36] text-white text-xs font-semibold rounded-lg hover:bg-[#2d3561] whitespace-nowrap"
                      >
                        File Now →
                      </a>
                      <a
                        href="tel:8065496480"
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 whitespace-nowrap"
                      >
                        📞 Text Steve
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── Section 2: Blog Queue ────────────────────────────────────────── */}
        <Section title="📝 Blog Queue">
          {blogPosts.length < 3 && (
            <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${blogPosts.length === 0 ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
              ⚠️ Only {blogPosts.length} post{blogPosts.length !== 1 ? 's' : ''} queued — schedule more content!
            </div>
          )}
          {blogPosts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No draft or scheduled posts. <Link href="/admin/blog/new" className="text-indigo-600 hover:underline">Write one →</Link></p>
          ) : (
            <div className="space-y-3">
              {blogPosts.map(post => (
                <div key={post.id} className="flex items-center justify-between gap-4 border border-gray-100 rounded-xl p-4 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#1a1f36] truncate">{post.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {post.status}
                      </span>
                      {post.word_count && <span className="text-xs text-gray-400">{post.word_count} words</span>}
                      {post.category && <span className="text-xs text-gray-400">· {post.category}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/admin/blog/${post.id}/edit`} className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
                      Edit
                    </Link>
                    <button
                      onClick={() => publishPost(post.id)}
                      disabled={publishingId === post.id}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                    >
                      {publishingId === post.id ? '⏳' : '🚀 Publish Now'}
                    </button>
                    <button
                      onClick={() => skipPost(post.id)}
                      disabled={skippingId === post.id}
                      className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {skippingId === post.id ? '⏳' : 'Skip'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link href="/admin/blog" className="text-xs text-indigo-600 hover:underline">View all blog posts →</Link>
          </div>
        </Section>

        {/* ── Section 3: Content Ready to Post ────────────────────────────── */}
        <Section title="📣 Content Ready to Post">
          {contentItems.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No content ready to post. <Link href="/admin/marketing" className="text-indigo-600 hover:underline">Generate some →</Link></p>
          ) : (
            <div className="space-y-3">
              {contentItems.map(item => {
                const rawId = (item as unknown as { _rawId: string })._rawId ?? item.id
                const color = PLATFORM_COLORS[item.platform] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                const icon = PLATFORM_ICONS[item.platform] ?? '📱'
                const charCount = (item.body ?? '').length
                return (
                  <div key={item.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${color}`}>
                          {icon} {item.platform}
                        </span>
                        <p className="text-sm font-semibold text-[#1a1f36] truncate">{item.title}</p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{charCount.toLocaleString()} chars</span>
                    </div>
                    {item.body && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3">{item.body}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => copyContent(item)}
                        className="px-3 py-1.5 bg-[#1a1f36] text-white text-xs font-semibold rounded-lg hover:bg-[#2d3561]"
                      >
                        📋 Copy
                      </button>
                      {/* "Post Directly" — only shown if this platform has an active OAuth connection */}
                      {DIRECT_POST_PLATFORMS[item.platform] && activeConnections.has(DIRECT_POST_PLATFORMS[item.platform]) && (
                        <button
                          onClick={() => postDirectly({ ...item, _rawId: rawId } as ContentItem & { _rawId: string })}
                          disabled={postingDirectlyId === item.id}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {postingDirectlyId === item.id ? '⏳ Posting…' : `🚀 Post to ${item.platform}`}
                        </button>
                      )}
                      <button
                        onClick={() => markPosted({ ...item, _rawId: rawId } as ContentItem & { _rawId: string })}
                        disabled={markingPostedId === item.id}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {markingPostedId === item.id ? '⏳' : '✅ Mark Posted'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link href="/admin/marketing" className="text-xs text-indigo-600 hover:underline">View Marketing Command Center →</Link>
          </div>
        </Section>

        {/* ── Section 4: Community Radar — Replies Needing Approval ────────── */}
        <Section title="📡 Community Radar — Replies Needing Approval">
          {radarLeads.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No draft replies pending. All clear! ✅</p>
          ) : (
            <div className="space-y-3">
              {radarLeads.map(lead => {
                const sourceColor = lead.source === 'reddit' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                const sourceIcon = lead.source === 'reddit' ? '🔴' : '⚡'
                const truncTitle = lead.post_title.length > 80 ? lead.post_title.slice(0, 77) + '…' : lead.post_title
                return (
                  <div key={lead.id} className={`border rounded-xl p-4 ${lead.score >= 80 ? 'border-red-100 bg-red-50/30' : 'border-gray-100'}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${sourceColor}`}>
                            {sourceIcon} {lead.source === 'reddit' ? 'Reddit' : 'HN'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${lead.score >= 80 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {lead.score}/100
                          </span>
                        </div>
                        <a
                          href={lead.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-[#1a1f36] hover:text-indigo-600"
                        >
                          {truncTitle}
                        </a>
                      </div>
                    </div>

                    {lead.draft_reply && (
                      <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Draft Reply</p>
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-4">{lead.draft_reply}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {lead.draft_reply && (
                        <button
                          onClick={() => copyReply(lead)}
                          className="px-3 py-1.5 bg-[#1a1f36] text-white text-xs font-semibold rounded-lg hover:bg-[#2d3561]"
                        >
                          📋 Copy Reply
                        </button>
                      )}
                      <button
                        onClick={() => markReplied(lead.id)}
                        disabled={markingRepliedId === lead.id}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {markingRepliedId === lead.id ? '⏳' : '✅ Mark Replied'}
                      </button>
                      <button
                        onClick={() => dismissLead(lead.id)}
                        disabled={dismissingId === lead.id}
                        className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        {dismissingId === lead.id ? '⏳' : '🚫 Dismiss'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link href="/admin/marketing#radar" className="text-xs text-indigo-600 hover:underline">View full Community Radar →</Link>
          </div>
        </Section>

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
