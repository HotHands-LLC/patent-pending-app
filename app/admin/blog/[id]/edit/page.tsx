import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import BlogEditor from '../../BlogEditor'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditBlogPostPage({ params }: Props) {
  const { id } = await params
  const { data: post } = await supabaseService
    .from('blog_posts')
    .select('*')
    .eq('id', id)
    .single()

  if (!post) notFound()

  // Transform arrays to string for the editor form
  const initialData = {
    ...post,
    tags: Array.isArray(post.tags) ? post.tags.join(', ') : (post.tags ?? ''),
    source_urls: Array.isArray(post.source_urls) ? post.source_urls.join('\n') : (post.source_urls ?? ''),
  }

  return <BlogEditor initialData={initialData} />
}
