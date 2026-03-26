import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data } = await getSvc().from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').single()
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Related posts (same category, exclude self)
  const { data: related } = await getSvc().from('blog_posts')
    .select('slug, title, excerpt, published_at, read_time_minutes')
    .eq('status', 'published').eq('category', data.category).neq('slug', slug)
    .order('published_at', { ascending: false }).limit(3)
  return NextResponse.json({ post: data, related: related ?? [] })
}
