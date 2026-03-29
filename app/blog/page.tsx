import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const metadata: Metadata = {
  title: 'Patent Filing Blog | patentpending.app',
  description: 'Guides, tips, and resources for independent inventors filing their own patents — without expensive attorneys.',
  openGraph: { title: 'Patent Filing Blog | patentpending.app', description: 'Practical guides for independent inventors.' },
}

async function getPosts() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  const { data } = await svc.from('blog_posts')
    .select('id, slug, title, excerpt, category, tags, published_at, read_time_minutes')
    .eq('status', 'published').order('published_at', { ascending: false }).limit(20)
  return data ?? []
}

export default async function BlogIndexPage() {
  const posts = await getPosts()
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-lg font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
        <Link href="/blog" className="text-sm text-indigo-600 font-semibold">Blog</Link>
      </nav>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-[#1a1f36] mb-2">Patent Filing Blog</h1>
          <p className="text-gray-500">Practical guides for independent inventors. No legal jargon.</p>
        </div>
        {posts.length === 0 ? (
          <p className="text-gray-400 text-center py-16">First posts coming soon.</p>
        ) : (
          <div className="space-y-6">
            {posts.map(post => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="block bg-white rounded-xl border border-gray-200 p-6 hover:border-indigo-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium capitalize">
                    {post.category?.replace(/-/g, ' ')}
                  </span>
                  {post.read_time_minutes && <span className="text-xs text-gray-400">{post.read_time_minutes} min read</span>}
                </div>
                <h2 className="text-lg font-bold text-[#1a1f36] mb-1 group-hover:text-indigo-600">{post.title}</h2>
                {post.excerpt && <p className="text-sm text-gray-500 leading-relaxed mb-3">{post.excerpt}</p>}
                <span className="text-xs text-gray-400">
                  {post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <footer className="border-t border-gray-200 bg-white py-8 text-center">
        <p className="text-sm text-gray-400">Ready to file your patent? <Link href="/" className="text-indigo-600 hover:underline">patentpending.app</Link> handles the hard part.</p>
      </footer>
    </div>
  )
}
