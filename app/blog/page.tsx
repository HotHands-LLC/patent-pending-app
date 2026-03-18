import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Patent Intelligence — patentpending.app Blog',
  description: 'USPTO news, patent strategy, and AI patent guidance for inventors and attorneys.',
}

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

interface BlogPost {
  id: string
  slug: string
  title: string
  summary: string
  tags: string[]
  published_at: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
}

export default async function BlogIndexPage() {
  const { data: posts } = await supabaseService
    .from('blog_posts')
    .select('id, slug, title, summary, tags, published_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a1f36] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">⚖️ PatentPending</Link>
          <span className="text-xs text-gray-400">Patent Intelligence Blog</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Patent Intelligence</h1>
          <p className="text-gray-500">USPTO news, patent strategy, and AI patent guidance for inventors and attorneys.</p>
        </div>

        {!posts || posts.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No posts yet — check back soon.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(posts as BlogPost[]).map((post) => (
              <article key={post.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      <Link href={`/blog/${post.slug}`} className="hover:text-blue-600 transition-colors">
                        {post.title}
                      </Link>
                    </h2>
                    <p className="text-gray-600 text-sm leading-relaxed mb-4">{post.summary}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {post.tags?.map((tag) => (
                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {tag}
                        </span>
                      ))}
                      {post.published_at && (
                        <span className="text-xs text-gray-400 ml-auto">{formatDate(post.published_at)}</span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="flex-shrink-0 text-blue-600 hover:text-blue-700 font-medium text-sm whitespace-nowrap"
                  >
                    Read →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} PatentPending · <Link href="/" className="hover:text-gray-600">Home</Link>
        </div>
      </div>
    </div>
  )
}
