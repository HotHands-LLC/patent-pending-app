import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

/** GET /api/blog?limit=10&offset=0 — public published posts */
export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '12')
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0')
  const { data, count } = await getSvc()
    .from('blog_posts')
    .select('id, slug, title, excerpt, category, tags, published_at, read_time_minutes, word_count', { count: 'exact' })
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)
  return NextResponse.json({ posts: data ?? [], total: count ?? 0 })
}
