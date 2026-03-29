'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'
import { AdminPageStatus, type StatusItem } from '@/components/AdminPageStatus'

interface Post { id: string; slug: string; title: string; status: string; published_at: string | null; word_count: number | null; category: string | null; created_at: string }

export default function AdminBlogPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? ''
        setAuthToken(token)
        fetch('/api/admin/blog', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).then(d => { setPosts(d.posts ?? []); setLoading(false) })
      })
    })
  }, [router])

  async function setStatus(id: string, status: string) {
    const res = await fetch('/api/admin/blog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id, status }),
    })
    if (res.ok) { setPosts(prev => prev.map(p => p.id === id ? { ...p, status } : p)); showToast(`✅ ${status}`) }
  }

  const STATUS_COLORS: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', published: 'bg-green-100 text-green-700', archived: 'bg-red-50 text-red-500' }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
              <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link><span>/</span>
              <span className="text-[#1a1f36]">Blog</span>
            </div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">📝 Blog Management</h1>
          </div>
          <Link href="/blog" target="_blank" className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            View Blog →
          </Link>
        </div>
        <AdminPageStatus items={[
          { value: posts.filter(p => p.status === 'published').length, label: 'published', status: 'ok' },
          { value: posts.filter(p => p.status === 'draft').length, label: 'drafts', status: 'info' },
          { label: 'Next auto-post: Tue/Fri 6AM', status: 'info' },
        ]} />

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Words</th>
                <th className="px-4 py-3 text-left">Published</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {posts.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#1a1f36] max-w-xs truncate">{p.title}</div>
                    <div className="text-xs text-gray-400 font-mono">/blog/{p.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.word_count?.toLocaleString() ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.published_at ? new Date(p.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {p.status === 'draft' && <button onClick={() => setStatus(p.id, 'published')} className="text-xs px-2.5 py-1 bg-green-600 text-white rounded hover:bg-green-700">Publish</button>}
                      {p.status === 'published' && <button onClick={() => setStatus(p.id, 'draft')} className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded hover:bg-gray-50">Unpublish</button>}
                      {p.status !== 'archived' && <button onClick={() => setStatus(p.id, 'archived')} className="text-xs text-gray-300 hover:text-red-400 px-1.5">✕</button>}
                      <a
                        href={p.status !== 'published' ? `/blog/preview/${p.id}` : `/blog/${p.slug}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-indigo-500 hover:underline px-1"
                      >{p.status !== 'published' ? '👁 Preview Draft' : 'View'}</a>
                    </div>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">No posts yet. The blog writer cron publishes automatically Tue + Fri at 6AM CT.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg z-50">{toast}</div>}
    </div>
  )
}
