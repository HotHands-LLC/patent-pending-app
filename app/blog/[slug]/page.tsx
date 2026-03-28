import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

interface Props { params: Promise<{ slug: string }> }

function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

const BASE_URL = 'https://patentpending.app'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { data } = await getSvc().from('blog_posts').select('title, seo_title, seo_description, excerpt, published_at').eq('slug', slug).eq('status', 'published').single()
  if (!data) return { title: 'Not found' }
  const title = data.seo_title ?? `${data.title} | patentpending.app`
  const description = data.seo_description ?? data.excerpt ?? ''
  const url = `${BASE_URL}/blog/${slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: data.seo_title ?? data.title,
      description,
      type: 'article',
      url,
      publishedTime: data.published_at ?? undefined,
      siteName: 'patentpending.app',
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const { data: post } = await getSvc().from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').single()
  if (!post) notFound()

  const { data: related } = await getSvc().from('blog_posts')
    .select('slug, title, published_at, read_time_minutes').eq('status', 'published')
    .eq('category', post.category).neq('slug', slug).order('published_at', { ascending: false }).limit(3)

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-lg font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
        <Link href="/blog" className="text-sm text-gray-500 hover:text-indigo-600">← Blog</Link>
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
            {post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
            {post.word_count ? ` · ${post.word_count.toLocaleString()} words` : ''}
          </p>

          {post.body_html ? (
            <div className="prose prose-sm sm:prose prose-headings:text-[#1a1f36] prose-a:text-indigo-600 max-w-none"
              dangerouslySetInnerHTML={{ __html: post.body_html }} />
          ) : (
            <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">{post.body_md}</div>
          )}

          {/* Schema.org Article JSON-LD */}
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: post.title,
            description: post.seo_description ?? post.excerpt ?? '',
            url: `${BASE_URL}/blog/${slug}`,
            datePublished: post.published_at,
            dateModified: post.updated_at ?? post.published_at,
            author: { '@type': 'Organization', name: 'patentpending.app', url: BASE_URL },
            publisher: {
              '@type': 'Organization',
              name: 'patentpending.app',
              url: BASE_URL,
              logo: { '@type': 'ImageObject', url: `${BASE_URL}/next.svg` },
            },
            mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}/blog/${slug}` },
          }) }} />
        </article>

        {/* Sidebar */}
        <aside className="space-y-6">
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
