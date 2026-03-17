import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import BlogPostClient from './BlogPostClient'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { data: post } = await supabaseService
    .from('blog_posts')
    .select('title, summary, seo_title, seo_description, slug')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!post) return { title: 'Post Not Found' }

  const title = post.seo_title || post.title
  const description = post.seo_description || post.summary
  const url = `https://patentpending.app/blog/${post.slug}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const { data: post } = await supabaseService
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!post) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a1f36] text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">⚖️ PatentPending</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Back link */}
        <Link href="/blog" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-8">
          ← Back to Blog
        </Link>

        {/* Post header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {post.published_at && (
              <span className="text-sm text-gray-500">{formatDate(post.published_at)}</span>
            )}
            {post.tags?.map((tag: string) => (
              <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                {tag}
              </span>
            ))}
          </div>
        </header>

        {/* Post body — rendered client-side for react-markdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <BlogPostClient bodyMd={post.body_md} />
        </div>

        {/* CTA */}
        <div className="mt-10 bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <p className="text-gray-700 mb-3">Want to file your own patent?</p>
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try patentpending.app →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} PatentPending · <Link href="/" className="hover:text-gray-600">Home</Link> · <Link href="/blog" className="hover:text-gray-600">Blog</Link>
        </div>
      </div>
    </div>
  )
}
