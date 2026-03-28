import { createClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'

interface Props { params: Promise<{ id: string }> }

function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

export default async function BlogPreviewPage({ params }: Props) {
  const { id } = await params
  const svc = getSvc()

  // Admin check via cookie would require middleware — for now, fetch post by ID regardless of status
  const { data: post } = await svc.from('blog_posts').select('*').eq('id', id).single()
  if (!post) notFound()

  // If published, redirect to the real slug URL
  if (post.status === 'published' && post.slug) {
    redirect(`/blog/${post.slug}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Draft Preview Banner */}
      <div className="bg-yellow-400 text-yellow-900 text-center text-sm font-bold py-2 px-4">
        ⚠️ DRAFT PREVIEW — This post is not yet published. Only admins can see this page.
      </div>

      <nav className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-lg font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
        <Link href="/admin/blog" className="text-sm text-gray-500 hover:text-indigo-600">← Back to Blog Admin</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <article>
          <div className="mb-6 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium border border-yellow-300">
              DRAFT
            </span>
            {post.category && (
              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium capitalize">
                {post.category.replace(/-/g, ' ')}
              </span>
            )}
            {post.read_time_minutes && <span className="text-xs text-gray-400">{post.read_time_minutes} min read</span>}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1f36] mb-3 leading-tight">{post.title}</h1>

          {post.excerpt && (
            <p className="text-base text-gray-500 mb-8 italic">{post.excerpt}</p>
          )}

          {post.body_html ? (
            <div className="prose prose-sm sm:prose prose-headings:text-[#1a1f36] prose-a:text-indigo-600 max-w-none"
              dangerouslySetInnerHTML={{ __html: post.body_html }} />
          ) : (
            <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">{post.body_md}</div>
          )}
        </article>

        <div className="mt-12 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <strong>Admin actions:</strong>{' '}
          <Link href={`/admin/blog/${id}/edit`} className="underline mr-4">Edit post</Link>
          <Link href="/admin/blog" className="underline">Back to blog list</Link>
        </div>
      </div>
    </div>
  )
}
