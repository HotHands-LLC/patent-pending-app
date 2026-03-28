import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'

interface Props { params: Promise<{ id: string }> }

function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

export const metadata: Metadata = {
  title: 'Draft Preview | patentpending.app',
  robots: { index: false, follow: false },
}

export default async function BlogDraftPreviewPage({ params }: Props) {
  const { id } = await params
  const svc = getSvc()

  // Fetch post by id — any status (admin view)
  const { data: post } = await svc.from('blog_posts').select('*').eq('id', id).single()
  if (!post) notFound()

  // If published, redirect to canonical slug URL
  if (post.status === 'published' && post.slug) {
    redirect(`/blog/${post.slug}`)
  }

  const { data: related } = await svc.from('blog_posts')
    .select('slug, title, published_at, read_time_minutes')
    .eq('status', 'published')
    .eq('category', post.category)
    .neq('id', id)
    .order('published_at', { ascending: false })
    .limit(3)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Draft Preview Banner */}
      <div className="bg-yellow-400 text-yellow-900 text-center py-2.5 px-4 font-bold text-sm sticky top-0 z-50 flex items-center justify-center gap-3 shadow">
        <span>⚠️ DRAFT PREVIEW</span>
        <span className="font-normal opacity-75">—</span>
        <span className="font-normal">This post is not published. Only admins can see this page.</span>
        <Link href="/admin/blog" className="ml-4 underline font-bold hover:text-yellow-700">
          ← Back to Blog Admin
        </Link>
      </div>

      <nav className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-lg font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
        <Link href="/blog" className="text-sm text-gray-500 hover:text-indigo-600">← Blog</Link>
        <span className="ml-auto text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-semibold uppercase tracking-wide">
          {post.status}
        </span>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <article className="lg:col-span-2">
          <div className="mb-6">
            <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium capitalize mr-2">
              {post.category?.replace(/-/g, ' ')}
            </span>
            {post.read_time_minutes && <span className="text-xs text-gray-400">{post.read_time_minutes} min read</span>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1f36] mb-3 leading-tight">{post.title}</h1>
          <p className="text-sm text-gray-400 mb-8">
            {post.published_at
              ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : <em>Not published yet</em>}
            {post.word_count ? ` · ${post.word_count.toLocaleString()} words` : ''}
          </p>

          {post.body_html ? (
            <div className="prose prose-sm sm:prose prose-headings:text-[#1a1f36] prose-a:text-indigo-600 max-w-none"
              dangerouslySetInnerHTML={{ __html: post.body_html }} />
          ) : (
            <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">{post.body_md}</div>
          )}
        </article>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
            <p className="font-bold text-sm text-yellow-800 mb-2">📋 Draft Info</p>
            <dl className="text-xs text-yellow-700 space-y-1">
              <div><dt className="inline font-semibold">Status: </dt><dd className="inline capitalize">{post.status}</dd></div>
              <div><dt className="inline font-semibold">Created: </dt><dd className="inline">{new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
              <div><dt className="inline font-semibold">Slug: </dt><dd className="inline font-mono break-all">/blog/{post.slug}</dd></div>
              {post.word_count && <div><dt className="inline font-semibold">Words: </dt><dd className="inline">{post.word_count.toLocaleString()}</dd></div>}
            </dl>
            <Link href={`/admin/blog/${post.id}/edit`}
              className="mt-3 block text-center px-4 py-2 bg-yellow-400 text-yellow-900 rounded-lg text-sm font-bold hover:bg-yellow-500 transition-colors">
              ✏️ Edit Post
            </Link>
          </div>

          <div className="bg-indigo-600 rounded-xl p-5 text-white">
            <p className="font-bold text-sm mb-2">Filing your own patent?</p>
            <p className="text-xs text-indigo-200 mb-4 leading-relaxed">patentpending.app handles the hard part — claims drafting, spec generation, filing checklist — for a fraction of attorney fees.</p>
            <Link href="/signup" className="block text-center px-4 py-2.5 bg-white text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors">
              Start for Free →
            </Link>
          </div>

          {(related ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-sm text-[#1a1f36] mb-3">Related Posts</h3>
              <div className="space-y-3">
                {(related ?? []).map(r => (
                  <Link key={r.slug} href={`/blog/${r.slug}`} className="block hover:text-indigo-600">
                    <p className="text-sm font-medium text-[#1a1f36] hover:text-indigo-600 leading-snug">{r.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.published_at ? new Date(r.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      {r.read_time_minutes ? ` · ${r.read_time_minutes} min` : ''}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
